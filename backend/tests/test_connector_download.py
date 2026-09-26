"""Backend tests for Print2Go Connector download endpoint (503/302 behavior)."""
import os
import time
import subprocess
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-saas-40.preview.emergentagent.com").rstrip("/")
URL = f"{BASE_URL}/api/production/edge-v2/connector/download"
ENV_PATH = "/app/backend/.env"
TEST_EXE_URL = "https://github.com/octocat/Hello-World/releases/download/v1.0/hello.exe"

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def _read_env():
    with open(ENV_PATH, "r") as f:
        return f.read()


def _write_env(content):
    with open(ENV_PATH, "w") as f:
        f.write(content)


def _restart_backend():
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, capture_output=True)
    # Wait for service to come up
    for _ in range(30):
        time.sleep(1)
        try:
            r = requests.get(f"{BASE_URL}/api/", headers=UA, timeout=5)
            if r.status_code < 500:
                return
        except Exception:
            continue


class TestDownload503Default:
    """CONNECTOR_EXE_URL not set -> 503 with publish guidance (not zip)."""

    def test_returns_503_with_guidance(self):
        r = requests.get(URL, headers=UA, allow_redirects=False, timeout=15)
        assert r.status_code == 503, f"Expected 503, got {r.status_code}: {r.text[:400]}"

        # Should NOT be zip/octet-stream
        ct = r.headers.get("content-type", "").lower()
        assert "zip" not in ct, f"Should not be zip, got content-type={ct}"
        assert "octet-stream" not in ct, f"Should not be octet-stream, got content-type={ct}"

        text = r.text
        # Detail should have publish guidance mentioning the required steps
        for needle in ["Save to Github", "Build Connector", "CONNECTOR_EXE_URL", "Redeploy"]:
            assert needle in text, f"Missing '{needle}' in 503 body: {text[:600]}"


class TestDownload302WithEnv:
    """Setting CONNECTOR_EXE_URL -> 302 redirect to that URL."""

    @classmethod
    def setup_class(cls):
        cls.original_env = _read_env()
        new_env = cls.original_env.rstrip("\n") + f'\nCONNECTOR_EXE_URL="{TEST_EXE_URL}"\n'
        _write_env(new_env)
        _restart_backend()

    @classmethod
    def teardown_class(cls):
        _write_env(cls.original_env)
        _restart_backend()

    def test_returns_302_redirect(self):
        r = requests.get(URL, headers=UA, allow_redirects=False, timeout=15)
        assert r.status_code == 302, f"Expected 302, got {r.status_code}: {r.text[:400]}"
        loc = r.headers.get("Location") or r.headers.get("location")
        assert loc == TEST_EXE_URL, f"Wrong redirect URL: {loc}"


class TestDownload503AfterRevert:
    """Confirm env revert brings back 503 (runs after 302 class teardown)."""

    def test_returns_503_after_env_removed(self):
        r = requests.get(URL, headers=UA, allow_redirects=False, timeout=15)
        assert r.status_code == 503, f"Expected 503 after revert, got {r.status_code}"
