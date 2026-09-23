"""V0.4 Repair verification — system-status honesty, exceptions/orders sync,
search, CAD, test-data separation. Run against public REACT_APP_BACKEND_URL."""
import os
import time
import pytest
import requests
from pathlib import Path

# Load frontend/.env to get the public URL for testing
_env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
for line in _env.read_text().splitlines():
    if line.startswith("REACT_APP_BACKEND_URL="):
        os.environ["REACT_APP_BACKEND_URL"] = line.split("=", 1)[1].strip()

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"


# --- Issue 1: /api/system-status authoritative ---
def test_system_status_shape_and_agent_not_online():
    r = requests.get(f"{API}/system-status", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("items", "summary", "level", "online", "total", "production_mode", "production_note"):
        assert k in d, f"missing {k}"
    assert "Simulation only" in d["production_note"]
    assert "NOT_IMPLEMENTED" in d["production_note"]
    by = {i["id"]: i for i in d["items"]}
    # Agent must not be ONLINE (no real HMAC heartbeat)
    assert by["agent-london-01"]["status"] in ("OFFLINE", "STALE", "SIMULATED", "NOT_CONFIGURED"), by["agent-london-01"]
    assert by["agent-london-01"]["status"] != "ONLINE"
    # PX300 / London BC must NEVER be ONLINE unless agent-online + fresh discovery
    assert by["fiery-px300"]["status"] != "ONLINE"
    assert by["london-bc"]["status"] != "ONLINE"
    # Summary must reflect degraded state, not "All Systems Operational"
    assert d["summary"] != "All Systems Operational"
    assert d["level"] in ("critical", "warn")


# --- Issue 4: CAD & location ---
def test_location_is_london_ontario_cad():
    r = requests.get(f"{API}/locations", timeout=15)
    assert r.status_code == 200
    locs = r.json()
    london = next((l for l in locs if l["name"] == "Print2Go London"), None)
    assert london, "London location missing"
    assert london.get("city") == "London, ON, Canada"
    assert london.get("currency") == "CAD"


# --- Issue 5: test-data separation ---
def test_orders_exclude_test_by_default():
    r_def = requests.get(f"{API}/orders", timeout=15).json()
    r_inc = requests.get(f"{API}/orders?include_test=true", timeout=15).json()
    assert all(not o.get("is_test") for o in r_def)
    assert len(r_inc) >= len(r_def)


def test_products_exclude_test_by_default():
    r_def = requests.get(f"{API}/products", timeout=15).json()
    r_inc = requests.get(f"{API}/products?include_test=true", timeout=15).json()
    assert all(not p.get("is_test") for p in r_def)
    assert len(r_inc) >= len(r_def)


def test_edge_v2_agents_exclude_test_by_default():
    r_def = requests.get(f"{API}/production/edge-v2/agents", timeout=15).json()
    r_inc = requests.get(f"{API}/production/edge-v2/agents?include_test=true", timeout=15).json()
    # response shape may be list or {items: [...]}
    def _items(x): return x if isinstance(x, list) else x.get("items", x.get("agents", []))
    a_def = _items(r_def); a_inc = _items(r_inc)
    for a in a_def:
        assert not (a.get("agent_id", "").startswith("TEST-EDGE"))
    assert len(a_inc) >= len(a_def)


# --- Issue 3: search ---
def test_search_order_by_number():
    r = requests.get(f"{API}/search", params={"q": "58311"}, timeout=15).json()
    assert r["count"] >= 1
    kinds = {x["type"] for x in r["results"]}
    assert "order" in kinds
    hit = next(x for x in r["results"] if x["type"] == "order")
    assert "58311" in hit["title"]
    assert "/orders?q=58311" == hit["route"] or hit["route"].endswith("q=58311")


def test_search_with_hash_prefix():
    r = requests.get(f"{API}/search", params={"q": "#58311"}, timeout=15).json()
    assert r["count"] >= 1


def test_search_no_results():
    r = requests.get(f"{API}/search", params={"q": "zzznoresultzz"}, timeout=15).json()
    assert r["count"] == 0


# --- Issue 2: exception <-> order sync ---
def test_exception_order_sync_roundtrip():
    # create a fresh order
    payload = {"product_name": "TEST_UI_Order_Sync", "quantity": 1,
               "customer": "TEST_customer", "status": "waiting"}
    o = requests.post(f"{API}/orders", json=payload, timeout=15).json()
    order_num = o["order_number"]
    try:
        # inject an exception referring to order_number
        exc_doc = {"order_ref": order_num, "product": "TEST", "issue": "TEST test",
                   "severity": "high", "resolved": False}
        # No POST /exceptions endpoint — use direct mongo via a helper endpoint if any.
        # Instead, we simulate the state by calling reconcile via dashboard/stats after
        # inserting through the debug path: we POST a raw doc using the audit-log side-effect
        # is not available, so use pymongo directly.
        import pymongo
        from pathlib import Path as _P
        backend_env = _P("/app/backend/.env").read_text().splitlines()
        mongo_url = next(l.split("=", 1)[1].strip().strip('"') for l in backend_env if l.startswith("MONGO_URL="))
        db_name = next(l.split("=", 1)[1].strip().strip('"') for l in backend_env if l.startswith("DB_NAME="))
        m = pymongo.MongoClient(mongo_url)[db_name]
        import uuid as _u
        exc_id = str(_u.uuid4())
        m.exceptions.insert_one({"id": exc_id, **exc_doc,
                                 "created_at": "2026-01-01T00:00:00+00:00"})
        # Trigger reconcile
        stats = requests.get(f"{API}/dashboard/stats", timeout=15).json()
        # Fetch order
        orders = requests.get(f"{API}/orders", timeout=15).json()
        this_o = next(x for x in orders if x["order_number"] == order_num)
        assert this_o["status"] == "exception", f"expected exception, got {this_o['status']}"
        # need_attention must include our order
        assert stats["need_attention"]["value"] >= 1
        assert stats["open_exceptions"] >= 1

        # Resolve
        rr = requests.post(f"{API}/exceptions/{exc_id}/resolve", timeout=15)
        assert rr.status_code == 200
        orders2 = requests.get(f"{API}/orders", timeout=15).json()
        after = next(x for x in orders2 if x["order_number"] == order_num)
        assert after["status"] == "waiting", f"expected waiting, got {after['status']}"
        assert after["current_step"] == "Awaiting review"
        assert after["status"] not in ("ready", "completed")

        # cleanup exception
        m.exceptions.delete_one({"id": exc_id})
    finally:
        requests.delete(f"{API}/orders/{o['id']}", timeout=15)


# --- Issue 7 production truth (Production engine still MOCK/locked) ---
def test_production_engine_still_locked():
    r = requests.get(f"{API}/production/engine/status", timeout=15)
    if r.status_code == 404:
        pytest.skip("engine status endpoint not present under expected path")
    d = r.json()
    # look for a plausible flag
    s = str(d).lower()
    assert "not_implemented" in s or "mock" in s
