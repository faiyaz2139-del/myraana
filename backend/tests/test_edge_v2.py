"""Print2Go V0.3 Real Edge Agent (edge-v2) + Fiery Discovery tests"""
import hashlib
import hmac
import json
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PROD = f"{API}/production"


def sign(secret: str, method: str, path: str, ts: str, body: bytes) -> str:
    body_hash = hashlib.sha256(body or b"").hexdigest()
    msg = f"{method}\n{path}\n{ts}\n{body_hash}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def signed_headers(agent_id, secret, method, path, body: bytes = b"", ts=None):
    ts = ts or str(int(time.time()))
    return {
        "X-P2G-Agent": agent_id,
        "X-P2G-Timestamp": ts,
        "X-P2G-Signature": sign(secret, method, path, ts, body),
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def agent(s):
    tok = s.post(f"{PROD}/edge-v2/enrollment-tokens", json={}).json()["enrollment_token"]
    r = s.post(f"{PROD}/edge-v2/register", json={
        "agent_id": "TEST-EDGE-1",
        "tenant_id": "TEN-PRINT2GO",
        "location_id": "LOC-LONDON",
        "agent_kind": "REAL",
        "enrollment_token": tok,
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["token"] and d["signing_secret"] and d["token_expires_at"]
    return {"agent_id": d["agent_id"], "secret": d["signing_secret"]}


# ---------- Config ----------
def test_config_allowlist_and_prohibited(s):
    r = s.get(f"{PROD}/config")
    assert r.status_code == 200
    d = r.json()
    assert len(d["action_allowlist"]) == 6
    assert len(d["prohibited_actions"]) == 9
    assert set(d["agent_kinds"]) == {"REAL", "MOCK"}
    assert d["device_roles"] == ["FIERY_PRIMARY"]


# ---------- register ----------
def test_register_wrong_tenant(s):
    r = s.post(f"{PROD}/edge-v2/register", json={
        "agent_id": "TEST-EDGE-BAD", "tenant_id": "BAD",
        "location_id": "LOC-LONDON", "agent_kind": "REAL"})
    assert r.status_code == 400


def test_register_wrong_location(s):
    r = s.post(f"{PROD}/edge-v2/register", json={
        "agent_id": "TEST-EDGE-BAD", "tenant_id": "TEN-PRINT2GO",
        "location_id": "BAD", "agent_kind": "REAL"})
    assert r.status_code == 400


# ---------- signed heartbeat ----------
def test_heartbeat_valid_signature(s, agent):
    path = "/api/production/edge-v2/heartbeat"
    body = b""
    headers = signed_headers(agent["agent_id"], agent["secret"], "POST", path, body)
    r = requests.post(f"{BASE_URL}{path}", data=body, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["real_online"] is True
    # list should show REAL_ONLINE
    a = {x["agent_id"]: x for x in s.get(f"{PROD}/edge-v2/agents?include_test=true").json()["agents"]}
    assert a[agent["agent_id"]]["live_state"] == "REAL_ONLINE"


def test_heartbeat_missing_signature(s, agent):
    r = requests.post(f"{BASE_URL}/api/production/edge-v2/heartbeat", json={})
    assert r.status_code == 401


def test_heartbeat_wrong_signature(s, agent):
    path = "/api/production/edge-v2/heartbeat"
    ts = str(int(time.time()))
    headers = {
        "X-P2G-Agent": agent["agent_id"],
        "X-P2G-Timestamp": ts,
        "X-P2G-Signature": "0" * 64,
        "Content-Type": "application/json",
    }
    r = requests.post(f"{BASE_URL}{path}", data=b"", headers=headers)
    assert r.status_code == 401


def test_stale_timestamp(s, agent):
    path = "/api/production/edge-v2/heartbeat"
    ts = str(int(time.time()) - 400)  # >300s
    headers = signed_headers(agent["agent_id"], agent["secret"], "POST", path, b"", ts=ts)
    r = requests.post(f"{BASE_URL}{path}", data=b"", headers=headers)
    assert r.status_code == 401


def test_unknown_agent_signed(s):
    path = "/api/production/edge-v2/heartbeat"
    headers = signed_headers("NOPE-AGENT", "fake-secret", "POST", path, b"")
    r = requests.post(f"{BASE_URL}{path}", data=b"", headers=headers)
    assert r.status_code == 401


# ---------- allowlist enqueue ----------
def test_enqueue_ping_allowed(s, agent):
    r = s.post(f"{PROD}/edge-v2/agents/{agent['agent_id']}/enqueue",
               json={"action": "PING", "idempotency_key": "k-ping-1"})
    assert r.status_code == 200
    d = r.json()
    assert d["queued"] is True
    assert d["action"]["action"] == "PING"


def test_enqueue_print_prohibited(s, agent):
    r = s.post(f"{PROD}/edge-v2/agents/{agent['agent_id']}/enqueue",
               json={"action": "PRINT"})
    assert r.status_code == 403


def test_enqueue_delete_job_prohibited(s, agent):
    r = s.post(f"{PROD}/edge-v2/agents/{agent['agent_id']}/enqueue",
               json={"action": "DELETE_JOB"})
    assert r.status_code == 403


def test_enqueue_unknown_action(s, agent):
    r = s.post(f"{PROD}/edge-v2/agents/{agent['agent_id']}/enqueue",
               json={"action": "FOO"})
    assert r.status_code == 400


def test_enqueue_idempotency(s, agent):
    key = "idem-dup-1"
    r1 = s.post(f"{PROD}/edge-v2/agents/{agent['agent_id']}/enqueue",
                json={"action": "PING", "idempotency_key": key})
    assert r1.status_code == 200
    a1 = r1.json()["action"]
    r2 = s.post(f"{PROD}/edge-v2/agents/{agent['agent_id']}/enqueue",
                json={"action": "PING", "idempotency_key": key})
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2.get("idempotent") is True
    assert d2["action"]["id"] == a1["id"]


# ---------- poll / ack / result / redaction ----------
def test_full_action_lifecycle_and_redaction(s, agent):
    # enqueue a fresh PING
    key = f"lifecycle-{int(time.time())}"
    r = s.post(f"{PROD}/edge-v2/agents/{agent['agent_id']}/enqueue",
               json={"action": "PING", "idempotency_key": key,
                     "params": {"host": "192.168.0.200"}})
    action_id = r.json()["action"]["id"]

    # signed poll -> DISPATCHED
    path = "/api/production/edge-v2/actions"
    headers = signed_headers(agent["agent_id"], agent["secret"], "GET", path, b"")
    r = requests.get(f"{BASE_URL}{path}", headers=headers)
    assert r.status_code == 200
    acts = r.json()["actions"]
    assert any(a["id"] == action_id for a in acts)

    # ack
    ack_path = f"/api/production/edge-v2/actions/{action_id}/ack"
    headers = signed_headers(agent["agent_id"], agent["secret"], "POST", ack_path, b"")
    r = requests.post(f"{BASE_URL}{ack_path}", data=b"", headers=headers)
    assert r.status_code == 200

    # result with embedded IP in evidence note + key host
    result_path = f"/api/production/edge-v2/actions/{action_id}/result"
    body = json.dumps({
        "ok": True,
        "result": {"host": "192.168.0.200"},
        "evidence": {"note": "ping 10.0.0.5 succeeded"},
    }).encode()
    headers = signed_headers(agent["agent_id"], agent["secret"], "POST", result_path, body)
    r = requests.post(f"{BASE_URL}{result_path}", data=body, headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "SUCCEEDED"

    # fetch action; verify both IPs redacted
    r = s.get(f"{PROD}/edge-v2/actions/{action_id}")
    assert r.status_code == 200
    a = r.json()
    # host key redaction
    assert a["result"]["host"] == "[REDACTED]"
    # embedded regex redaction
    assert "10.0.0.5" not in json.dumps(a)
    assert "192.168.0.200" not in json.dumps(a)
    assert "[REDACTED]" in a["evidence"]["note"]


# ---------- audit chain ----------
def test_edge_audit_chain(s, agent):
    r = s.get(f"{PROD}/edge-v2/audit/{agent['agent_id']}")
    assert r.status_code == 200
    d = r.json()
    assert d["chain_valid"] is True
    actions = [e["action"] for e in d["entries"]]
    decisions = [(e["action"], e["decision"]) for e in d["entries"]]
    assert "REGISTER" in actions
    assert ("PRINT", "DENY") in decisions
    assert any(a.endswith("_RESULT") for a in actions)


# ---------- Safe-area PREFLIGHT ----------
def _create_job(s, **overrides):
    body = {"tenant_id": "TEN-PRINT2GO", "location_id": "LOC-LONDON",
            "product_code": "PROD-BC-001", "recipe_id": "RECIPE-BC-LONDON-V1",
            "customer": "TEST_SA", "orientation": "LANDSCAPE", "sides": 1,
            "safe_area_ok": True, "protected_content_review": False}
    body.update(overrides)
    r = s.post(f"{PROD}/jobs", json=body)
    assert r.status_code == 200
    return r.json()


def _adv(s, jid, **b):
    r = s.post(f"{PROD}/jobs/{jid}/advance", json=b or {})
    assert r.status_code == 200
    return r.json()


def test_safe_area_pass_safe_content(s):
    j = _create_job(s)
    jid = j["id"]
    s.post(f"{PROD}/jobs/{jid}/dev-artwork", params={"variant": "safe_content"})
    # ARTWORK_RECEIVED -> PREFLIGHT -> execute PREFLIGHT
    _adv(s, jid, use_mock_fiery=True)  # advance into PREFLIGHT
    r = _adv(s, jid, use_mock_fiery=True)  # execute PREFLIGHT
    ev = r.get("evidence", {})
    sa = ev.get("safe_area") or {}
    assert sa.get("status") == "PASS", r


def test_safe_area_unsafe_stops(s):
    j = _create_job(s)
    jid = j["id"]
    s.post(f"{PROD}/jobs/{jid}/dev-artwork", params={"variant": "unsafe_content"})
    _adv(s, jid, use_mock_fiery=True)
    r = _adv(s, jid, use_mock_fiery=True)
    job = s.get(f"{PROD}/jobs/{jid}").json()["job"]
    assert job["stop"] and job["stop"]["code"] == "UNSAFE_SAFE_AREA"
    sa = r.get("safe_area") or {}
    assert sa.get("nearest_in", 1.0) < 0.125


def test_safe_area_review_required(s):
    j = _create_job(s, safe_area_unknown=True)
    jid = j["id"]
    s.post(f"{PROD}/jobs/{jid}/dev-artwork", params={"variant": "correct_landscape_bleed"})
    _adv(s, jid, use_mock_fiery=True)
    _adv(s, jid, use_mock_fiery=True)
    job = s.get(f"{PROD}/jobs/{jid}").json()["job"]
    assert job["stop"] and job["stop"]["code"] == "SAFE_AREA_REVIEW_REQUIRED"


def test_safe_area_blank_correct_landscape_pass(s):
    j = _create_job(s)
    jid = j["id"]
    s.post(f"{PROD}/jobs/{jid}/dev-artwork", params={"variant": "correct_landscape_bleed"})
    _adv(s, jid, use_mock_fiery=True)
    r = _adv(s, jid, use_mock_fiery=True)
    ev = r.get("evidence", {})
    sa = ev.get("safe_area") or {}
    assert sa.get("status") == "PASS", r
