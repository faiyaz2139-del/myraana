"""
Print2Go Production Engine — V0.2
Real production orchestration: deterministic workflow state machine, policy engine,
executable STOP rules, file lineage (SHA-256), deterministic PRINT_READY verification,
idempotency, immutable hash-chained audit, Edge Agent cloud protocol, and a mock
Fiery adapter behind a clearly-labelled boundary.

REAL_FIERY_BACKEND = NOT_IMPLEMENTED. Physical printing is intentionally NOT built.
Artifact bytes are stored in MongoDB (small internal PDFs) — no pod-local files.
"""
import os
import io
import json
import hashlib
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Body, Query
from pydantic import BaseModel
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

# ----------------------------------------------------------------------------
# Constants & configuration
# ----------------------------------------------------------------------------
REAL_FIERY_BACKEND = "NOT_IMPLEMENTED"
FIERY_ALLOW_MOCK = os.environ.get("FIERY_ALLOW_MOCK", "true").lower() == "true"
DEPLOY_ENV = os.environ.get("DEPLOY_ENV", "development")  # mock forbidden in "production"

EDGE_HEARTBEAT_TIMEOUT_S = 30
ACTION_TIMEOUT_S = 120

TENANT = {"id": "TEN-PRINT2GO", "name": "Print2Go"}
LOCATION_LONDON = {
    "id": "LOC-LONDON",
    "name": "Print2Go London",
    "tenant_id": "TEN-PRINT2GO",
    # Location-scoped Fiery config — NEVER global defaults.
    "fiery": {"FIERY_SERVER": "PX300", "FIERY_HOST": "192.168.0.200", "IMPOSITION_TEMPLATE": "London BC"},
}
PRODUCT_BC = {"code": "PROD-BC-001", "name": "Business Card"}

# Business Card validated geometry (inches)
IN = 72.0
BLEED = 0.125
SIZES = [
    (3.5, 2.0, "TRIM", "LANDSCAPE"),
    (2.0, 3.5, "TRIM", "PORTRAIT"),
    (3.75, 2.25, "BLEED", "LANDSCAPE"),
    (2.25, 3.75, "BLEED", "PORTRAIT"),
]
BLEED_SIZE = {"LANDSCAPE": (3.75, 2.25), "PORTRAIT": (2.25, 3.75)}
TRIM_SIZE = {"LANDSCAPE": (3.5, 2.0), "PORTRAIT": (2.0, 3.5)}
AR_LANDSCAPE = 3.5 / 2.0
AR_PORTRAIT = 2.0 / 3.5

WORKFLOW = [
    "ORDER_RECEIVED", "ARTWORK_RECEIVED", "PREFLIGHT", "BLEED_DECISION",
    "ARTWORK_PREPARATION", "PRINT_READY_GENERATION", "PRINT_READY_VERIFICATION",
    "PRODUCTION_ROUTING", "FIERY_PREPARATION", "IMPOSITION",
    "PRODUCTION_AUTHORIZATION_REQUIRED", "PRODUCTION_AUTHORIZED",
]
HUMAN_GATE_FROM = "PRODUCTION_AUTHORIZATION_REQUIRED"

STOP_CODES = {
    "WRONG_DIMENSIONS", "WRONG_ASPECT_RATIO", "MISSING_BACK", "UNSAFE_SAFE_AREA",
    "BLEED_UNVERIFIED", "PROTECTED_CONTENT_REVIEW", "PDF_EXPORT_FAILED",
    "PRINT_READY_VERIFICATION_FAILED", "DEVICE_OFFLINE", "FIERY_UNAVAILABLE",
    "TEMPLATE_NOT_FOUND", "JOB_AMBIGUOUS", "CONFIGURATION_REQUIRED",
}
POLICY_DECISIONS = {"ALLOW", "DENY", "HUMAN_APPROVAL_REQUIRED", "CONFIGURATION_REQUIRED"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix=""):
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def close(a, b, tol=0.03):
    return abs(a - b) <= tol


# ----------------------------------------------------------------------------
# Mock Fiery adapter (behind a strict boundary)
# ----------------------------------------------------------------------------
class MockFieryAdapter:
    MODE = "MOCK"
    REAL = False

    def __init__(self, config: dict):
        self.config = config

    def _r(self, ok=True, **kw):
        return {"mode": self.MODE, "real": self.REAL, "ok": ok, **kw}

    def connect(self):
        return self._r(server=self.config.get("FIERY_SERVER"), host=self.config.get("FIERY_HOST"))

    def import_to_held(self, file_hash):
        return self._r(job_id=f"MOCKJOB-{file_hash[:8]}", state="HELD")

    def find_job(self, file_hash, ambiguous=False):
        if ambiguous:
            return self._r(ok=False, candidates=[f"MOCKJOB-{file_hash[:8]}", f"MOCKJOB-{file_hash[8:16]}"])
        return self._r(job_id=f"MOCKJOB-{file_hash[:8]}")

    def read_job_state(self, job_id):
        return self._r(job_id=job_id, state="HELD")

    def open_impose(self, job_id):
        return self._r(job_id=job_id, impose="OPEN")

    def apply_approved_template(self, job_id, template, template_available=True):
        if not template_available:
            return self._r(ok=False, reason="TEMPLATE_NOT_FOUND", template=template)
        return self._r(job_id=job_id, template=template, applied=True)

    def save_imposed_job(self, job_id):
        return self._r(job_id=job_id, state="HELD_VERIFIED")

    def verify_job_state(self, job_id):
        return self._r(job_id=job_id, state="HELD_VERIFIED", verified=True)


def select_adapter(use_mock: bool, config: dict):
    """Mock is impossible to select accidentally in production."""
    if use_mock:
        if DEPLOY_ENV == "production" or not FIERY_ALLOW_MOCK:
            return None, "CONFIGURATION_REQUIRED"
        return MockFieryAdapter(config), None
    return None, "FIERY_UNAVAILABLE"  # REAL_FIERY_BACKEND = NOT_IMPLEMENTED


# ----------------------------------------------------------------------------
# PDF helpers — deterministic measurement & generation (in-memory)
# ----------------------------------------------------------------------------
def _rect_dims_in(rect):
    return round(float(rect.width) / IN, 3), round(float(rect.height) / IN, 3)


def measure_pdf_bytes(data: bytes) -> dict:
    reader = PdfReader(io.BytesIO(data))
    page = reader.pages[0]
    mb_w, mb_h = _rect_dims_in(page.mediabox)
    try:
        tb_w, tb_h = _rect_dims_in(page.trimbox)
    except Exception:
        tb_w, tb_h = None, None
    try:
        bb_w, bb_h = _rect_dims_in(page.bleedbox)
    except Exception:
        bb_w, bb_h = None, None
    orientation = "LANDSCAPE" if mb_w >= mb_h else "PORTRAIT"
    return {
        "pages": len(reader.pages),
        "mediabox_in": [mb_w, mb_h], "trimbox_in": [tb_w, tb_h], "bleedbox_in": [bb_w, bb_h],
        "orientation": orientation, "width_in": mb_w, "height_in": mb_h,
    }


def classify_size(w, h):
    for (tw, th, kind, orient) in SIZES:
        if close(w, tw) and close(h, th):
            return kind, orient, None
    ar = w / h if h else 0
    if not (close(ar, AR_LANDSCAPE, 0.08) or close(ar, AR_PORTRAIT, 0.08)):
        return None, None, "WRONG_ASPECT_RATIO"
    return None, None, "WRONG_DIMENSIONS"


def make_pdf_bytes(w_in, h_in, pages, with_bleed) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        page = writer.add_blank_page(width=w_in * IN, height=h_in * IN)
        if with_bleed:
            inset = BLEED * IN
            page.trimbox = RectangleObject([inset, inset, w_in * IN - inset, h_in * IN - inset])
            page.bleedbox = RectangleObject([0, 0, w_in * IN, h_in * IN])
        else:
            page.trimbox = RectangleObject([0, 0, w_in * IN, h_in * IN])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def expand_canvas_to_bleed_bytes(src: bytes, orientation: str) -> bytes:
    """Increase canvas to bleed size WITHOUT distorting artwork (center trim page)."""
    reader = PdfReader(io.BytesIO(src))
    writer = PdfWriter()
    bw, bh = BLEED_SIZE[orientation]
    inset = BLEED * IN
    for src_page in reader.pages:
        new_page = writer.add_blank_page(width=bw * IN, height=bh * IN)
        new_page.merge_translated_page(src_page, inset, inset, expand=False)
        new_page.trimbox = RectangleObject([inset, inset, bw * IN - inset, bh * IN - inset])
        new_page.bleedbox = RectangleObject([0, 0, bw * IN, bh * IN])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def copy_pdf_bytes(src: bytes) -> bytes:
    reader = PdfReader(io.BytesIO(src))
    writer = PdfWriter()
    for p in reader.pages:
        writer.add_page(p)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


# ----------------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------------
class CreateJobRequest(BaseModel):
    tenant_id: str = "TEN-PRINT2GO"
    location_id: str = "LOC-LONDON"
    product_code: str = "PROD-BC-001"
    recipe_id: str = "RECIPE-BC-LONDON-V1"
    customer: str = "Demo Customer"
    orientation: str = "LANDSCAPE"
    sides: int = 1
    safe_area_ok: bool = True
    protected_content_review: bool = False


class AdvanceOptions(BaseModel):
    actor: str = "Mohammad Amin"
    use_mock_fiery: bool = True
    simulate: Optional[str] = None
    ai_actor: bool = False


# ----------------------------------------------------------------------------
# Engine
# ----------------------------------------------------------------------------
class ProductionEngine:
    def __init__(self, db):
        self.db = db

    async def audit(self, job, actor, action, policy, adapter=None, device=None, result=None,
                    input_hash=None, output_hash=None, ai_model=None, evidence=None):
        last = await self.db.prod_audit.find_one({"job_id": job["id"]}, sort=[("seq", -1)])
        seq = (last["seq"] + 1) if last else 1
        prev_hash = last["entry_hash"] if last else "GENESIS"
        entry = {
            "id": new_id("AUD-"), "seq": seq, "prev_hash": prev_hash,
            "tenant_id": job["tenant_id"], "location_id": job["location_id"],
            "job_id": job["id"], "order_number": job["job_number"],
            "recipe_id": job["recipe_id"], "recipe_version": job["recipe_version"],
            "process": job["state"], "process_version": job.get("recipe_version"),
            "actor": actor, "ai_model": ai_model, "input_hash": input_hash, "output_hash": output_hash,
            "action": action, "policy_decision": policy, "adapter": adapter, "device": device,
            "result": result, "evidence": evidence or {}, "timestamp": now_iso(),
        }
        entry["entry_hash"] = sha256_bytes(json.dumps(
            {k: entry[k] for k in ["seq", "prev_hash", "job_id", "process", "actor", "action",
                                   "policy_decision", "input_hash", "output_hash", "timestamp"]},
            sort_keys=True, default=str).encode())
        await self.db.prod_audit.insert_one(entry)
        return entry

    async def add_file(self, job, role, data: bytes, creator, source_file_id=None, metadata=None, filename=None):
        rec = {
            "id": new_id("FILE-"), "job_id": job["id"], "order_number": job["job_number"],
            "tenant_id": job["tenant_id"], "location_id": job["location_id"],
            "role": role, "filename": filename or f"{role.lower()}.pdf", "sha256": sha256_bytes(data),
            "version": (await self.db.prod_files.count_documents({"job_id": job["id"], "role": role})) + 1,
            "creator": creator, "source_file_id": source_file_id,
            "data": data, "size": len(data), "metadata": metadata or {}, "timestamp": now_iso(),
        }
        await self.db.prod_files.insert_one(dict(rec))
        return rec

    async def latest_file(self, job, role):
        return await self.db.prod_files.find_one({"job_id": job["id"], "role": role}, sort=[("version", -1)])

    async def policy(self, job, transition, opts: "AdvanceOptions", authorized=False):
        recipe = await self.db.recipes.find_one({"recipe_id": job["recipe_id"]}, {"_id": 0})
        if not recipe:
            return {"decision": "CONFIGURATION_REQUIRED", "reason": "RECIPE_NOT_FOUND", "stop": None}
        if recipe.get("tenant") not in (None, job["tenant"]) or (recipe.get("location") and recipe.get("location") != job["location"]):
            return {"decision": "DENY", "reason": "TENANT_LOCATION_MISMATCH", "stop": None}
        if recipe.get("status") != "ACTIVE":
            return {"decision": "DENY", "reason": "RECIPE_NOT_ACTIVE", "stop": None}
        if job.get("stop"):
            return {"decision": "DENY", "reason": "ACTIVE_STOP", "stop": job["stop"]}
        if job["state"] == HUMAN_GATE_FROM:
            if opts.ai_actor:
                return {"decision": "DENY", "reason": "AI_CANNOT_AUTHORIZE_PRODUCTION", "stop": None}
            if not authorized:
                return {"decision": "HUMAN_APPROVAL_REQUIRED", "reason": "PRODUCTION_AUTHORIZATION_REQUIRED", "stop": None}
            return {"decision": "ALLOW", "reason": "HUMAN_AUTHORIZED", "stop": None}
        if job["state"] == "PRODUCTION_ROUTING":
            if opts.simulate == "DEVICE_OFFLINE":
                return {"decision": "DENY", "reason": "DEVICE_OFFLINE", "stop": "DEVICE_OFFLINE"}
            adapter, err = select_adapter(opts.use_mock_fiery, LOCATION_LONDON["fiery"])
            if err == "FIERY_UNAVAILABLE":
                return {"decision": "DENY", "reason": "FIERY_UNAVAILABLE (REAL_FIERY_BACKEND=NOT_IMPLEMENTED)", "stop": "FIERY_UNAVAILABLE"}
            if err == "CONFIGURATION_REQUIRED":
                return {"decision": "CONFIGURATION_REQUIRED", "reason": "MOCK_ADAPTER_FORBIDDEN_IN_PRODUCTION", "stop": None}
        return {"decision": "ALLOW", "reason": "OK", "stop": None}

    async def set_stop(self, job, code, message, actor):
        stop = {"code": code, "message": message, "state": job["state"], "at": now_iso()}
        await self.db.prod_jobs.update_one({"id": job["id"]}, {"$set": {"stop": stop, "status": "STOPPED", "updated_at": now_iso()}})
        job["stop"] = stop
        job["status"] = "STOPPED"
        await self.audit(job, actor, f"STOP:{code}", "DENY", result="STOPPED", evidence={"message": message})
        return stop

    async def advance(self, job, opts: "AdvanceOptions", authorized=False):
        idx = WORKFLOW.index(job["state"])
        if job["state"] == "PRODUCTION_AUTHORIZED":
            raise HTTPException(400, "Job at terminal PRODUCTION_AUTHORIZED (PRINT is locked in V0.2).")

        decision = await self.policy(job, None, opts, authorized=authorized)
        if decision["decision"] != "ALLOW":
            await self.audit(job, opts.actor, f"ADVANCE_FROM:{job['state']}", decision["decision"],
                             ai_model="openai/gpt-5.4" if opts.ai_actor else None,
                             result=decision["reason"], evidence=decision)
            if decision.get("stop") and isinstance(decision["stop"], str):
                await self.set_stop(job, decision["stop"], decision["reason"], opts.actor)
            return {"job": await self.get(job["id"]), "policy": decision}

        state = job["state"]
        actor = opts.actor
        result_evidence = {}
        adapter_info = None

        if state == "PREFLIGHT":
            orig = await self.latest_file(job, "ORIGINAL")
            if not orig:
                await self.set_stop(job, "CONFIGURATION_REQUIRED", "No ORIGINAL artwork uploaded", actor)
                return {"job": await self.get(job["id"]), "policy": decision}
            m = measure_pdf_bytes(orig["data"])
            kind, orient, size_err = classify_size(m["width_in"], m["height_in"])
            if size_err:
                await self.set_stop(job, size_err, f"Measured {m['width_in']}x{m['height_in']}in", actor)
                return {"job": await self.get(job["id"]), "policy": decision, "measure": m}
            if job["sides"] == 2 and m["pages"] < 2:
                await self.set_stop(job, "MISSING_BACK", "Double-sided card requires a back page", actor)
                return {"job": await self.get(job["id"]), "policy": decision, "measure": m}
            if not job.get("safe_area_ok", True):
                await self.set_stop(job, "UNSAFE_SAFE_AREA", "Content inside safe-area margin", actor)
                return {"job": await self.get(job["id"]), "policy": decision, "measure": m}
            if job.get("protected_content_review"):
                await self.set_stop(job, "PROTECTED_CONTENT_REVIEW", "Protected customer content requires human review", actor)
                return {"job": await self.get(job["id"]), "policy": decision, "measure": m}
            await self.db.prod_jobs.update_one({"id": job["id"]}, {"$set": {"detected_kind": kind, "orientation": orient, "preflight": m}})
            result_evidence = {"measure": m, "kind": kind, "orientation": orient}

        elif state == "BLEED_DECISION":
            kind = job.get("detected_kind")
            needs_bleed = (kind == "TRIM")
            await self.db.prod_jobs.update_one({"id": job["id"]}, {"$set": {"needs_bleed": needs_bleed, "bleed_verified": (kind == "BLEED")}})
            result_evidence = {"needs_bleed": needs_bleed, "source_kind": kind}

        elif state == "ARTWORK_PREPARATION":
            orig = await self.latest_file(job, "ORIGINAL")
            orient = job.get("orientation", "LANDSCAPE")
            if job.get("needs_bleed"):
                wc_data = expand_canvas_to_bleed_bytes(orig["data"], orient)
            else:
                wc_data = copy_pdf_bytes(orig["data"])
            wc = await self.add_file(job, "WORKING_COPY", wc_data, actor, source_file_id=orig["id"], metadata=measure_pdf_bytes(wc_data))
            await self.db.prod_jobs.update_one({"id": job["id"]}, {"$set": {"bleed_verified": True}})
            result_evidence = {"working_copy": wc["sha256"]}

        elif state == "PRINT_READY_GENERATION":
            if opts.simulate == "PDF_EXPORT_FAILED":
                await self.set_stop(job, "PDF_EXPORT_FAILED", "Simulated PDF export failure", actor)
                return {"job": await self.get(job["id"]), "policy": decision}
            wc = await self.latest_file(job, "WORKING_COPY")
            pr_data = copy_pdf_bytes(wc["data"])
            pr = await self.add_file(job, "PRINT_READY", pr_data, actor, source_file_id=wc["id"], metadata=measure_pdf_bytes(pr_data))
            result_evidence = {"print_ready": pr["sha256"]}

        elif state == "PRINT_READY_VERIFICATION":
            pr = await self.latest_file(job, "PRINT_READY")
            if not job.get("bleed_verified"):
                await self.set_stop(job, "BLEED_UNVERIFIED", "Bleed not verified before print-ready", actor)
                return {"job": await self.get(job["id"]), "policy": decision}
            m = measure_pdf_bytes(pr["data"])
            orient = job.get("orientation", "LANDSCAPE")
            exp_w, exp_h = BLEED_SIZE[orient]
            ok = (close(m["width_in"], exp_w) and close(m["height_in"], exp_h)
                  and m["pages"] >= job["sides"] and m["trimbox_in"][0] is not None)
            if not ok:
                await self.set_stop(job, "PRINT_READY_VERIFICATION_FAILED",
                                    f"Expected {exp_w}x{exp_h}in bleed {job['sides']}pp; got {m['width_in']}x{m['height_in']}in {m['pages']}pp", actor)
                return {"job": await self.get(job["id"]), "policy": decision, "measure": m}
            await self.db.prod_jobs.update_one({"id": job["id"]}, {"$set": {"print_ready_verified": True, "verification": m}})
            result_evidence = {"verified": True, "measure": m, "hash": pr["sha256"]}

        elif state == "PRODUCTION_ROUTING":
            adapter, err = select_adapter(opts.use_mock_fiery, LOCATION_LONDON["fiery"])
            adapter_info = {"mode": adapter.MODE, "real": adapter.REAL} if adapter else {"error": err}
            result_evidence = {"routed_to": LOCATION_LONDON["fiery"]["FIERY_SERVER"], "adapter": adapter_info}

        elif state == "FIERY_PREPARATION":
            adapter, err = select_adapter(opts.use_mock_fiery, LOCATION_LONDON["fiery"])
            if not adapter:
                await self.set_stop(job, "FIERY_UNAVAILABLE", err or "unavailable", actor)
                return {"job": await self.get(job["id"]), "policy": decision}
            pr = await self.latest_file(job, "PRINT_READY")
            ikey = sha256_bytes(f"{job['tenant_id']}|{job['id']}|{pr['sha256']}|FIERY_PREPARATION|{job['recipe_version']}".encode())
            existing = await self.db.prod_idempotency.find_one({"key": ikey})
            if existing:
                result_evidence = {"idempotent": True, "job_id": existing["fiery_job_id"], "adapter": {"mode": "MOCK"}}
            else:
                conn = adapter.connect()
                held = adapter.import_to_held(pr["sha256"])
                found = adapter.find_job(pr["sha256"], ambiguous=(opts.simulate == "JOB_AMBIGUOUS"))
                if not found["ok"]:
                    await self.set_stop(job, "JOB_AMBIGUOUS", f"Multiple Fiery jobs matched: {found.get('candidates')}", actor)
                    return {"job": await self.get(job["id"]), "policy": decision}
                await self.db.prod_idempotency.insert_one({"key": ikey, "fiery_job_id": held["job_id"], "at": now_iso()})
                await self.db.prod_jobs.update_one({"id": job["id"]}, {"$set": {"fiery_job_id": held["job_id"], "fiery_mode": "MOCK"}})
                result_evidence = {"connect": conn, "held": held, "found": found, "idempotency_key": ikey[:16]}
            adapter_info = {"mode": "MOCK", "real": False}

        elif state == "IMPOSITION":
            adapter, err = select_adapter(opts.use_mock_fiery, LOCATION_LONDON["fiery"])
            if not adapter:
                await self.set_stop(job, "FIERY_UNAVAILABLE", err or "unavailable", actor)
                return {"job": await self.get(job["id"]), "policy": decision}
            template = LOCATION_LONDON["fiery"]["IMPOSITION_TEMPLATE"]
            template_available = (opts.simulate != "TEMPLATE_NOT_FOUND")
            jid = job.get("fiery_job_id", "MOCKJOB")
            adapter.open_impose(jid)
            applied = adapter.apply_approved_template(jid, template, template_available=template_available)
            if not applied["ok"]:
                await self.set_stop(job, "TEMPLATE_NOT_FOUND", f"Imposition template '{template}' not found", actor)
                return {"job": await self.get(job["id"]), "policy": decision}
            adapter.save_imposed_job(jid)
            verified = adapter.verify_job_state(jid)
            pr = await self.latest_file(job, "PRINT_READY")
            out_data = copy_pdf_bytes(pr["data"])
            out = await self.add_file(job, "PRODUCTION_OUTPUT", out_data, f"MockFiery:{template}",
                                      source_file_id=pr["id"], metadata={"template": template, "mode": "MOCK", "fiery_state": "HELD_VERIFIED"})
            await self.db.prod_jobs.update_one({"id": job["id"]}, {"$set": {"fiery_state": "HELD_VERIFIED", "imposed": True}})
            adapter_info = {"mode": "MOCK", "real": False}
            result_evidence = {"template": template, "verify": verified, "output_hash": out["sha256"]}

        elif state == "PRODUCTION_AUTHORIZATION_REQUIRED":
            result_evidence = {"authorized_by": actor, "note": "PRINT remains locked (V0.2). Do-not-print."}

        next_state = WORKFLOW[idx + 1]
        status = ("AWAITING_AUTHORIZATION" if next_state == "PRODUCTION_AUTHORIZATION_REQUIRED"
                  else "AUTHORIZED_HELD" if next_state == "PRODUCTION_AUTHORIZED" else "RUNNING")
        await self.db.prod_jobs.update_one({"id": job["id"]}, {"$set": {"state": next_state, "status": status, "updated_at": now_iso()}})
        job2 = await self.get(job["id"])
        out_hash = result_evidence.get("output_hash") or result_evidence.get("print_ready") or result_evidence.get("working_copy")
        await self.audit(job2, actor, f"COMPLETE:{state}->{next_state}", decision["decision"],
                         adapter=(adapter_info or {}).get("mode"), device=LOCATION_LONDON["fiery"]["FIERY_SERVER"],
                         ai_model="openai/gpt-5.4" if opts.ai_actor else None,
                         output_hash=out_hash, result="OK", evidence=result_evidence)
        return {"job": job2, "policy": decision, "evidence": result_evidence, "adapter": adapter_info}

    async def get(self, job_id):
        return await self.db.prod_jobs.find_one({"id": job_id}, {"_id": 0, "recipe_snapshot": 0})


# ----------------------------------------------------------------------------
# Router
# ----------------------------------------------------------------------------
def build_router(db):
    router = APIRouter(prefix="/api/production", tags=["production"])
    engine = ProductionEngine(db)

    def clean_file(f):
        return {k: f[k] for k in ["id", "role", "filename", "sha256", "version", "creator", "source_file_id", "metadata", "size", "timestamp"] if k in f}

    @router.get("/config")
    async def config():
        return {"tenant": TENANT, "location": LOCATION_LONDON, "product": PRODUCT_BC,
                "workflow": WORKFLOW, "stop_codes": sorted(STOP_CODES), "policy_decisions": sorted(POLICY_DECISIONS),
                "REAL_FIERY_BACKEND": REAL_FIERY_BACKEND,
                "fiery_mode_available": "MOCK" if (FIERY_ALLOW_MOCK and DEPLOY_ENV != "production") else "NONE",
                "deploy_env": DEPLOY_ENV}

    @router.get("/fiery-status")
    async def fiery_status():
        return {"REAL_FIERY_BACKEND": REAL_FIERY_BACKEND, "active_mode": "MOCK",
                "mock_allowed": FIERY_ALLOW_MOCK and DEPLOY_ENV != "production",
                "location_config": LOCATION_LONDON["fiery"],
                "warning": "Mock execution only. Never treat MOCK success as REAL_WORLD_VERIFIED."}

    @router.post("/jobs")
    async def create_job(req: CreateJobRequest):
        if req.tenant_id != TENANT["id"]:
            raise HTTPException(400, "Unknown tenant")
        if req.location_id != "LOC-LONDON":
            raise HTTPException(400, "Unknown/unsupported location")
        recipe = await db.recipes.find_one({"recipe_id": req.recipe_id}, {"_id": 0})
        if not recipe:
            raise HTTPException(400, "Recipe not found")
        if recipe.get("status") != "ACTIVE":
            raise HTTPException(400, "Recipe is not ACTIVE — cannot start production")
        if recipe.get("product_code") != req.product_code:
            raise HTTPException(400, "Recipe/product mismatch")
        count = await db.prod_jobs.count_documents({})
        job = {
            "id": new_id("JOB-"), "job_number": f"BC-{1001 + count}",
            "tenant_id": TENANT["id"], "tenant": TENANT["name"],
            "location_id": LOCATION_LONDON["id"], "location": LOCATION_LONDON["name"],
            "product_code": req.product_code, "recipe_id": req.recipe_id, "recipe_version": recipe["version"],
            "recipe_snapshot": recipe, "customer": req.customer, "orientation": req.orientation, "sides": req.sides,
            "safe_area_ok": req.safe_area_ok, "protected_content_review": req.protected_content_review,
            "state": "ORDER_RECEIVED", "status": "RUNNING", "stop": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.prod_jobs.insert_one(dict(job))
        j = await engine.get(job["id"])
        await engine.audit(j, "system", "JOB_CREATED", "ALLOW", evidence={"recipe_version": recipe["version"], "recipe_id": req.recipe_id})
        return j

    @router.get("/jobs")
    async def list_jobs(tenant_id: str = "TEN-PRINT2GO", location_id: str = "LOC-LONDON"):
        return await db.prod_jobs.find({"tenant_id": tenant_id, "location_id": location_id}, {"_id": 0, "recipe_snapshot": 0}).sort("created_at", -1).to_list(200)

    @router.get("/jobs/{job_id}")
    async def get_job(job_id: str):
        j = await engine.get(job_id)
        if not j:
            raise HTTPException(404, "Job not found")
        files = await db.prod_files.find({"job_id": job_id}).sort("timestamp", 1).to_list(100)
        audit = await db.prod_audit.find({"job_id": job_id}, {"_id": 0}).sort("seq", 1).to_list(500)
        return {"job": j, "files": [clean_file(f) for f in files], "audit": audit, "workflow": WORKFLOW}

    @router.post("/jobs/{job_id}/artwork")
    async def upload_artwork(job_id: str, file: UploadFile = File(...)):
        j = await engine.get(job_id)
        if not j:
            raise HTTPException(404, "Job not found")
        if j["state"] not in ("ORDER_RECEIVED", "ARTWORK_RECEIVED"):
            raise HTTPException(400, f"Cannot upload artwork in state {j['state']}")
        data = await file.read()
        try:
            meta = measure_pdf_bytes(data)
        except Exception:
            raise HTTPException(400, "Uploaded file is not a readable PDF")
        rec = await engine.add_file(j, "ORIGINAL", data, j["customer"], metadata=meta, filename=file.filename)
        if j["state"] == "ORDER_RECEIVED":
            await db.prod_jobs.update_one({"id": job_id}, {"$set": {"state": "ARTWORK_RECEIVED", "updated_at": now_iso()}})
            j = await engine.get(job_id)
            await engine.audit(j, j["customer"], "ARTWORK_RECEIVED", "ALLOW", input_hash=rec["sha256"], evidence={"file": rec["filename"], "measure": meta})
        return {"file": clean_file(rec), "job": await engine.get(job_id)}

    @router.post("/jobs/{job_id}/dev-artwork")
    async def dev_artwork(job_id: str, variant: str = Query("correct_landscape_bleed")):
        if DEPLOY_ENV == "production":
            raise HTTPException(403, "dev-artwork disabled in production")
        j = await engine.get(job_id)
        if not j:
            raise HTTPException(404, "Job not found")
        specs = {
            "correct_landscape_bleed": (3.75, 2.25, 1, True),
            "correct_portrait_bleed": (2.25, 3.75, 1, True),
            "trim_only": (3.5, 2.0, 1, False),
            "portrait_trim": (2.0, 3.5, 1, False),
            "double_sided_ok": (3.75, 2.25, 2, True),
            "missing_back": (3.75, 2.25, 1, True),
            "wrong_dimensions": (7.0, 4.0, 1, False),
            "wrong_aspect": (3.5, 3.0, 1, False),
        }
        if variant not in specs:
            raise HTTPException(400, f"Unknown variant. Options: {list(specs)}")
        w, h, pages, bleed = specs[variant]
        data = make_pdf_bytes(w, h, pages, bleed)
        meta = measure_pdf_bytes(data)
        rec = await engine.add_file(j, "ORIGINAL", data, "dev-generator", metadata=meta, filename=f"dev_{variant}.pdf")
        if j["state"] == "ORDER_RECEIVED":
            await db.prod_jobs.update_one({"id": job_id}, {"$set": {"state": "ARTWORK_RECEIVED", "updated_at": now_iso()}})
            j = await engine.get(job_id)
            await engine.audit(j, "dev-generator", "ARTWORK_RECEIVED", "ALLOW", input_hash=rec["sha256"], evidence={"variant": variant, "measure": meta})
        return {"variant": variant, "measure": meta, "mock": True, "job": await engine.get(job_id)}

    @router.post("/jobs/{job_id}/advance")
    async def advance(job_id: str, opts: AdvanceOptions = Body(default=AdvanceOptions())):
        j = await engine.get(job_id)
        if not j:
            raise HTTPException(404, "Job not found")
        return await engine.advance(j, opts, authorized=False)

    @router.post("/jobs/{job_id}/authorize")
    async def authorize(job_id: str, opts: AdvanceOptions = Body(default=AdvanceOptions())):
        j = await engine.get(job_id)
        if not j:
            raise HTTPException(404, "Job not found")
        if j["state"] != HUMAN_GATE_FROM:
            raise HTTPException(400, f"Not at authorization gate (state={j['state']})")
        if opts.ai_actor:
            await engine.audit(j, "AI", "AUTHORIZE_ATTEMPT", "DENY", ai_model="openai/gpt-5.4", result="AI_CANNOT_AUTHORIZE_PRODUCTION")
            raise HTTPException(403, "AI cannot authorize production")
        return await engine.advance(j, opts, authorized=True)

    @router.post("/jobs/{job_id}/policy-check")
    async def policy_check(job_id: str, opts: AdvanceOptions = Body(default=AdvanceOptions())):
        j = await engine.get(job_id)
        if not j:
            raise HTTPException(404, "Job not found")
        return await engine.policy(j, None, opts, authorized=False)

    # ---- Edge Agent cloud protocol ----
    @router.post("/edge/register")
    async def edge_register(payload: dict = Body(...)):
        agent_id = payload.get("agent_id") or new_id("EDGE-")
        token = new_id("tok-")
        doc = {"id": new_id("EA-"), "agent_id": agent_id, "tenant_id": payload.get("tenant_id", "TEN-PRINT2GO"),
               "location_id": payload.get("location_id", "LOC-LONDON"), "state": "REGISTERING", "token": token,
               "capabilities": [], "last_heartbeat": None, "registered_at": now_iso()}
        await db.prod_edge_agents.update_one({"agent_id": agent_id}, {"$set": doc}, upsert=True)
        return {"agent_id": agent_id, "token": token, "state": "REGISTERING",
                "auth": "Bearer token issued (design: HMAC-signed per-agent token, rotated on re-register)"}

    @router.post("/edge/{agent_id}/heartbeat")
    async def edge_heartbeat(agent_id: str, payload: dict = Body(default={})):
        a = await db.prod_edge_agents.find_one({"agent_id": agent_id})
        if not a:
            raise HTTPException(404, "Agent not registered")
        state = payload.get("state", "ONLINE")
        await db.prod_edge_agents.update_one({"agent_id": agent_id}, {"$set": {"last_heartbeat": now_iso(), "state": state}})
        return {"agent_id": agent_id, "state": state, "ack": now_iso()}

    @router.post("/edge/{agent_id}/capabilities")
    async def edge_caps(agent_id: str, payload: dict = Body(...)):
        await db.prod_edge_agents.update_one({"agent_id": agent_id}, {"$set": {"capabilities": payload.get("capabilities", [])}})
        return {"ok": True}

    def _live_state(a):
        hb = a.get("last_heartbeat")
        if not hb:
            return "OFFLINE"
        try:
            if datetime.now(timezone.utc) - datetime.fromisoformat(hb) > timedelta(seconds=EDGE_HEARTBEAT_TIMEOUT_S):
                return "OFFLINE"
        except Exception:
            return "OFFLINE"
        return a.get("state", "ONLINE")

    @router.get("/edge/agents")
    async def edge_agents_list():
        agents = await db.prod_edge_agents.find({}, {"_id": 0, "token": 0}).to_list(100)
        for a in agents:
            a["live_state"] = _live_state(a)
        return {"agents": agents, "note": "live_state is computed from real heartbeats. No agent is ONLINE unless a real agent is connected."}

    @router.get("/edge/{agent_id}/actions")
    async def edge_poll(agent_id: str):
        acts = await db.prod_edge_actions.find({"agent_id": agent_id, "status": "QUEUED"}, {"_id": 0}).to_list(50)
        for a in acts:
            await db.prod_edge_actions.update_one({"id": a["id"]}, {"$set": {"status": "DISPATCHED", "dispatched_at": now_iso()}})
        return {"actions": acts}

    @router.post("/edge/actions/{action_id}/ack")
    async def edge_ack(action_id: str):
        await db.prod_edge_actions.update_one({"id": action_id}, {"$set": {"status": "ACKNOWLEDGED", "ack_at": now_iso()}})
        return {"ok": True}

    @router.post("/edge/actions/{action_id}/result")
    async def edge_result(action_id: str, payload: dict = Body(...)):
        status = "SUCCEEDED" if payload.get("ok") else "FAILED"
        await db.prod_edge_actions.update_one({"id": action_id}, {"$set": {"status": status, "result": payload, "result_at": now_iso()}})
        return {"ok": True, "status": status}

    @router.get("/audit/{job_id}")
    async def audit_chain(job_id: str):
        entries = await db.prod_audit.find({"job_id": job_id}, {"_id": 0}).sort("seq", 1).to_list(500)
        ok = True
        prev = "GENESIS"
        for e in entries:
            if e["prev_hash"] != prev:
                ok = False
            prev = e["entry_hash"]
        return {"entries": entries, "chain_valid": ok, "count": len(entries)}

    return router


# ----------------------------------------------------------------------------
# Seeding
# ----------------------------------------------------------------------------
async def seed_production(db):
    await db.products.update_many({"category": "business_cards"}, {"$set": {"product_code": PRODUCT_BC["code"], "production_active": True}})

    async for r in db.recipes.find({"status": {"$exists": False}}):
        await db.recipes.update_one({"id": r["id"]}, {"$set": {
            "status": "DRAFT", "version": "v1", "product_code": "", "tenant": "Print2Go",
            "location": "", "provenance": {}, "extraction_model": ""}})

    await db.edge_agents.update_many({}, {"$set": {"live_state": "OFFLINE", "connected": False}})

    if not await db.recipes.find_one({"recipe_id": "RECIPE-BC-LONDON-V1"}):
        await db.recipes.insert_one({
            "id": new_id("REC-"), "recipe_id": "RECIPE-BC-LONDON-V1", "version": "v1",
            "name": "Business Card — London (V1)", "product": "Business Cards", "product_code": PRODUCT_BC["code"],
            "tenant": "Print2Go", "location": "Print2Go London", "status": "ACTIVE",
            "description": "Approved production recipe for London Business Cards. 350gsm silk, matte lam, PX300, London BC imposition.",
            "materials": ["350gsm Silk", "Matte Lamination", "CMYK"],
            "machines": ["Fiery PX300", "Duplo Cutter"], "processes": WORKFLOW,
            "steps": ["Receive order", "Receive artwork", "Preflight", "Bleed decision", "Prepare artwork",
                      "Generate print-ready", "Verify print-ready", "Route to production", "Fiery preparation",
                      "Imposition (London BC)", "Await production authorization"],
            "parameters": {"trim": {"landscape": [3.5, 2.0], "portrait": [2.0, 3.5]}, "bleed_in": BLEED,
                           "file_with_bleed": {"landscape": [3.75, 2.25], "portrait": [2.25, 3.75]},
                           "automation_level": "SEMI_AUTO_HUMAN_PRINT_GATE"},
            "provenance": {"origin": "human_authored"}, "extraction_model": "", "source": "manual", "created_at": now_iso(),
        })

    if not await db.prod_edge_agents.find_one({"agent_id": "P2G-LONDON-EDGE-01"}):
        await db.prod_edge_agents.insert_one({
            "id": new_id("EA-"), "agent_id": "P2G-LONDON-EDGE-01", "tenant_id": "TEN-PRINT2GO", "location_id": "LOC-LONDON",
            "state": "OFFLINE", "token": None, "capabilities": ["FIERY_IMPORT", "FIERY_IMPOSE"],
            "last_heartbeat": None, "registered_at": now_iso()})
