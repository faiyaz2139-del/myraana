"""Print2Go V0.3A On-Prem Windows Discovery + Enrollment Tokens tests.

IMPORTANT ordering:
- Test open register BEFORE minting any enrollment token (enrollment gating is by
  tenant+location; once a token exists, registers in that location require one).
"""
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PROD = f"{API}/production"
TENANT = "TEN-PRINT2GO"
LOC = "LOC-LONDON"


def sign(secret, method, path, ts, body):
    body_hash = hashlib.sha256(body or b"").hexdigest()
    msg = f"{method}\n{path}\n{ts}\n{body_hash}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def signed_headers(agent_id, secret, method, path, body=b"", ts=None):
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


# ---- 1) Open register (must run FIRST — before any token is minted) ----
def test_a1_open_register_without_token_when_none_minted(s):
    aid = f"TEST-EDGE-OPEN-{uuid.uuid4().hex[:6].upper()}"
    r = s.post(f"{PROD}/edge-v2/register", json={
        "agent_id": aid, "tenant_id": TENANT,
        "location_id": LOC, "agent_kind": "REAL",
    })
    assert r.status_code == 200, r.text
    assert r.json()["signing_secret"]


# ---- 2) Config still exposes allowlist(6) + prohibited(9) ----
def test_a2_config_allowlist_and_prohibited(s):
    r = s.get(f"{PROD}/config")
    assert r.status_code == 200
    d = r.json()
    assert len(d["action_allowlist"]) == 6, d["action_allowlist"]
    assert len(d["prohibited_actions"]) == 9, d["prohibited_actions"]


# ---- 3) Mint enrollment token ----
@pytest.fixture(scope="module")
def minted_token(s):
    r = s.post(f"{PROD}/edge-v2/enrollment-tokens",
               json={"tenant_id": TENANT, "location_id": LOC})
    assert r.status_code == 200, r.text
    tok = r.json()["enrollment_token"]
    assert tok and tok.startswith("ENROLL-")
    return tok


def test_a3_mint_returns_enrollment_token(s, minted_token):
    assert minted_token


# ---- 4) After mint: register WITHOUT token -> 401 ----
def test_a4_register_without_token_after_mint_401(s, minted_token):
    aid = f"TEST-EDGE-NEEDS-TOKEN-{uuid.uuid4().hex[:6].upper()}"
    r = s.post(f"{PROD}/edge-v2/register", json={
        "agent_id": aid, "tenant_id": TENANT,
        "location_id": LOC, "agent_kind": "REAL",
    })
    assert r.status_code == 401, r.text


# ---- 5) Register WITH minted token -> 200; token becomes single-use ----
def test_a5_register_with_token_succeeds_single_use(s, minted_token):
    # Mint an extra token to keep enrollment gating ON after we consume `minted_token`
    extra = s.post(f"{PROD}/edge-v2/enrollment-tokens",
                   json={"tenant_id": TENANT, "location_id": LOC}).json()["enrollment_token"]
    aid = f"TEST-EDGE-USED-{uuid.uuid4().hex[:6].upper()}"
    r = s.post(f"{PROD}/edge-v2/register", json={
        "agent_id": aid, "tenant_id": TENANT, "location_id": LOC,
        "agent_kind": "REAL", "enrollment_token": minted_token,
    })
    assert r.status_code == 200, r.text
    # single-use: reusing the same (now-consumed) token while gating stays ON
    # (because `extra` is still unused) must fail with 401.
    aid2 = f"TEST-EDGE-REUSE-{uuid.uuid4().hex[:6].upper()}"
    r2 = s.post(f"{PROD}/edge-v2/register", json={
        "agent_id": aid2, "tenant_id": TENANT, "location_id": LOC,
        "agent_kind": "REAL", "enrollment_token": minted_token,
    })
    assert r2.status_code == 401, r2.text
    # cleanup: consume `extra` by registering a throwaway agent with it, so that
    # subsequent test runs (and downstream registers) aren't blocked.
    s.post(f"{PROD}/edge-v2/register", json={
        "agent_id": f"TEST-EDGE-CLEANUP-{uuid.uuid4().hex[:6].upper()}",
        "tenant_id": TENANT, "location_id": LOC,
        "agent_kind": "REAL", "enrollment_token": extra,
    })


# ---- 6) DISCOVERY end-to-end ----
@pytest.fixture(scope="module")
def real_agent(s):
    """Register a REAL agent (mint a fresh token first, since gating is active)."""
    mint = s.post(f"{PROD}/edge-v2/enrollment-tokens",
                  json={"tenant_id": TENANT, "location_id": LOC}).json()["enrollment_token"]
    aid = f"TEST-EDGE-DISC-{uuid.uuid4().hex[:6].upper()}"
    r = s.post(f"{PROD}/edge-v2/register", json={
        "agent_id": aid, "tenant_id": TENANT, "location_id": LOC,
        "agent_kind": "REAL", "enrollment_token": mint,
    })
    assert r.status_code == 200, r.text
    d = r.json()
    return {"agent_id": aid, "secret": d["signing_secret"]}


def _hb(agent):
    path = "/api/production/edge-v2/heartbeat"
    h = signed_headers(agent["agent_id"], agent["secret"], "POST", path, b"")
    r = requests.post(f"{BASE_URL}{path}", data=b"", headers=h)
    assert r.status_code == 200
    assert r.json()["real_online"] is True


def test_a6_discovery_end_to_end_redaction_and_report(s, real_agent):
    _hb(real_agent)

    # Enqueue DISCOVER_CAPABILITIES (operator-side, unsigned)
    r = s.post(f"{PROD}/edge-v2/agents/{real_agent['agent_id']}/enqueue",
               json={"action": "DISCOVER_CAPABILITIES", "idempotency_key": f"disc-{uuid.uuid4().hex[:6]}"})
    assert r.status_code == 200, r.text
    action_id = r.json()["action"]["id"]

    # Agent polls (signed GET) -> DISPATCHED
    path = "/api/production/edge-v2/actions"
    h = signed_headers(real_agent["agent_id"], real_agent["secret"], "GET", path, b"")
    r = requests.get(f"{BASE_URL}{path}", headers=h)
    assert r.status_code == 200
    assert any(a["id"] == action_id for a in r.json()["actions"])

    # Post signed result carrying the realistic report payload
    result_path = f"/api/production/edge-v2/actions/{action_id}/result"
    payload = {
        "ok": True,
        "result": {
            "report": {
                "px300": {"reachable": False, "host": "192.168.0.200"},
                "fiery_software": {
                    "command_workstation": {"detected": False},
                    "hot_folders": {"detected": False},
                    "jobflow": {"detected": False},
                },
                "london_bc": {"detected": "UNKNOWN", "type": "UNKNOWN",
                              "programmatically_applicable": "UNKNOWN"},
                "summary": {
                    "flags": {"REAL_FIERY_API_AVAILABLE": "UNKNOWN",
                              "JDF_JMF_AVAILABLE": "UNKNOWN"},
                    "gui_automation_required": "UNKNOWN",
                    "REAL_FIERY_BACKEND": "NOT_IMPLEMENTED",
                },
                "evidence": {
                    "capability_matrix": [{
                        "action": "CONNECT", "available": "UNKNOWN",
                        "mechanism": "x", "supported": "UNKNOWN",
                        "requires_configuration": "UNKNOWN",
                        "requires_license": "UNKNOWN",
                        "local_or_server": "SERVER",
                        "confidence": "LOW", "evidence": "probe",
                    }],
                },
            },
        },
        "evidence": {
            "capability_matrix": [{
                "action": "CONNECT", "available": "UNKNOWN",
                "mechanism": "x", "supported": "UNKNOWN",
                "requires_configuration": "UNKNOWN",
                "requires_license": "UNKNOWN",
                "local_or_server": "SERVER",
                "confidence": "LOW", "evidence": "probe",
            }],
        },
    }
    body = json.dumps(payload).encode()
    h = signed_headers(real_agent["agent_id"], real_agent["secret"], "POST", result_path, body)
    r = requests.post(f"{BASE_URL}{result_path}", data=body, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SUCCEEDED"

    # GET latest
    r = s.get(f"{PROD}/edge-v2/discovery/{real_agent['agent_id']}/latest")
    assert r.status_code == 200
    d = r.json()
    assert d["has_report"] is True
    fields = d["report"]["fields"]
    assert fields["REAL_FIERY_BACKEND"] == "NOT_IMPLEMENTED"
    assert fields["PX300_REACHABLE"] is False
    # Embedded IP must be REDACTED in stored data
    assert "192.168.0.200" not in json.dumps(d), d

    # GET markdown report
    r = s.get(f"{PROD}/edge-v2/discovery/{real_agent['agent_id']}/report")
    assert r.status_code == 200
    d = r.json()
    assert "P2G_LONDON_DISCOVERY_REPORT" in d["markdown"]
    assert "REAL_FIERY_BACKEND = NOT_IMPLEMENTED" in d["markdown"]
    assert d["json"]["fields"]["REAL_FIERY_BACKEND"] == "NOT_IMPLEMENTED"


# ---- 7) SAFETY: unsafe/prohibited/not-allowlisted are rejected & not queued ----
def _count_queued(s, agent_id, action):
    r = s.get(f"{PROD}/edge-v2/actions-all", params={"agent_id": agent_id}) if False else None
    # No admin listing endpoint — instead check that a signed poll doesn't include it.
    return None


def test_a7_safety_rejects(s, real_agent):
    aid = real_agent["agent_id"]
    # APPLY_TEMPLATE - not in the 6-item allowlist -> 400 NOT_ALLOWLISTED
    r = s.post(f"{PROD}/edge-v2/agents/{aid}/enqueue", json={"action": "APPLY_TEMPLATE"})
    assert r.status_code == 400, r.text
    # PRINT - prohibited -> 403
    r = s.post(f"{PROD}/edge-v2/agents/{aid}/enqueue", json={"action": "PRINT"})
    assert r.status_code == 403, r.text
    # CREATE_HOT_FOLDER - not in allowlist -> 400
    r = s.post(f"{PROD}/edge-v2/agents/{aid}/enqueue", json={"action": "CREATE_HOT_FOLDER"})
    assert r.status_code == 400, r.text

    # Confirm none of them queued: signed poll must not return any of these actions
    path = "/api/production/edge-v2/actions"
    h = signed_headers(aid, real_agent["secret"], "GET", path, b"")
    r = requests.get(f"{BASE_URL}{path}", headers=h)
    assert r.status_code == 200
    seen = {a["action"] for a in r.json()["actions"]}
    assert "APPLY_TEMPLATE" not in seen
    assert "PRINT" not in seen
    assert "CREATE_HOT_FOLDER" not in seen


# ---- 8) Idempotent enqueue stability: both HTTP 200, queued:true, same id ----
def test_a8_idempotent_enqueue_stability(s, real_agent):
    aid = real_agent["agent_id"]
    key = f"k-stable-{uuid.uuid4().hex[:6]}"
    r1 = s.post(f"{PROD}/edge-v2/agents/{aid}/enqueue",
                json={"action": "PING", "idempotency_key": key})
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["queued"] is True

    r2 = s.post(f"{PROD}/edge-v2/agents/{aid}/enqueue",
                json={"action": "PING", "idempotency_key": key})
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["queued"] is True
    assert d2.get("idempotent") is True
    assert d2["action"]["id"] == d1["action"]["id"]
