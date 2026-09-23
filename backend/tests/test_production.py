"""Print2Go V0.2 Production Engine tests"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PROD = f"{API}/production"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _create_job(s, **overrides):
    body = {"tenant_id": "TEN-PRINT2GO", "location_id": "LOC-LONDON",
            "product_code": "PROD-BC-001", "recipe_id": "RECIPE-BC-LONDON-V1",
            "customer": "TEST_Customer", "orientation": "LANDSCAPE", "sides": 1,
            "safe_area_ok": True, "protected_content_review": False}
    body.update(overrides)
    r = s.post(f"{PROD}/jobs", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _artwork(s, job_id, variant):
    r = s.post(f"{PROD}/jobs/{job_id}/dev-artwork", params={"variant": variant})
    assert r.status_code == 200, r.text
    return r.json()


def _advance(s, job_id, **body):
    r = s.post(f"{PROD}/jobs/{job_id}/advance", json=body or {})
    assert r.status_code == 200, r.text
    return r.json()


def _run_to(s, job_id, target_state, **advance_body):
    for _ in range(20):
        j = requests.get(f"{PROD}/jobs/{job_id}").json()["job"]
        if j["state"] == target_state or j.get("stop"):
            return j
        _advance(s, job_id, **advance_body)
    raise RuntimeError(f"did not reach {target_state}")


# ---------- Config & Fiery status ----------
def test_config(s):
    r = s.get(f"{PROD}/config")
    assert r.status_code == 200
    d = r.json()
    assert d["REAL_FIERY_BACKEND"] == "NOT_IMPLEMENTED"
    assert len(d["workflow"]) == 12
    assert "MISSING_BACK" in d["stop_codes"]
    assert set(d["policy_decisions"]) >= {"ALLOW", "DENY", "HUMAN_APPROVAL_REQUIRED", "CONFIGURATION_REQUIRED"}


def test_fiery_status(s):
    r = s.get(f"{PROD}/fiery-status")
    assert r.status_code == 200
    d = r.json()
    assert d["active_mode"] == "MOCK"
    assert d["REAL_FIERY_BACKEND"] == "NOT_IMPLEMENTED"
    assert "warning" in d and "MOCK" in d["warning"].upper() or "mock" in d["warning"].lower()


# ---------- Happy path ----------
def test_happy_path_landscape(s):
    job = _create_job(s)
    jid = job["id"]
    _artwork(s, jid, "correct_landscape_bleed")
    j = _run_to(s, jid, "PRODUCTION_AUTHORIZATION_REQUIRED", use_mock_fiery=True)
    assert j["state"] == "PRODUCTION_AUTHORIZATION_REQUIRED"
    # advance without authorize -> HUMAN_APPROVAL_REQUIRED
    r = _advance(s, jid, use_mock_fiery=True)
    assert r["policy"]["decision"] == "HUMAN_APPROVAL_REQUIRED"
    # authorize
    r = s.post(f"{PROD}/jobs/{jid}/authorize", json={"actor": "Mohammad Amin"})
    assert r.status_code == 200
    j = s.get(f"{PROD}/jobs/{jid}").json()["job"]
    assert j["state"] == "PRODUCTION_AUTHORIZED"
    # file lineage roles
    files = s.get(f"{PROD}/jobs/{jid}").json()["files"]
    roles = {f["role"] for f in files}
    assert {"ORIGINAL", "WORKING_COPY", "PRINT_READY", "PRODUCTION_OUTPUT"} <= roles
    # recipe version pinned
    assert j["recipe_version"] == "v1"


def test_trim_only_expands_to_bleed(s):
    job = _create_job(s)
    jid = job["id"]
    _artwork(s, jid, "trim_only")
    _run_to(s, jid, "PRODUCTION_AUTHORIZATION_REQUIRED", use_mock_fiery=True)
    files = s.get(f"{PROD}/jobs/{jid}").json()["files"]
    wc = [f for f in files if f["role"] == "WORKING_COPY"][0]
    mb = wc["metadata"]["mediabox_in"]
    assert abs(mb[0] - 3.75) < 0.05 and abs(mb[1] - 2.25) < 0.05


def test_portrait_ok(s):
    job = _create_job(s, orientation="PORTRAIT")
    jid = job["id"]
    _artwork(s, jid, "correct_portrait_bleed")
    j = _run_to(s, jid, "PRODUCTION_AUTHORIZATION_REQUIRED", use_mock_fiery=True)
    assert j["state"] == "PRODUCTION_AUTHORIZATION_REQUIRED"


def test_double_sided_ok(s):
    job = _create_job(s, sides=2)
    jid = job["id"]
    _artwork(s, jid, "double_sided_ok")
    j = _run_to(s, jid, "PRODUCTION_AUTHORIZATION_REQUIRED", use_mock_fiery=True)
    assert j["state"] == "PRODUCTION_AUTHORIZATION_REQUIRED"


# ---------- STOP codes ----------
@pytest.mark.parametrize("variant,sides,expected_stop", [
    ("missing_back", 2, "MISSING_BACK"),
    ("wrong_dimensions", 1, "WRONG_DIMENSIONS"),
    ("wrong_aspect", 1, "WRONG_ASPECT_RATIO"),
])
def test_preflight_stops(s, variant, sides, expected_stop):
    job = _create_job(s, sides=sides)
    jid = job["id"]
    _artwork(s, jid, variant)
    j = _run_to(s, jid, "PREFLIGHT", use_mock_fiery=True)
    # Advance from PREFLIGHT to trigger stop
    _advance(s, jid, use_mock_fiery=True)
    j = s.get(f"{PROD}/jobs/{jid}").json()["job"]
    assert j["stop"] and j["stop"]["code"] == expected_stop
    assert j["status"] == "STOPPED"
    # STOP enforcement: next advance -> DENY ACTIVE_STOP
    r = _advance(s, jid, use_mock_fiery=True)
    assert r["policy"]["decision"] == "DENY"
    assert r["policy"]["reason"] == "ACTIVE_STOP"


def test_unsafe_safe_area(s):
    job = _create_job(s, safe_area_ok=False)
    jid = job["id"]
    _artwork(s, jid, "correct_landscape_bleed")
    _run_to(s, jid, "PREFLIGHT", use_mock_fiery=True)
    _advance(s, jid, use_mock_fiery=True)
    j = s.get(f"{PROD}/jobs/{jid}").json()["job"]
    assert j["stop"]["code"] == "UNSAFE_SAFE_AREA"


def test_protected_content(s):
    job = _create_job(s, protected_content_review=True)
    jid = job["id"]
    _artwork(s, jid, "correct_landscape_bleed")
    _run_to(s, jid, "PREFLIGHT", use_mock_fiery=True)
    _advance(s, jid, use_mock_fiery=True)
    j = s.get(f"{PROD}/jobs/{jid}").json()["job"]
    assert j["stop"]["code"] == "PROTECTED_CONTENT_REVIEW"


@pytest.mark.parametrize("simulate,target,expected_stop", [
    ("PDF_EXPORT_FAILED", "PRINT_READY_GENERATION", "PDF_EXPORT_FAILED"),
    ("TEMPLATE_NOT_FOUND", "IMPOSITION", "TEMPLATE_NOT_FOUND"),
    ("JOB_AMBIGUOUS", "FIERY_PREPARATION", "JOB_AMBIGUOUS"),
])
def test_simulate_stops(s, simulate, target, expected_stop):
    job = _create_job(s)
    jid = job["id"]
    _artwork(s, jid, "correct_landscape_bleed")
    _run_to(s, jid, target, use_mock_fiery=True)
    _advance(s, jid, use_mock_fiery=True, simulate=simulate)
    j = s.get(f"{PROD}/jobs/{jid}").json()["job"]
    assert j["stop"] and j["stop"]["code"] == expected_stop


def test_device_offline_denies(s):
    job = _create_job(s)
    jid = job["id"]
    _artwork(s, jid, "correct_landscape_bleed")
    _run_to(s, jid, "PRODUCTION_ROUTING", use_mock_fiery=True)
    r = _advance(s, jid, use_mock_fiery=True, simulate="DEVICE_OFFLINE")
    assert r["policy"]["decision"] == "DENY"
    assert r["policy"]["reason"] == "DEVICE_OFFLINE"
    j = s.get(f"{PROD}/jobs/{jid}").json()["job"]
    assert j["stop"] and j["stop"]["code"] == "DEVICE_OFFLINE"


def test_real_fiery_unavailable(s):
    job = _create_job(s)
    jid = job["id"]
    _artwork(s, jid, "correct_landscape_bleed")
    _run_to(s, jid, "PRODUCTION_ROUTING", use_mock_fiery=True)
    r = _advance(s, jid, use_mock_fiery=False)
    assert r["policy"]["decision"] == "DENY"
    assert "FIERY_UNAVAILABLE" in r["policy"]["reason"]


# ---------- Auth gate ----------
def test_ai_cannot_authorize(s):
    job = _create_job(s)
    jid = job["id"]
    _artwork(s, jid, "correct_landscape_bleed")
    _run_to(s, jid, "PRODUCTION_AUTHORIZATION_REQUIRED", use_mock_fiery=True)
    r = s.post(f"{PROD}/jobs/{jid}/authorize", json={"actor": "AI", "ai_actor": True})
    assert r.status_code == 403
    r = _advance(s, jid, use_mock_fiery=True, ai_actor=True)
    assert r["policy"]["decision"] == "DENY"
    assert r["policy"]["reason"] == "AI_CANNOT_AUTHORIZE_PRODUCTION"


# ---------- Bad tenant/location ----------
def test_wrong_tenant(s):
    r = s.post(f"{PROD}/jobs", json={"tenant_id": "BAD", "location_id": "LOC-LONDON",
                                     "product_code": "PROD-BC-001", "recipe_id": "RECIPE-BC-LONDON-V1"})
    assert r.status_code == 400


def test_wrong_location(s):
    r = s.post(f"{PROD}/jobs", json={"tenant_id": "TEN-PRINT2GO", "location_id": "BAD",
                                     "product_code": "PROD-BC-001", "recipe_id": "RECIPE-BC-LONDON-V1"})
    assert r.status_code == 400


# ---------- Audit chain ----------
def test_audit_chain(s):
    job = _create_job(s)
    jid = job["id"]
    _artwork(s, jid, "correct_landscape_bleed")
    _run_to(s, jid, "PRODUCTION_AUTHORIZATION_REQUIRED", use_mock_fiery=True)
    r = s.get(f"{PROD}/audit/{jid}")
    assert r.status_code == 200
    d = r.json()
    assert d["chain_valid"] is True
    assert d["count"] > 5
    for e in d["entries"]:
        assert "policy_decision" in e
        assert e["recipe_version"] == "v1"


# ---------- Idempotency ----------
def test_idempotency_key_stored(s):
    job = _create_job(s)
    jid = job["id"]
    _artwork(s, jid, "correct_landscape_bleed")
    _run_to(s, jid, "PRODUCTION_AUTHORIZATION_REQUIRED", use_mock_fiery=True)
    # Look at audit entries for FIERY_PREPARATION completion
    entries = s.get(f"{PROD}/audit/{jid}").json()["entries"]
    fp = [e for e in entries if "FIERY_PREPARATION" in e.get("action", "")]
    assert fp, "expected audit entry for FIERY_PREPARATION"
    assert any(e.get("evidence", {}).get("idempotency_key") or e.get("evidence", {}).get("idempotent") for e in fp)


# ---------- Edge agent protocol ----------
def test_edge_register_heartbeat(s):
    aid = "TEST-EDGE-AGENT-99"
    r = s.post(f"{PROD}/edge/register", json={"agent_id": aid})
    assert r.status_code == 200
    d = r.json()
    assert d["state"] == "REGISTERING" and d["token"]
    # Before heartbeat - OFFLINE (via list)
    r = s.get(f"{PROD}/edge/agents")
    agents = {a["agent_id"]: a for a in r.json()["agents"]}
    assert agents["P2G-LONDON-EDGE-01"]["live_state"] == "OFFLINE"
    # Heartbeat
    r = s.post(f"{PROD}/edge/{aid}/heartbeat", json={"state": "ONLINE"})
    assert r.status_code == 200
    r = s.get(f"{PROD}/edge/agents")
    agents = {a["agent_id"]: a for a in r.json()["agents"]}
    assert agents[aid]["live_state"] == "ONLINE"
    # Poll actions
    r = s.get(f"{PROD}/edge/{aid}/actions")
    assert r.status_code == 200 and "actions" in r.json()


# ---------- AI recipe import safety ----------
def test_ai_import_returns_draft(s):
    payload = {"source_type": "chat",
               "content": "Produce 500 matte laminated business cards on 350gsm silk, CMYK duplex on Fiery PX300, matte lamination, guillotine to 90x50mm.",
               "save": False}
    r = s.post(f"{API}/recipes/import", json=payload, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "DRAFT"
    assert d["extraction_model"]
    assert "source_type" in d["provenance"]


def test_ai_import_incomplete_configuration_required(s):
    payload = {"source_type": "chat", "content": "hello", "save": False}
    r = s.post(f"{API}/recipes/import", json=payload, timeout=60)
    # AI may reject or return incomplete
    if r.status_code == 200:
        d = r.json()
        assert d["status"] == "DRAFT"
        assert d["review_status"] in ("CONFIGURATION_REQUIRED", "REVIEW_REQUIRED")
