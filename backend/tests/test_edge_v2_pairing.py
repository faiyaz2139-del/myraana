"""Backend tests for Edge Agent V2 pairing loop (Print2Go)."""
import os
import json
import time
import hmac
import hashlib
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/production/edge-v2"

AGENT_ID = "P2G-LONDON-EDGE-01"
TENANT_ID = "TEN-PRINT2GO"
LOCATION_ID = "LOC-LONDON"


def _sign(signing_secret: str, method: str, path: str, body: bytes):
    ts = str(int(time.time()))
    body_hash = hashlib.sha256(body).hexdigest()
    msg = f"{method}\n{path}\n{ts}\n{body_hash}"
    sig = hmac.new(signing_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return ts, sig


def mint_token():
    r = requests.post(f"{API}/enrollment-tokens", json={}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("enrollment_token") or data.get("token") or data.get("code")
    assert tok, f"No enrollment_token in response: {data}"
    return tok


def register(enrollment_token=None):
    body = {
        "agent_id": AGENT_ID,
        "tenant_id": TENANT_ID,
        "location_id": LOCATION_ID,
        "agent_kind": "REAL",
        "version": "0.3.0",
    }
    if enrollment_token is not None:
        body["enrollment_token"] = enrollment_token
    return requests.post(f"{API}/register", json=body, timeout=15)


class TestPairingHappyPath:
    def test_full_pairing_and_heartbeat(self):
        # 1. Mint token
        token = mint_token()
        assert isinstance(token, str) and len(token) > 0

        # 2. Register with token
        r = register(token)
        assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
        data = r.json()
        assert "token" in data or "signing_secret" in data, data
        signing_secret = data.get("signing_secret") or data.get("secret")
        agent_token = data.get("token")
        assert signing_secret, f"No signing_secret: {data}"
        assert agent_token, f"No token: {data}"

        # 3. HMAC heartbeat
        path = "/api/production/edge-v2/heartbeat"
        body = json.dumps({"state": "ONLINE"}).encode()
        ts, sig = _sign(signing_secret, "POST", path, body)
        headers = {
            "X-P2G-Agent": AGENT_ID,
            "X-P2G-Timestamp": ts,
            "X-P2G-Signature": sig,
            "Content-Type": "application/json",
        }
        r = requests.post(f"{BASE_URL}{path}", data=body, headers=headers, timeout=15)
        assert r.status_code == 200, f"Heartbeat failed: {r.status_code} {r.text}"
        hb = r.json()
        assert hb.get("real_online") is True, f"real_online not true: {hb}"

        # Persist secret for later tests
        pytest.signing_secret = signing_secret


class TestPairingNegative:
    def test_register_without_token_when_active_exists(self):
        # Ensure there's an active unused token in system
        mint_token()
        r = register(enrollment_token=None)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        msg = r.text.lower()
        assert "enrollment" in msg or "token" in msg, r.text

    def test_register_with_wrong_token(self):
        mint_token()
        r = register(enrollment_token="INVALID-CODE-XYZ-00000")
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"


class TestSingleUse:
    def test_token_cannot_be_reused(self):
        token = mint_token()
        r1 = register(token)
        assert r1.status_code == 200, r1.text
        # reuse
        r2 = register(token)
        assert r2.status_code == 401, f"Expected 401 on reuse, got {r2.status_code}: {r2.text}"


class TestDownloadEndpoint:
    def test_download_returns_503_in_preview(self):
        r = requests.get(f"{API}/connector/download", allow_redirects=False, timeout=15)
        # Expected 503 in preview (no CONNECTOR_EXE_URL)
        assert r.status_code in (503, 302), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code == 503:
            assert "connector" in r.text.lower() or "not" in r.text.lower()
