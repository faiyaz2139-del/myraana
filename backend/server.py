from fastapi import FastAPI, APIRouter, HTTPException, Body
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any
import uuid
from datetime import datetime, timezone, date, timedelta
from production import build_router as build_production_router, seed_production, EDGE_HEARTBEAT_TIMEOUT_S

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Print2Go Production OS")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("print2go")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


# ---------------------- Models ----------------------
class Order(BaseModel):
    id: str = Field(default_factory=new_id)
    order_number: str
    product_name: str
    product_spec: str = ""
    category: str = "general"
    quantity: int = 0
    status: str = "waiting"  # ready, running, waiting, exception, completed
    current_step: str = ""
    location: str = "Print2Go London"
    priority: str = "normal"  # low, normal, high, rush
    customer: str = ""
    recipe_id: str = ""
    recipe_name: str = ""
    stage_index: int = 0
    events: List[dict] = []
    updated_at: str = Field(default_factory=now_iso)
    created_at: str = Field(default_factory=now_iso)


class OrderCreate(BaseModel):
    product_name: str
    product_spec: str = ""
    category: str = "general"
    quantity: int = 0
    status: str = "waiting"
    current_step: str = ""
    location: str = "Print2Go London"
    priority: str = "normal"
    customer: str = ""


class OrderUpdate(BaseModel):
    product_name: Optional[str] = None
    product_spec: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[int] = None
    status: Optional[str] = None
    current_step: Optional[str] = None
    priority: Optional[str] = None
    customer: Optional[str] = None
    recipe_id: Optional[str] = None
    recipe_name: Optional[str] = None
    stage_index: Optional[int] = None


class Product(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    category: str = "general"
    description: str = ""
    variants: List[str] = []
    base_price: float = 0.0
    lead_time_days: int = 3
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class ProductCreate(BaseModel):
    name: str
    category: str = "general"
    description: str = ""
    variants: List[str] = []
    base_price: float = 0.0
    lead_time_days: int = 3
    active: bool = True


class Recipe(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    product: str = ""
    description: str = ""
    materials: List[str] = []
    machines: List[str] = []
    processes: List[str] = []
    steps: List[str] = []
    source: str = "manual"  # manual, sop, pdf, chat, ai
    status: str = "DRAFT"   # DRAFT | ACTIVE (production recipes)
    review_status: str = "OK"  # OK | CONFIGURATION_REQUIRED | REVIEW_REQUIRED
    version: str = "v1"
    recipe_id: str = ""
    product_code: str = ""
    tenant: str = "Print2Go"
    location: str = ""
    provenance: dict = {}
    extraction_model: str = ""
    created_at: str = Field(default_factory=now_iso)


class RecipeCreate(BaseModel):
    name: str
    product: str = ""
    description: str = ""
    materials: List[str] = []
    machines: List[str] = []
    processes: List[str] = []
    steps: List[str] = []
    source: str = "manual"


class RecipeImportRequest(BaseModel):
    source_type: str = "chat"  # sop, pdf, chat
    content: str
    save: bool = True


class Process(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    description: str = ""
    machine: str = ""
    stage: str = "prepress"  # prepress, print, finishing, dispatch
    duration_minutes: int = 30
    order_index: int = 0


class ProcessCreate(BaseModel):
    name: str
    description: str = ""
    machine: str = ""
    stage: str = "prepress"
    duration_minutes: int = 30
    order_index: int = 0


class Machine(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    type: str = "printer"
    model: str = ""
    status: str = "online"  # online, offline, maintenance
    location: str = "Print2Go London"
    utilization: int = 0


class MachineCreate(BaseModel):
    name: str
    type: str = "printer"
    model: str = ""
    status: str = "online"
    location: str = "Print2Go London"
    utilization: int = 0


class SimpleCreate(BaseModel):
    data: dict


# ---------------------- Helpers ----------------------
async def insert_doc(collection, obj: BaseModel):
    await db[collection].insert_one(obj.model_dump())
    return obj


async def list_docs(collection, query=None, sort_field="created_at", limit=1000):
    q = query or {}
    cursor = db[collection].find(q, {"_id": 0})
    docs = await cursor.to_list(limit)
    return docs


# ---------------------- Authoritative status / reconciliation ----------------------
def compute_agent_state(a):
    """Single authoritative agent-availability policy: derived from real HMAC heartbeats."""
    if not a:
        return "NOT_CONFIGURED"
    hb = a.get("last_heartbeat")
    recent = False
    if hb:
        try:
            recent = datetime.now(timezone.utc) - datetime.fromisoformat(hb) <= timedelta(seconds=EDGE_HEARTBEAT_TIMEOUT_S)
        except Exception:
            recent = False
    real_online = bool(a.get("real_online") and a.get("agent_kind") == "REAL" and recent)
    if real_online:
        return "ONLINE"
    if recent:
        return "SIMULATED"   # a non-authenticated / mock heartbeat is never truly ONLINE
    if hb:
        return "STALE"
    return "OFFLINE"


async def reconcile_exceptions(db):
    """Canonical rule: an order needs attention iff it has >=1 unresolved exception record.
    Keeps order.status in sync without ever auto-marking an order Ready/Completed."""
    open_exc = await db.exceptions.find({"resolved": {"$ne": True}}, {"_id": 0}).to_list(2000)
    open_refs = {e.get("order_ref") for e in open_exc if e.get("order_ref")}
    # orders with an open exception -> exception status (preserve current_step)
    for ref in open_refs:
        await db.orders.update_many(
            {"order_number": ref, "status": {"$ne": "exception"}},
            {"$set": {"status": "exception", "updated_at": now_iso()}})
    # orders flagged exception but with no open exception -> recompute to a safe non-ready state
    async for o in db.orders.find({"status": "exception"}, {"_id": 0}):
        if o.get("order_number") not in open_refs:
            await db.orders.update_one({"id": o["id"]}, {"$set": {
                "status": "waiting", "current_step": "Awaiting review", "updated_at": now_iso()}})


# ---------------------- Dashboard ----------------------
@api_router.get("/")
async def root():
    return {"message": "Print2Go Production OS API"}


@api_router.get("/dashboard/stats")
async def dashboard_stats():
    await reconcile_exceptions(db)
    orders = await db.orders.find({"is_test": {"$ne": True}}, {"_id": 0}).to_list(2000)
    non_test_refs = {o["order_number"] for o in orders}
    total = len(orders)
    in_production = len([o for o in orders if o["status"] == "running"])

    # need_attention derives from the SAME source as the Exceptions page: unresolved exception records
    open_exc = await db.exceptions.find({"resolved": {"$ne": True}}, {"_id": 0}).to_list(2000)
    open_exc = [e for e in open_exc if not e.get("is_test") and e.get("order_ref") in non_test_refs]
    attention_orders = {e["order_ref"] for e in open_exc}
    need_attention = len(attention_orders)

    today = date.today().isoformat()
    completed_today = len([o for o in orders if o["status"] == "completed" and o.get("updated_at", "").startswith(today)])
    if completed_today == 0:
        completed_today = len([o for o in orders if o["status"] == "completed"])
    return {
        "total_orders": {"value": total, "trend": 12, "direction": "up"},
        "in_production": {"value": in_production, "trend": 33, "direction": "up"},
        "need_attention": {"value": need_attention, "trend": 0, "direction": "up"},
        "completed_today": {"value": completed_today, "trend": 50, "direction": "up"},
        "open_exceptions": len(open_exc),
    }


@api_router.get("/system-status")
async def system_status():
    """Single authoritative status source shared by Dashboard, Machines, Edge Agents & Diagnostics.
    Agent availability comes from real heartbeats; a device is only ONLINE with fresh device-specific evidence."""
    agent = await db.prod_edge_agents.find_one({"agent_id": "P2G-LONDON-EDGE-01"}, {"_id": 0})
    agent_state = compute_agent_state(agent)
    agent_online = agent_state == "ONLINE"
    agent_hb = (agent or {}).get("last_heartbeat")

    # Device (PX300 / London BC) status requires fresh evidence from a connected agent's discovery
    disc = None
    if agent_online:
        disc = await db.prod_edge_actions.find_one(
            {"agent_id": "P2G-LONDON-EDGE-01", "action": "DISCOVER_CAPABILITIES", "status": "SUCCEEDED"},
            {"_id": 0}, sort=[("result_at", -1)])

    if not agent_online:
        px_status, px_checked, px_src = "UNKNOWN", None, "no connected agent"
    elif not disc:
        px_status, px_checked, px_src = "UNKNOWN", None, "no discovery evidence"
    else:
        reach = (((disc.get("result") or {}).get("report") or {}).get("px300") or {}).get("reachable", "UNKNOWN")
        px_checked = disc.get("result_at")
        px_status = "ONLINE" if reach is True else ("UNREACHABLE" if reach is False else "UNKNOWN")
        px_src = "agent TCP probe (read-only)"

    items = [
        {"id": "loc-london", "name": "Print2Go London (Location)", "type": "location",
         "status": "ONLINE" if agent_online else "UNKNOWN", "last_checked": agent_hb,
         "evidence": "edge agent heartbeat"},
        {"id": "agent-london-01", "name": "Edge Agent (P2G-LONDON-EDGE-01)", "type": "agent",
         "status": agent_state, "last_checked": agent_hb,
         "evidence": "HMAC-authenticated heartbeat (30s window)"},
        {"id": "fiery-px300", "name": "Fiery PX300", "type": "machine",
         "status": px_status, "last_checked": px_checked, "evidence": px_src},
        {"id": "london-bc", "name": "London BC Imposition", "type": "integration",
         "status": px_status if agent_online else "UNKNOWN", "last_checked": px_checked,
         "evidence": "requires agent discovery"},
    ]
    online = sum(1 for i in items if i["status"] == "ONLINE")
    total = len(items)
    if agent_online and online == total:
        summary, level = "All Systems Operational", "ok"
    elif not agent_online:
        summary, level = "Edge Agent offline — device status unknown", "critical"
    else:
        summary, level = "Partially operational", "warn"
    return {
        "items": items, "summary": summary, "level": level, "online": online, "total": total,
        "production_mode": "SIMULATION",
        "production_note": "Simulation only — physical printing unavailable (REAL_FIERY_BACKEND = NOT_IMPLEMENTED).",
        "generated_at": now_iso(),
    }


# ---------------------- Orders ----------------------
@api_router.get("/orders")
async def get_orders(status: Optional[str] = None, include_test: bool = False):
    q = {}
    if status and status != "all":
        q["status"] = status
    if not include_test:
        q["is_test"] = {"$ne": True}
    docs = await db.orders.find(q, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return docs


@api_router.post("/orders")
async def create_order(payload: OrderCreate):
    count = await db.orders.count_documents({})
    order = Order(order_number=f"#{58321 + count + 1}", **payload.model_dump())
    await insert_doc("orders", order)
    await log_audit("Created order", order.order_number, "order")
    return order.model_dump()


@api_router.put("/orders/{order_id}")
async def update_order(order_id: str, payload: OrderUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    res = await db.orders.update_one({"id": order_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    await log_audit("Updated order", doc["order_number"], "order")
    return doc


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str):
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    await db.orders.delete_one({"id": order_id})
    if doc:
        await log_audit("Deleted order", doc.get("order_number", ""), "order")
    return {"ok": True}


# ---------------------- Products ----------------------
@api_router.get("/products")
async def get_products(include_test: bool = False):
    q = {} if include_test else {"is_test": {"$ne": True}}
    return await db.products.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.post("/products")
async def create_product(payload: ProductCreate):
    product = Product(**payload.model_dump())
    await insert_doc("products", product)
    await log_audit("Created product", product.name, "product")
    return product.model_dump()


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    await db.products.delete_one({"id": product_id})
    return {"ok": True}


# ---------------------- Recipes ----------------------
@api_router.get("/recipes")
async def get_recipes():
    return await db.recipes.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.post("/recipes")
async def create_recipe(payload: RecipeCreate):
    recipe = Recipe(**payload.model_dump())
    await insert_doc("recipes", recipe)
    await log_audit("Created recipe", recipe.name, "recipe")
    return recipe.model_dump()


@api_router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str):
    await db.recipes.delete_one({"id": recipe_id})
    return {"ok": True}


@api_router.post("/recipes/import")
async def import_recipe(payload: RecipeImportRequest):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(500, "LLM key not configured")

    system_message = (
        "You are a print production expert for a commercial printing company. "
        "Extract a structured production recipe from the given SOP / document / chat text. "
        "Return ONLY valid JSON (no markdown, no code fences) with this exact schema: "
        '{"name": string, "product": string, "description": string, '
        '"materials": [string], "machines": [string], "processes": [string], "steps": [string]}. '
        "materials = paper stocks, inks, coatings. machines = equipment used. "
        "processes = production stages (e.g. Imposition, Printing, Lamination, Cutting). "
        "steps = ordered human-readable production steps. Keep lists concise."
    )
    chat = LlmChat(api_key=api_key, session_id=f"recipe-{new_id()}", system_message=system_message).with_model("openai", "gpt-5.4")
    user_text = f"Source type: {payload.source_type}\n\nContent:\n{payload.content}"
    try:
        response = await chat.send_message(UserMessage(text=user_text))
    except Exception as e:
        logger.error(f"LLM error: {e}")
        raise HTTPException(500, f"AI import failed: {str(e)}")

    text = response.strip()
    if text.startswith("```"):
        text = text.split("```")[1] if "```" in text else text
        text = text.replace("json", "", 1).strip() if text.lower().startswith("json") else text
    try:
        parsed = json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            parsed = json.loads(text[start:end + 1])
        else:
            raise HTTPException(500, "AI returned unparseable output")

    # AI may ONLY create DRAFT recipes — it can never activate production.
    materials = parsed.get("materials", []) or []
    machines = parsed.get("machines", []) or []
    processes = parsed.get("processes", []) or []
    steps = parsed.get("steps", []) or []
    # production-critical values must be present, else flag for human configuration
    missing = [k for k, v in {"materials": materials, "machines": machines, "steps": steps}.items() if not v]
    review_status = "OK"
    if missing:
        review_status = "CONFIGURATION_REQUIRED"
    elif not parsed.get("name") or not parsed.get("product"):
        review_status = "REVIEW_REQUIRED"

    recipe = Recipe(
        name=parsed.get("name", "Untitled Recipe"),
        product=parsed.get("product", ""),
        description=parsed.get("description", ""),
        materials=materials,
        machines=machines,
        processes=processes,
        steps=steps,
        source=payload.source_type,
        status="DRAFT",  # never ACTIVE from AI
        review_status=review_status,
        provenance={"source_type": payload.source_type, "imported_at": now_iso(), "missing_fields": missing},
        extraction_model="openai/gpt-5.4",
    )
    if payload.save:
        await insert_doc("recipes", recipe)
        await log_audit("AI imported DRAFT recipe", recipe.name, "recipe")
    return recipe.model_dump()


# ---------------------- Processes ----------------------
@api_router.get("/processes")
async def get_processes():
    return await db.processes.find({}, {"_id": 0}).sort("order_index", 1).to_list(1000)


@api_router.post("/processes")
async def create_process(payload: ProcessCreate):
    proc = Process(**payload.model_dump())
    await insert_doc("processes", proc)
    return proc.model_dump()


# ---------------------- Machines ----------------------
@api_router.get("/machines")
async def get_machines():
    return await db.machines.find({}, {"_id": 0}).to_list(1000)


@api_router.post("/machines")
async def create_machine(payload: MachineCreate):
    m = Machine(**payload.model_dump())
    await insert_doc("machines", m)
    await log_audit("Added machine", m.name, "machine")
    return m.model_dump()


@api_router.put("/machines/{machine_id}")
async def update_machine(machine_id: str, updates: dict = Body(...)):
    await db.machines.update_one({"id": machine_id}, {"$set": updates})
    return await db.machines.find_one({"id": machine_id}, {"_id": 0})


# ---------------------- Generic read collections ----------------------
@api_router.get("/edge-agents")
async def get_edge_agents():
    return await db.edge_agents.find({}, {"_id": 0}).to_list(1000)


@api_router.get("/files")
async def get_files():
    return await db.files.find({}, {"_id": 0}).sort("uploaded_at", -1).to_list(1000)


@api_router.get("/sops")
async def get_sops():
    return await db.sops.find({}, {"_id": 0}).to_list(1000)


@api_router.get("/exceptions")
async def get_exceptions(include_test: bool = False):
    q = {} if include_test else {"is_test": {"$ne": True}}
    return await db.exceptions.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.post("/exceptions/{exc_id}/resolve")
async def resolve_exception(exc_id: str):
    exc = await db.exceptions.find_one({"id": exc_id}, {"_id": 0})
    await db.exceptions.update_one({"id": exc_id}, {"$set": {"resolved": True, "resolved_at": now_iso()}})
    if exc:
        ref = exc.get("order_ref")
        remaining = await db.exceptions.count_documents({"order_ref": ref, "resolved": {"$ne": True}})
        if remaining == 0 and ref:
            # recompute order state — never auto-mark Ready/Completed; bypasses no remaining gate
            await db.orders.update_one(
                {"order_number": ref, "status": "exception"},
                {"$set": {"status": "waiting", "current_step": "Awaiting review", "updated_at": now_iso()}})
        await log_audit("Resolved exception", ref or exc_id, "exception")
    return {"ok": True}


@api_router.get("/search")
async def search(q: str = ""):
    term = (q or "").strip().lstrip("#").strip()
    if not term:
        return {"query": q, "count": 0, "results": []}
    rx = {"$regex": re.escape(term), "$options": "i"}
    results = []
    ors = await db.orders.find({"is_test": {"$ne": True}, "$or": [
        {"order_number": rx}, {"product_name": rx}, {"customer": rx}]}, {"_id": 0}).sort("updated_at", -1).to_list(15)
    for o in ors:
        results.append({"type": "order", "id": o["id"],
                        "title": f'{o["order_number"]} · {o["product_name"]}',
                        "subtitle": f'{o.get("customer", "")} · {o.get("status", "")}'.strip(" ·"),
                        "route": f'/orders?q={o["order_number"].lstrip("#")}'})
    ps = await db.products.find({"is_test": {"$ne": True}, "name": rx}, {"_id": 0}).to_list(15)
    for p in ps:
        results.append({"type": "product", "id": p["id"], "title": p["name"],
                        "subtitle": p.get("category", ""), "route": "/products"})
    rs = await db.recipes.find({"$or": [{"name": rx}, {"product": rx}]}, {"_id": 0}).to_list(15)
    for r in rs:
        results.append({"type": "recipe", "id": r["id"], "title": r["name"],
                        "subtitle": r.get("product", ""), "route": "/recipes"})
    fs = await db.files.find({"$or": [{"name": rx}, {"order_ref": rx}]}, {"_id": 0}).to_list(15)
    for f in fs:
        results.append({"type": "file", "id": f["id"], "title": f["name"],
                        "subtitle": f.get("order_ref", ""), "route": "/files"})
    return {"query": q, "count": len(results), "results": results}


@api_router.get("/audit-logs")
async def get_audit_logs():
    return await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(500)


@api_router.get("/locations")
async def get_locations():
    return await db.locations.find({}, {"_id": 0}).to_list(1000)


@api_router.get("/users")
async def get_users():
    return await db.users.find({}, {"_id": 0}).to_list(1000)


@api_router.get("/tenants")
async def get_tenants():
    return await db.tenants.find({}, {"_id": 0}).to_list(1000)


@api_router.get("/reports")
async def get_reports():
    orders = await list_docs("orders")
    by_status = {}
    for o in orders:
        by_status[o["status"]] = by_status.get(o["status"], 0) + 1
    by_category = {}
    for o in orders:
        by_category[o.get("category", "general")] = by_category.get(o.get("category", "general"), 0) + 1
    machines = await list_docs("machines")
    return {
        "orders_by_status": by_status,
        "orders_by_category": by_category,
        "total_orders": len(orders),
        "total_quantity": sum(o.get("quantity", 0) for o in orders),
        "machine_utilization": [{"name": m["name"], "utilization": m.get("utilization", 0)} for m in machines],
        "weekly_throughput": [
            {"day": "Mon", "completed": 18}, {"day": "Tue", "completed": 24},
            {"day": "Wed", "completed": 21}, {"day": "Thu", "completed": 30},
            {"day": "Fri", "completed": 27}, {"day": "Sat", "completed": 12},
            {"day": "Sun", "completed": 6},
        ],
    }


async def log_audit(action: str, entity_name: str, entity_type: str):
    await db.audit_logs.insert_one({
        "id": new_id(),
        "action": action,
        "entity": entity_name,
        "entity_type": entity_type,
        "user": "demo-user (no auth)",
        "timestamp": now_iso(),
    })


# ---------------------- Seed ----------------------
async def seed():
    if await db.orders.count_documents({}) > 0:
        return
    logger.info("Seeding Print2Go data...")
    orders_seed = [
        ("#58321", "Business Cards", "3.5\" x 2\" • Matte", "business_cards", 500, "running", "Imposition (Fiery)", "high", "Nova Studios"),
        ("#58320", "Flyers", "5\" x 7\" • Gloss", "flyers", 1000, "ready", "Awaiting Dispatch", "normal", "GreenLeaf Cafe"),
        ("#58319", "Stickers", "3\" Circle • Die-Cut", "stickers", 250, "exception", "Bleed Review", "high", "Skate Co"),
        ("#58318", "Brochures", "Tri-Fold • Matte", "brochures", 500, "waiting", "Awaiting Approval", "normal", "City Dental"),
        ("#58317", "Postcards", "4\" x 6\" • Gloss", "postcards", 1000, "completed", "QC Passed", "normal", "Bloom Florist"),
        ("#58316", "Banner", "3m x 1m • Vinyl", "banner", 5, "exception", "Missing Bleed", "rush", "Expo Events"),
        ("#58315", "Booklets", "A5 • 16pp • Saddle", "booklets", 300, "running", "Printing (PX300)", "normal", "Riverside School"),
        ("#58314", "Business Cards", "3.5\" x 2\" • Soft-Touch", "business_cards", 250, "waiting", "Prepress", "normal", "Atlas Legal"),
        ("#58313", "Posters", "A2 • Silk", "posters", 120, "ready", "Awaiting Dispatch", "normal", "Indie Films"),
        ("#58312", "Labels", "2\" x 3\" • Kraft", "labels", 2000, "running", "Lamination", "normal", "Brew House"),
        ("#58311", "Brochure", "A4 • 8pp • Gloss", "brochures", 400, "exception", "Back Side Missing", "high", "TechCorp"),
        ("#58310", "Flyers", "A5 • Uncoated", "flyers", 750, "completed", "QC Passed", "normal", "Yoga Life"),
        ("#58309", "Menus", "A4 • Laminated", "menus", 60, "completed", "Delivered", "normal", "Spice Route"),
        ("#58308", "Wedding Invites", "5x7 • Letterpress", "invites", 150, "ready", "Awaiting Dispatch", "high", "Private"),
    ]
    for i, (num, name, spec, cat, qty, status, step, prio, cust) in enumerate(orders_seed):
        o = Order(order_number=num, product_name=name, product_spec=spec, category=cat,
                  quantity=qty, status=status, current_step=step, priority=prio, customer=cust)
        await db.orders.insert_one(o.model_dump())

    products = [
        Product(name="Business Cards", category="business_cards", description="Premium business cards with multiple finish options.",
                variants=["Matte", "Gloss", "Soft-Touch", "Spot UV"], base_price=29.0, lead_time_days=2),
        Product(name="Flyers", category="flyers", description="Full-colour promotional flyers.",
                variants=["A5", "A6", "DL", "5x7"], base_price=49.0, lead_time_days=3),
        Product(name="Stickers", category="stickers", description="Die-cut and kiss-cut vinyl stickers.",
                variants=["Circle", "Square", "Custom Shape"], base_price=39.0, lead_time_days=4),
        Product(name="Brochures", category="brochures", description="Folded brochures for marketing.",
                variants=["Tri-Fold", "Bi-Fold", "Z-Fold", "8pp"], base_price=89.0, lead_time_days=4),
        Product(name="Postcards", category="postcards", description="Glossy postcards, mailing ready.",
                variants=["4x6", "5x7", "A6"], base_price=45.0, lead_time_days=3),
        Product(name="Posters", category="posters", description="Large format posters, silk or matte.",
                variants=["A2", "A1", "A0"], base_price=25.0, lead_time_days=2),
        Product(name="Banners", category="banner", description="Durable outdoor vinyl banners.",
                variants=["Vinyl", "Mesh", "Fabric"], base_price=79.0, lead_time_days=3),
        Product(name="Booklets", category="booklets", description="Saddle-stitched or perfect-bound booklets.",
                variants=["Saddle", "Perfect Bound", "Wiro"], base_price=120.0, lead_time_days=5),
    ]
    for p in products:
        await db.products.insert_one(p.model_dump())

    recipes = [
        Recipe(name="Matte Business Cards 350gsm", product="Business Cards", description="Standard matte laminated business card run.",
               materials=["350gsm Silk", "Matte Lamination", "CMYK Inks"], machines=["Fiery PX300", "Duplo Cutter"],
               processes=["Imposition", "Printing", "Lamination", "Cutting"],
               steps=["Impose 21-up on SRA3", "Print CMYK duplex on PX300", "Apply matte lamination", "Guillotine to 90x50mm", "QC & box"], source="manual"),
        Recipe(name="Gloss Flyers A5", product="Flyers", description="Full bleed gloss flyer job.",
               materials=["170gsm Gloss", "CMYK Inks"], machines=["Fiery PX300"],
               processes=["Imposition", "Printing", "Cutting"],
               steps=["Impose 4-up A5 on SRA3", "Print CMYK duplex", "Cut to A5", "Shrink wrap"], source="sop"),
        Recipe(name="Die-Cut Vinyl Stickers", product="Stickers", description="Circle die-cut sticker recipe.",
               materials=["Vinyl White", "Gloss Laminate"], machines=["Fiery PX300", "Duplo Cutter"],
               processes=["Printing", "Lamination", "Die-Cutting"],
               steps=["Print on vinyl", "Laminate gloss", "Die-cut circles", "Weed & sheet"], source="ai"),
    ]
    for r in recipes:
        await db.recipes.insert_one(r.model_dump())

    processes = [
        Process(name="Preflight & Prepress", stage="prepress", machine="Adobe Creative Cloud", duration_minutes=20, order_index=0,
                description="Check files, bleed, resolution and colour."),
        Process(name="Imposition", stage="prepress", machine="Fiery PX300", duration_minutes=15, order_index=1,
                description="Lay out artwork for efficient sheet usage."),
        Process(name="Digital Printing", stage="print", machine="Fiery PX300", duration_minutes=45, order_index=2,
                description="CMYK digital press output."),
        Process(name="Lamination", stage="finishing", machine="Laminator", duration_minutes=25, order_index=3,
                description="Apply matte or gloss film."),
        Process(name="Cutting & Trimming", stage="finishing", machine="Duplo Cutter", duration_minutes=20, order_index=4,
                description="Guillotine and die-cut to final size."),
        Process(name="Quality Control", stage="dispatch", machine="", duration_minutes=10, order_index=5,
                description="Final inspection before dispatch."),
        Process(name="Packing & Dispatch", stage="dispatch", machine="", duration_minutes=15, order_index=6,
                description="Box, label and hand to courier."),
    ]
    for p in processes:
        await db.processes.insert_one(p.model_dump())

    machines = [
        Machine(name="Fiery PX300", type="Digital Press", model="Xerox PrimeLink C9070", status="online", utilization=78),
        Machine(name="Duplo Cutter", type="Finishing", model="Duplo DC-618", status="online", utilization=54),
        Machine(name="Laminator", type="Finishing", model="GMP Excelam 655Q", status="online", utilization=41),
        Machine(name="Wide Format Plotter", type="Large Format", model="Epson SureColor P9000", status="maintenance", utilization=0),
        Machine(name="Saddle Stitcher", type="Bindery", model="Horizon StitchLiner", status="online", utilization=33),
        Machine(name="Guillotine", type="Finishing", model="Polar 78 X", status="offline", utilization=0),
    ]
    for m in machines:
        await db.machines.insert_one(m.model_dump())

    edge_agents = [
        {"id": new_id(), "name": "Edge Agent", "agent_id": "P2G-LONDON-EDGE-01", "status": "online", "location": "Print2Go London", "last_seen": now_iso(), "version": "2.4.1"},
        {"id": new_id(), "name": "Edge Agent", "agent_id": "P2G-LONDON-EDGE-02", "status": "online", "location": "Print2Go London", "last_seen": now_iso(), "version": "2.4.1"},
        {"id": new_id(), "name": "Edge Agent", "agent_id": "P2G-MANCHESTER-01", "status": "offline", "location": "Print2Go Manchester", "last_seen": now_iso(), "version": "2.3.9"},
    ]
    await db.edge_agents.insert_many(edge_agents)

    devices = [
        {"id": new_id(), "name": "Print2Go London (Location)", "status": "online", "type": "location"},
        {"id": new_id(), "name": "Edge Agent (P2G-LONDON-EDGE-01)", "status": "online", "type": "agent"},
        {"id": new_id(), "name": "Fiery PX300", "status": "online", "type": "machine"},
        {"id": new_id(), "name": "Adobe Creative Cloud", "status": "online", "type": "integration"},
        {"id": new_id(), "name": "Duplo Cutter", "status": "online", "type": "machine"},
        {"id": new_id(), "name": "Laminator", "status": "online", "type": "machine"},
    ]
    await db.devices.insert_many(devices)

    files = [
        {"id": new_id(), "name": "58321_business_cards_v2.pdf", "type": "pdf", "size": "4.2 MB", "order_ref": "#58321", "uploaded_at": now_iso()},
        {"id": new_id(), "name": "58320_flyer_front.tif", "type": "image", "size": "18.7 MB", "order_ref": "#58320", "uploaded_at": now_iso()},
        {"id": new_id(), "name": "58319_sticker_diecut.ai", "type": "vector", "size": "2.1 MB", "order_ref": "#58319", "uploaded_at": now_iso()},
        {"id": new_id(), "name": "58316_banner_artwork.pdf", "type": "pdf", "size": "31.5 MB", "order_ref": "#58316", "uploaded_at": now_iso()},
        {"id": new_id(), "name": "58315_booklet_spreads.indd", "type": "indesign", "size": "9.8 MB", "order_ref": "#58315", "uploaded_at": now_iso()},
    ]
    await db.files.insert_many(files)

    sops = [
        {"id": new_id(), "title": "Business Card Production SOP", "category": "Print", "content": "Standard operating procedure for matte & gloss business cards including imposition, press settings and finishing tolerances.", "updated_at": now_iso()},
        {"id": new_id(), "title": "Bleed & Safe Zone Guidelines", "category": "Prepress", "content": "All artwork must include 3mm bleed and keep critical content 4mm inside trim.", "updated_at": now_iso()},
        {"id": new_id(), "title": "Lamination Best Practices", "category": "Finishing", "content": "Temperature and speed settings for matte, gloss and soft-touch films.", "updated_at": now_iso()},
        {"id": new_id(), "title": "Colour Management Workflow", "category": "Prepress", "content": "ICC profiles and Fiery colour settings for consistent output.", "updated_at": now_iso()},
        {"id": new_id(), "title": "Dispatch & Packing Standards", "category": "Dispatch", "content": "How to box, label and prepare orders for courier collection.", "updated_at": now_iso()},
    ]
    await db.sops.insert_many(sops)

    exceptions = [
        {"id": new_id(), "order_ref": "#58319", "product": "Stickers", "issue": "Bleed outside safe area", "severity": "high", "resolved": False, "created_at": now_iso()},
        {"id": new_id(), "order_ref": "#58316", "product": "Banner", "issue": "Missing required bleed", "severity": "high", "resolved": False, "created_at": now_iso()},
        {"id": new_id(), "order_ref": "#58314", "product": "Business Cards", "issue": "Low resolution image", "severity": "medium", "resolved": False, "created_at": now_iso()},
        {"id": new_id(), "order_ref": "#58311", "product": "Brochure", "issue": "Back side missing", "severity": "medium", "resolved": False, "created_at": now_iso()},
        {"id": new_id(), "order_ref": "#58308", "product": "Wedding Invites", "issue": "Font not embedded", "severity": "low", "resolved": True, "created_at": now_iso()},
    ]
    await db.exceptions.insert_many(exceptions)

    locations = [
        {"id": new_id(), "name": "Print2Go London", "city": "London, UK", "address": "18 Shoreditch High St", "status": "active", "machines": 6, "staff": 12},
        {"id": new_id(), "name": "Print2Go Manchester", "city": "Manchester, UK", "address": "40 Deansgate", "status": "active", "machines": 4, "staff": 7},
        {"id": new_id(), "name": "Print2Go Birmingham", "city": "Birmingham, UK", "address": "12 Colmore Row", "status": "setup", "machines": 2, "staff": 3},
    ]
    await db.locations.insert_many(locations)

    users = [
        {"id": new_id(), "name": "Mohammad Amin", "email": "mohammad@print2go.io", "role": "Production Manager", "location": "Print2Go London", "status": "active"},
        {"id": new_id(), "name": "Sarah Chen", "email": "sarah@print2go.io", "role": "Prepress Operator", "location": "Print2Go London", "status": "active"},
        {"id": new_id(), "name": "James Okoro", "email": "james@print2go.io", "role": "Press Operator", "location": "Print2Go London", "status": "active"},
        {"id": new_id(), "name": "Elena Rossi", "email": "elena@print2go.io", "role": "Finishing Lead", "location": "Print2Go Manchester", "status": "active"},
        {"id": new_id(), "name": "Tom Baker", "email": "tom@print2go.io", "role": "Dispatch", "location": "Print2Go London", "status": "invited"},
    ]
    await db.users.insert_many(users)

    tenants = [
        {"id": new_id(), "name": "Print2Go UK", "plan": "Enterprise", "locations_count": 3, "users_count": 24, "status": "active"},
        {"id": new_id(), "name": "QuickPrint Co", "plan": "Growth", "locations_count": 1, "users_count": 6, "status": "active"},
        {"id": new_id(), "name": "InkWorks Studio", "plan": "Starter", "locations_count": 1, "users_count": 3, "status": "trial"},
    ]
    await db.tenants.insert_many(tenants)
    logger.info("Seed complete.")


app.include_router(api_router)
app.include_router(build_production_router(db))

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


async def migrate(db):
    """Idempotent data migrations for existing (already-seeded/production) databases."""
    # Issue 4 — London is in Ontario, Canada; use CAD
    await db.locations.update_one(
        {"name": "Print2Go London"},
        {"$set": {"city": "London, ON, Canada", "country": "Canada", "currency": "CAD"}})
    # Issue 5 — flag known test/demo artifacts (metadata, never deleted, audit preserved)
    await db.orders.update_many(
        {"$or": [{"product_name": {"$regex": "^TEST_UI", "$options": "i"}},
                 {"order_number": {"$regex": "TEST", "$options": "i"}},
                 {"customer": {"$regex": "^TEST", "$options": "i"}}]},
        {"$set": {"is_test": True}})
    await db.products.update_many(
        {"name": {"$regex": "^TEST_UI", "$options": "i"}}, {"$set": {"is_test": True}})
    for coll in ("edge_agents", "prod_edge_agents"):
        await db[coll].update_many(
            {"agent_id": {"$regex": "^TEST-EDGE", "$options": "i"}}, {"$set": {"is_test": True}})
    # Issue 2 — align order/exception state at boot
    await reconcile_exceptions(db)


@app.on_event("startup")
async def startup():
    await seed()
    await seed_production(db)
    await migrate(db)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
