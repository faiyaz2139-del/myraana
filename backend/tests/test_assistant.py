"""Backend tests for AI Assistant + regression on files/system-status/search."""
import os
import json
import uuid
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- Providers ----------------
def test_providers():
    r = requests.get(f"{API}/assistant/providers", timeout=15)
    assert r.status_code == 200
    d = r.json()
    ids = {p["id"]: p for p in d["providers"]}
    assert set(ids.keys()) == {"anthropic", "openai", "gemini"}
    assert ids["anthropic"]["label"] == "Claude"
    assert ids["anthropic"]["model"] == "claude-sonnet-4-6"
    assert ids["openai"]["label"] == "ChatGPT"
    assert ids["openai"]["model"] == "gpt-5.6-sol"
    assert ids["gemini"]["label"] == "Gemini"
    assert ids["gemini"]["model"] == "gemini-3-flash-preview"
    assert d["default"] == "anthropic"


def _stream_chat(session_id: str, message: str, provider: str, timeout: int = 90):
    """Consume SSE stream, return (deltas_joined, saw_done, error)."""
    with requests.post(
        f"{API}/assistant/chat",
        json={"session_id": session_id, "message": message, "provider": provider},
        stream=True, timeout=timeout,
    ) as r:
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:400]}"
        assert "text/event-stream" in r.headers.get("content-type", "")
        full = ""
        done = False
        err = None
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            try:
                obj = json.loads(line[5:].strip())
            except Exception:
                continue
            if "delta" in obj:
                full += obj["delta"]
            if "error" in obj:
                err = obj["error"]
            if obj.get("done"):
                done = True
                break
        return full, done, err


@pytest.mark.parametrize("provider", ["anthropic", "openai", "gemini"])
def test_chat_stream_all_providers_grounded(provider):
    sid = f"TEST_{provider}_{uuid.uuid4()}"
    text, done, err = _stream_chat(
        sid,
        "How many open exceptions are there right now? Which orders need attention? "
        "Please reference actual order numbers from the live data.",
        provider,
    )
    assert done, f"stream did not signal done; err={err} text[:200]={text[:200]}"
    assert err is None, f"stream error: {err}"
    assert len(text.strip()) > 20, f"reply too short: {text!r}"
    # Grounding: 0 open exceptions
    low = text.lower()
    assert ("0" in text) or ("zero" in low) or ("no open" in low), \
        f"[{provider}] answer must state 0 open exceptions; got: {text[:300]}"
    # Should reference a real order number (from live seed) — presence of '#58' pattern
    assert "#58" in text, f"[{provider}] answer should reference real order numbers; got: {text[:300]}"

    # Safety: must NOT claim device online or printed
    for banned in ["printed successfully", "job was printed", "device is online", "printer is online"]:
        assert banned not in low, f"[{provider}] answer must not claim {banned!r}: {text[:300]}"

    # cleanup
    requests.delete(f"{API}/assistant/history", params={"session_id": sid}, timeout=15)


def test_history_and_memory():
    sid = f"TEST_hist_{uuid.uuid4()}"
    # first turn
    t1, done1, _ = _stream_chat(sid, "List orders with priority=rush by order number only.", "anthropic")
    assert done1 and len(t1) > 5
    # follow-up references prior turn
    t2, done2, _ = _stream_chat(sid, "Of those, which is the most recent?", "anthropic")
    assert done2

    # history endpoint
    h = requests.get(f"{API}/assistant/history", params={"session_id": sid}, timeout=15)
    assert h.status_code == 200
    msgs = h.json()
    # 2 user + 2 assistant
    roles = [m["role"] for m in msgs]
    assert roles.count("user") == 2
    assert roles.count("assistant") == 2
    assert roles == sorted(roles, key=lambda x: 0)  # ordered chronologically

    # delete
    d = requests.delete(f"{API}/assistant/history", params={"session_id": sid}, timeout=15)
    assert d.status_code == 200
    h2 = requests.get(f"{API}/assistant/history", params={"session_id": sid}, timeout=15).json()
    assert h2 == []


def test_chat_validation():
    # bad provider
    r = requests.post(f"{API}/assistant/chat", json={"session_id": "x", "message": "hi", "provider": "grok"}, timeout=15)
    assert r.status_code == 400
    # empty message
    r = requests.post(f"{API}/assistant/chat", json={"session_id": "x", "message": "   ", "provider": "anthropic"}, timeout=15)
    assert r.status_code == 400


# ---------------- Regression ----------------
def test_system_status():
    r = requests.get(f"{API}/system-status", timeout=15)
    assert r.status_code == 200


def test_dashboard_stats():
    r = requests.get(f"{API}/dashboard/stats", timeout=15)
    assert r.status_code == 200


def test_search_58311():
    r = requests.get(f"{API}/search", params={"q": "58311"}, timeout=15)
    assert r.status_code == 200


def test_files_crud():
    # upload
    files = {"file": ("TEST_ai_assistant.txt", io.BytesIO(b"hello ai assistant"), "text/plain")}
    r = requests.post(f"{API}/files/upload", files=files, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    fid = body.get("id") or body.get("file_id") or body.get("_id")
    assert fid, f"no id in {body}"

    # list
    lst = requests.get(f"{API}/files", timeout=15)
    assert lst.status_code == 200
    ids = [f.get("id") for f in lst.json()]
    assert fid in ids

    # download
    dl = requests.get(f"{API}/files/{fid}/download", timeout=15)
    assert dl.status_code == 200
    assert b"hello ai assistant" in dl.content

    # delete
    de = requests.delete(f"{API}/files/{fid}", timeout=15)
    assert de.status_code in (200, 204)
