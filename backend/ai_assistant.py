import os
import json
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

load_dotenv()
logger = logging.getLogger("print2go.assistant")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# provider -> UI label + concrete model
PROVIDERS = {
    "anthropic": {"label": "Claude", "model": "claude-sonnet-4-6"},
    "openai": {"label": "ChatGPT", "model": "gpt-5.6-sol"},
    "gemini": {"label": "Gemini", "model": "gemini-3-flash-preview"},
}
DEFAULT_PROVIDER = "anthropic"

SYSTEM_TEMPLATE = """You are the Print2Go Production Assistant, an AI helper embedded in Print2Go OS — a print-production orchestration system for Print2Go London (London, Ontario, Canada). You help production staff by answering questions about live orders, exceptions, recipes, machines and system status.

RULES:
- Answer ONLY from the LIVE DATA provided below. If the answer is not in the data, say clearly that you don't have that information.
- Be concise and practical. Prefer short paragraphs and bullet lists. Reference order numbers exactly (e.g. #58311).
- This system is SIMULATION ONLY — physical printing is unavailable (REAL_FIERY_BACKEND = NOT_IMPLEMENTED). Never claim a job was printed, released, or that a device is online unless the LIVE DATA explicitly says so.
- Currency is CAD.
- When asked what is blocking an order, look at its status/step and any matching open exception (by order number).

LIVE DATA (snapshot at {now}):
{context}

CONVERSATION SO FAR:
{history}
"""


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


class ChatIn(BaseModel):
    session_id: str
    message: str
    provider: str = DEFAULT_PROVIDER


async def _build_context(db) -> str:
    orders = await db.orders.find({"is_test": {"$ne": True}}, {"_id": 0}).sort("updated_at", -1).to_list(80)
    open_exc = await db.exceptions.find({"resolved": {"$ne": True}}, {"_id": 0}).to_list(80)
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(50)
    machines = await db.machines.find({}, {"_id": 0}).to_list(50)

    def o_line(o):
        return (f"{o.get('order_number')} | {o.get('product_name')} | status={o.get('status')} | "
                f"step={o.get('current_step') or '-'} | qty={o.get('quantity')} | priority={o.get('priority')} | "
                f"customer={o.get('customer') or '-'} | recipe={o.get('recipe_name') or '-'}")

    def e_line(e):
        return (f"{e.get('order_ref')} | {e.get('product') or '-'} | issue={e.get('issue')} | "
                f"severity={e.get('severity')}")

    def r_line(r):
        return f"{r.get('name')} | product={r.get('product') or '-'} | status={r.get('status')}"

    def m_line(m):
        return f"{m.get('name')} | {m.get('type')} | status={m.get('status')} | util={m.get('utilization')}%"

    parts = []
    parts.append(f"ORDERS ({len(orders)}):\n" + ("\n".join(o_line(o) for o in orders) or "(none)"))
    parts.append(f"\nOPEN EXCEPTIONS ({len(open_exc)}):\n" + ("\n".join(e_line(e) for e in open_exc) or "(none)"))
    parts.append(f"\nRECIPES ({len(recipes)}):\n" + ("\n".join(r_line(r) for r in recipes) or "(none)"))
    parts.append(f"\nMACHINES (inventory statuses — not live telemetry) ({len(machines)}):\n" + ("\n".join(m_line(m) for m in machines) or "(none)"))
    return "\n".join(parts)


def build_ai_router(db):
    router = APIRouter(prefix="/api/assistant")

    @router.get("/providers")
    async def providers():
        return {
            "providers": [{"id": k, "label": v["label"], "model": v["model"]} for k, v in PROVIDERS.items()],
            "default": DEFAULT_PROVIDER,
        }

    @router.get("/history")
    async def history(session_id: str):
        return await db.assistant_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(500)

    @router.delete("/history")
    async def clear_history(session_id: str):
        await db.assistant_messages.delete_many({"session_id": session_id})
        return {"ok": True}

    @router.post("/chat")
    async def chat(body: ChatIn):
        if body.provider not in PROVIDERS:
            raise HTTPException(400, "Unknown provider")
        if not EMERGENT_LLM_KEY:
            raise HTTPException(500, "LLM key not configured")
        if not body.message.strip():
            raise HTTPException(400, "Empty message")

        model = PROVIDERS[body.provider]["model"]

        # conversation history BEFORE this turn (last 10 messages)
        prior = await db.assistant_messages.find({"session_id": body.session_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
        prior = prior[-10:]
        hist_text = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in prior) or "(none)"

        # persist user message
        await db.assistant_messages.insert_one({
            "id": str(uuid.uuid4()), "session_id": body.session_id, "role": "user",
            "content": body.message, "provider": body.provider, "model": model, "created_at": _now_iso(),
        })

        context = await _build_context(db)
        system_message = SYSTEM_TEMPLATE.format(now=_now_iso(), context=context, history=hist_text)

        chat_obj = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=body.session_id,
            system_message=system_message,
        ).with_model(body.provider, model)

        async def gen():
            full = ""
            try:
                async for ev in chat_obj.stream_message(UserMessage(text=body.message)):
                    if isinstance(ev, TextDelta):
                        full += ev.content
                        yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                    elif isinstance(ev, StreamDone):
                        break
            except Exception as e:
                logger.error(f"LLM stream error ({body.provider}/{model}): {e}")
                yield f"data: {json.dumps({'error': 'AI request failed. Try another model or ask again.'})}\n\n"
            if full.strip():
                await db.assistant_messages.insert_one({
                    "id": str(uuid.uuid4()), "session_id": body.session_id, "role": "assistant",
                    "content": full, "provider": body.provider, "model": model, "created_at": _now_iso(),
                })
            yield f"data: {json.dumps({'done': True})}\n\n"

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return router
