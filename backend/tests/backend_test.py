"""Print2Go Production OS - Backend API tests"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Health & seed ----------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_dashboard_stats(s):
    r = s.get(f"{API}/dashboard/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ("total_orders", "in_production", "need_attention", "completed_today"):
        assert k in d
        assert "value" in d[k]
    assert d["total_orders"]["value"] >= 14  # seeded 14 orders


# ---------- Read-only collections ----------
@pytest.mark.parametrize("path,min_count", [
    ("orders", 14), ("products", 8), ("recipes", 3), ("processes", 7),
    ("machines", 6), ("edge-agents", 3), ("files", 5), ("sops", 5),
    ("exceptions", 5), ("audit-logs", 0), ("locations", 3), ("users", 5),
    ("tenants", 3), ("system-status", 6),
])
def test_list_endpoints(s, path, min_count):
    r = s.get(f"{API}/{path}")
    assert r.status_code == 200, f"{path} failed: {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= min_count, f"{path} returned {len(data)}, expected >= {min_count}"
    # verify no mongo _id leaks
    if data:
        assert "_id" not in data[0]


def test_reports(s):
    r = s.get(f"{API}/reports")
    assert r.status_code == 200
    d = r.json()
    for k in ("orders_by_status", "orders_by_category", "weekly_throughput", "machine_utilization"):
        assert k in d
    assert len(d["weekly_throughput"]) == 7


# ---------- Orders CRUD ----------
def test_order_crud(s):
    payload = {
        "product_name": "TEST_Flyers", "product_spec": "A5 Gloss",
        "category": "flyers", "quantity": 100, "status": "waiting",
        "current_step": "Prepress", "priority": "normal", "customer": "TEST_Customer",
    }
    r = s.post(f"{API}/orders", json=payload)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["product_name"] == "TEST_Flyers"
    assert created["order_number"].startswith("#")
    oid = created["id"]

    # GET list contains it
    r = s.get(f"{API}/orders")
    assert any(o["id"] == oid for o in r.json())

    # Filter by status
    r = s.get(f"{API}/orders", params={"status": "waiting"})
    assert r.status_code == 200
    assert all(o["status"] == "waiting" for o in r.json())

    # Update
    r = s.put(f"{API}/orders/{oid}", json={"status": "running", "current_step": "Printing"})
    assert r.status_code == 200
    assert r.json()["status"] == "running"

    # Delete
    r = s.delete(f"{API}/orders/{oid}")
    assert r.status_code == 200
    r = s.get(f"{API}/orders")
    assert not any(o["id"] == oid for o in r.json())


def test_order_update_404(s):
    r = s.put(f"{API}/orders/nope-nope", json={"status": "running"})
    assert r.status_code == 404


# ---------- Products CRUD ----------
def test_product_crud(s):
    r = s.post(f"{API}/products", json={"name": "TEST_Poster", "category": "posters"})
    assert r.status_code == 200
    pid = r.json()["id"]
    assert r.json()["name"] == "TEST_Poster"
    r = s.get(f"{API}/products")
    assert any(p["id"] == pid for p in r.json())
    r = s.delete(f"{API}/products/{pid}")
    assert r.status_code == 200


# ---------- Machines CRUD ----------
def test_machine_crud(s):
    r = s.post(f"{API}/machines", json={"name": "TEST_Machine", "type": "printer"})
    assert r.status_code == 200
    mid = r.json()["id"]
    r = s.put(f"{API}/machines/{mid}", json={"status": "offline"})
    assert r.status_code == 200
    assert r.json()["status"] == "offline"


# ---------- Recipes CRUD ----------
def test_recipe_crud(s):
    r = s.post(f"{API}/recipes", json={"name": "TEST_Recipe", "product": "Cards"})
    assert r.status_code == 200
    rid = r.json()["id"]
    r = s.delete(f"{API}/recipes/{rid}")
    assert r.status_code == 200


# ---------- Exceptions resolve ----------
def test_exception_resolve(s):
    r = s.get(f"{API}/exceptions")
    open_exc = [e for e in r.json() if not e.get("resolved")]
    if not open_exc:
        pytest.skip("no open exception")
    eid = open_exc[0]["id"]
    r = s.post(f"{API}/exceptions/{eid}/resolve")
    assert r.status_code == 200
    r = s.get(f"{API}/exceptions")
    found = next(e for e in r.json() if e["id"] == eid)
    assert found["resolved"] is True


# ---------- AI Recipe Import (real LLM) ----------
def test_recipe_ai_import(s):
    payload = {
        "source_type": "chat",
        "content": "Produce 500 matte laminated business cards on 350gsm silk stock, CMYK duplex on Fiery PX300, matte lamination, guillotine to 90x50mm.",
        "save": False,
    }
    r = s.post(f"{API}/recipes/import", json=payload, timeout=60)
    assert r.status_code == 200, r.text[:400]
    d = r.json()
    for k in ("name", "materials", "machines", "processes", "steps"):
        assert k in d
    assert isinstance(d["steps"], list) and len(d["steps"]) >= 1
