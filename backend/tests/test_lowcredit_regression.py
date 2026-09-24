"""Regression tests for LOW-CREDIT UX pass: assistant chat, orders, dashboard, system-status, edge enrollment."""
import os
import json
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")


def test_dashboard_stats():
    r = requests.get(f"{BASE_URL}/api/dashboard/stats", timeout=15)
    assert r.status_code == 200
    data = r.json()
    for k in ["total_orders", "in_production", "need_attention", "completed_today"]:
        assert k in data, f"missing {k}"


def test_system_status():
    r = requests.get(f"{BASE_URL}/api/system-status", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "level" in data


def test_assistant_providers():
    r = requests.get(f"{BASE_URL}/api/assistant/providers", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "default" in d


def test_assistant_chat_streams():
    sid = f"test-{uuid.uuid4().hex[:8]}"
    r = requests.post(
        f"{BASE_URL}/api/assistant/chat",
        json={"session_id": sid, "message": "Say hi in one word.", "provider": "anthropic"},
        stream=True, timeout=60,
    )
    assert r.status_code == 200
    got_delta = False
    for line in r.iter_lines(decode_unicode=True):
        if line and line.startswith("data:"):
            try:
                payload = json.loads(line[5:].strip())
                if payload.get("delta"):
                    got_delta = True
                    break
            except Exception:
                pass
    assert got_delta, "assistant did not stream any delta"


def test_order_crud_no_duplicates():
    payload = {
        "product_name": "TEST_LC_Draft Cards",
        "product_spec": "3.5x2",
        "category": "business_cards",
        "quantity": 250,
        "status": "waiting",
        "current_step": "Prepress",
        "priority": "normal",
        "customer": "TEST_LC",
    }
    r = requests.post(f"{BASE_URL}/api/orders", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    oid = created.get("id")
    assert oid
    # GET verify
    g = requests.get(f"{BASE_URL}/api/orders", timeout=15)
    assert g.status_code == 200
    found = [o for o in g.json() if o.get("id") == oid]
    assert len(found) == 1
    assert found[0]["product_name"] == payload["product_name"]
    # cleanup
    requests.delete(f"{BASE_URL}/api/orders/{oid}", timeout=15)


def test_enrollment_token_mint():
    r = requests.post(f"{BASE_URL}/api/production/edge-v2/enrollment-tokens", json={}, timeout=15)
    assert r.status_code in (200, 201), r.text
    d = r.json()
    assert "enrollment_token" in d
    assert d["enrollment_token"].startswith("ENROLL-")


def test_edge_agents_offline():
    r = requests.get(f"{BASE_URL}/api/production/edge-v2/agents", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "agents" in d
