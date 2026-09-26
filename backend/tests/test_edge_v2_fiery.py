"""Backend tests: agent heartbeat capabilities.fiery_reachable drives GET /agents fiery_reachable."""
import os, json, time, hmac, hashlib, requests, pytest

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://build-saas-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/production/edge-v2"

AGENT_ID = "P2G-LONDON-EDGE-01"
TENANT_ID = "TEN-PRINT2GO"
LOCATION_ID = "LOC-LONDON"
HB_PATH = "/api/production/edge-v2/heartbeat"


def _mint():
    r = requests.post(f"{API}/enrollment-tokens", json={}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["enrollment_token"]


def _register(tok):
    r = requests.post(f"{API}/register", json={
        "agent_id": AGENT_ID, "tenant_id": TENANT_ID, "location_id": LOCATION_ID,
        "agent_kind": "REAL", "version": "0.3.0", "enrollment_token": tok
    }, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d.get("signing_secret") or d.get("secret")


def _hb(secret, caps):
    body = json.dumps({"state": "ONLINE", **({"capabilities": caps} if caps is not None else {})}).encode()
    ts = str(int(time.time()))
    body_hash = hashlib.sha256(body).hexdigest()
    msg = f"POST\n{HB_PATH}\n{ts}\n{body_hash}"
    sig = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()
    r = requests.post(f"{BASE_URL}{HB_PATH}", data=body, headers={
        "X-P2G-Agent": AGENT_ID, "X-P2G-Timestamp": ts, "X-P2G-Signature": sig,
        "Content-Type": "application/json"
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _agents():
    r = requests.get(f"{API}/agents", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _find(agents_resp):
    items = agents_resp if isinstance(agents_resp, list) else agents_resp.get("agents") or agents_resp.get("items") or []
    for a in items:
        if a.get("agent_id") == AGENT_ID:
            return a
    return None


class TestFieryReachableTrue:
    def test_hb_with_fiery_true_makes_agent_fiery_reachable_and_real_online(self):
        tok = _mint()
        _, secret = _register(tok)
        hb = _hb(secret, {"fiery_reachable": True})
        assert hb.get("real_online") is True
        a = _find(_agents())
        assert a, "agent not present in /agents"
        assert a.get("fiery_reachable") is True, a
        assert a.get("live_state") == "REAL_ONLINE" or a.get("real_online") is True, a


class TestFieryReachableUnknownOrFalse:
    def test_hb_without_capabilities_leaves_fiery_not_true(self):
        tok = _mint()
        _, secret = _register(tok)
        _hb(secret, None)  # no capabilities key
        a = _find(_agents())
        assert a
        assert a.get("fiery_reachable") is not True, f"fiery_reachable should be false/unknown: {a}"

    def test_hb_with_fiery_false_reports_false(self):
        tok = _mint()
        _, secret = _register(tok)
        _hb(secret, {"fiery_reachable": False})
        a = _find(_agents())
        assert a
        assert a.get("fiery_reachable") is not True, a


class TestDownload503:
    def test_connector_download_503(self):
        r = requests.get(f"{API}/connector/download", allow_redirects=False, timeout=15)
        assert r.status_code in (503, 302), r.text
