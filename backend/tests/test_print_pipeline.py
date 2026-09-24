"""Print2Go physical print pipeline (edge-v2) tests — cloud side, simulated REAL agent."""
import hashlib
import hmac
import json
import os
import time
import sys

import pytest
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import production as P  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PROD = f"{API}/production"


def sign(secret, method, path, ts, body: bytes = b""):
    bh = hashlib.sha256(body or b"").hexdigest()
    msg = f"{method}\n{path}\n{ts}\n{bh}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def hdr(agent, method, path, body: bytes = b""):
    ts = str(int(time.time()))
    return {"X-P2G-Agent": agent["agent_id"], "X-P2G-Timestamp": ts,
            "X-P2G-Signature": sign(agent["secret"], method, path, ts, body),
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def agent():
    tok = requests.post(f"{PROD}/edge-v2/enrollment-tokens", json={}).json()["enrollment_token"]
    r = requests.post(f"{PROD}/edge-v2/register", json={
        "agent_id": "TEST-EDGE-PRINT", "tenant_id": "TEN-PRINT2GO",
        "location_id": "LOC-LONDON", "agent_kind": "REAL", "enrollment_token": tok})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"agent_id": d["agent_id"], "secret": d["signing_secret"]}


def heartbeat(agent, hot=True):
    path = "/api/production/edge-v2/heartbeat"
    body = json.dumps({"capabilities": {"hot_folder_reachable": hot, "fiery_reachable": hot,
                                        "hot_folder_path": "/tmp/hf", "fiery_ip": "192.168.0.200",
                                        "print_queue": "Jai BC"}}).encode()
    return requests.post(f"{BASE_URL}{path}", data=body, headers=hdr(agent, "POST", path, body))


def make_held_job(recipe="RECIPE-BC-LONDON-PILOT-V1"):
    pdf = P.make_pdf_bytes(3.75, 2.25, 1, True)
    r = requests.post(f"{PROD}/jobs/quickstart",
                      files={"file": ("card.pdf", pdf, "application/pdf")},
                      data={"size_option": "STD_3_5x2", "stock": "Matte", "recipe_id": recipe})
    assert r.status_code == 200, r.text
    job = r.json()["job"]
    assert job["state"] == "PRODUCTION_AUTHORIZATION_REQUIRED"
    # human authorize
    a = requests.post(f"{PROD}/jobs/{job['id']}/authorize", json={"actor": "tester", "use_mock_fiery": True})
    assert a.status_code == 200, a.text
    j = requests.get(f"{PROD}/jobs/{job['id']}").json()["job"]
    assert j["print_state"] == "AUTHORIZED_HELD"
    return j


def test_heartbeat_reports_real_print(agent):
    r = heartbeat(agent, hot=True)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["real_online"] is True
    assert d["real_print_enabled"] is True
    assert d["test_mode"] is True  # first physical run = 1-copy test mode


def test_claim_once_and_1copy(agent):
    heartbeat(agent, hot=True)
    job = make_held_job()
    jid = job["id"]
    # claimable lists it, copies forced to 1 (test mode)
    p = "/api/production/edge-v2/print/claimable"
    r = requests.get(f"{BASE_URL}{p}", headers=hdr(agent, "GET", p))
    assert r.status_code == 200
    match = [j for j in r.json()["jobs"] if j["id"] == jid]
    assert match and match[0]["copies"] == 1

    cp = f"/api/production/edge-v2/print/{jid}/claim"
    r1 = requests.post(f"{BASE_URL}{cp}", data=b"", headers=hdr(agent, "POST", cp))
    assert r1.status_code == 200 and r1.json()["claimed"] is True
    token = r1.json()["claim_token"]
    # idempotent re-claim by same agent -> same token, not reset
    r2 = requests.post(f"{BASE_URL}{cp}", data=b"", headers=hdr(agent, "POST", cp))
    assert r2.status_code == 200 and r2.json().get("idempotent") is True
    assert r2.json()["claim_token"] == token

    # download production pdf
    dp = f"/api/production/edge-v2/print/{jid}/production-pdf"
    rd = requests.get(f"{BASE_URL}{dp}", headers=hdr(agent, "GET", dp))
    assert rd.status_code == 200 and rd.headers["content-type"].startswith("application/pdf")

    # report progression
    for st in ("SENT_TO_FIERY", "PRINTING", "PRINTED"):
        rp = f"/api/production/edge-v2/print/{jid}/report"
        body = json.dumps({"state": st, "copies": 1}).encode()
        rr = requests.post(f"{BASE_URL}{rp}", data=body, headers=hdr(agent, "POST", rp, body))
        assert rr.status_code == 200, rr.text
    j = requests.get(f"{PROD}/jobs/{jid}").json()["job"]
    assert j["print_state"] == "PRINTED" and j["status"] == "COMPLETED"


def test_no_double_print_on_reconnect(agent):
    heartbeat(agent, hot=True)
    job = make_held_job()
    jid = job["id"]
    cp = f"/api/production/edge-v2/print/{jid}/claim"
    requests.post(f"{BASE_URL}{cp}", data=b"", headers=hdr(agent, "POST", cp))
    rp = f"/api/production/edge-v2/print/{jid}/report"
    for st in ("SENT_TO_FIERY", "PRINTING", "PRINTED"):
        body = json.dumps({"state": st}).encode()
        requests.post(f"{BASE_URL}{rp}", data=body, headers=hdr(agent, "POST", rp, body))
    # duplicate PRINTED and a regressing PRINTING must be idempotent (no double)
    for st in ("PRINTED", "PRINTING", "SENT_TO_FIERY"):
        body = json.dumps({"state": st}).encode()
        rr = requests.post(f"{BASE_URL}{rp}", data=body, headers=hdr(agent, "POST", rp, body))
        assert rr.status_code == 200 and rr.json().get("idempotent") is True
        assert rr.json()["print_state"] == "PRINTED"


def test_cancel_before_send(agent):
    heartbeat(agent, hot=True)
    job = make_held_job()
    jid = job["id"]
    c = requests.post(f"{PROD}/jobs/{jid}/cancel", json={"actor": "tester"})
    assert c.status_code == 200 and c.json()["print_state"] == "CANCELLED"
    # not claimable + claim rejected
    p = "/api/production/edge-v2/print/claimable"
    r = requests.get(f"{BASE_URL}{p}", headers=hdr(agent, "GET", p))
    assert jid not in [j["id"] for j in r.json()["jobs"]]
    cp = f"/api/production/edge-v2/print/{jid}/claim"
    rc = requests.post(f"{BASE_URL}{cp}", data=b"", headers=hdr(agent, "POST", cp))
    assert rc.status_code == 409


def test_offline_hotfolder_is_mock_only(agent):
    # agent reports hot folder NOT reachable -> MOCK only: nothing claimable, claim 403
    heartbeat(agent, hot=False)
    job = make_held_job()
    jid = job["id"]
    p = "/api/production/edge-v2/print/claimable"
    r = requests.get(f"{BASE_URL}{p}", headers=hdr(agent, "GET", p))
    assert r.json()["jobs"] == [] and "MOCK" in r.json()["reason"]
    cp = f"/api/production/edge-v2/print/{jid}/claim"
    rc = requests.post(f"{BASE_URL}{cp}", data=b"", headers=hdr(agent, "POST", cp))
    assert rc.status_code == 403
    # restore for other tests
    heartbeat(agent, hot=True)


def test_full_copies_after_test_mode_cleared(agent):
    heartbeat(agent, hot=True)
    # clear test mode -> future claims use real copies (default 1 here, but flag must flip)
    requests.post(f"{PROD}/edge-v2/agents/{agent['agent_id']}/test-mode", json={"test_mode": False})
    hb = heartbeat(agent, hot=True).json()
    assert hb["test_mode"] is False
    # reset to safe default
    requests.post(f"{PROD}/edge-v2/agents/{agent['agent_id']}/test-mode", json={"test_mode": True})
