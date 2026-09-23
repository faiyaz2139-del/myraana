"""
Print2Go Windows Edge Agent — V0.3
Real, runnable (cross-platform, Windows-targeted) on-prem agent.

Does: secure registration, HMAC-signed requests over TLS, heartbeat, capability
discovery, READ-ONLY Fiery discovery, structured results + evidence, idempotency,
retries, auto-reconnect, restart survival, local encrypted secret storage.

Does NOT: print, release, delete, cancel, or modify any Fiery job (allowlist-enforced).
Never logs or transmits secrets or machine host/IP to the cloud/AI.
"""
import os
import sys
import json
import time
import hmac
import base64
import socket
import hashlib
import logging
import platform
import threading
from pathlib import Path

import requests
from cryptography.fernet import Fernet

import capabilities
import discovery

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
KEY_PATH = BASE_DIR / "agent.key"
SECRETS_PATH = BASE_DIR / "secrets.enc"
IDEMPOTENCY_PATH = BASE_DIR / "executed_actions.json"

START_TS = time.time()

# ---- redacting logger (never emit secrets / IPs) ----
SECRET_TOKENS = set()


class RedactFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        for s in SECRET_TOKENS:
            if s:
                msg = msg.replace(s, "[REDACTED]")
        record.msg = msg
        record.args = ()
        return True


logging.basicConfig(level=logging.INFO, format="%(asctime)s [EDGE] %(levelname)s %(message)s")
log = logging.getLogger("edge")
log.addFilter(RedactFilter())


def first_run_setup():
    """Interactive first-run: ask ONLY for SaaS URL + registration token."""
    print("=== Print2Go Edge Agent — First-Run Setup ===")
    url = input("SaaS server URL (https://...): ").strip()
    token = input("Edge Agent registration token (blank if none): ").strip()
    cfg = {
        "agent_id": "P2G-LONDON-EDGE-01", "tenant_id": "TEN-PRINT2GO", "location_id": "LOC-LONDON",
        "version": "0.3.0", "cloud_url": url, "enrollment_token": token,
        "heartbeat_seconds": 10, "poll_seconds": 5,
        "fiery": {"server": "PX300", "host": "192.168.0.200", "imposition_template": "London BC"},
    }
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    print("Saved config.json. (Fiery host stays local and is never sent to the cloud.)")
    return cfg


def load_config():
    if not CONFIG_PATH.exists():
        return first_run_setup()
    cfg = json.loads(CONFIG_PATH.read_text())
    if not cfg.get("cloud_url") or "example.com" in cfg.get("cloud_url", ""):
        return first_run_setup()
    return cfg


def _fernet():
    if not KEY_PATH.exists():
        KEY_PATH.write_bytes(Fernet.generate_key())
        try:
            os.chmod(KEY_PATH, 0o600)
        except Exception:
            pass
    return Fernet(KEY_PATH.read_bytes())


def load_secrets():
    if not SECRETS_PATH.exists():
        return None
    try:
        return json.loads(_fernet().decrypt(SECRETS_PATH.read_bytes()).decode())
    except Exception:
        log.warning("Could not decrypt secrets — will re-register.")
        return None


def save_secrets(secrets):
    SECRETS_PATH.write_bytes(_fernet().encrypt(json.dumps(secrets).encode()))
    try:
        os.chmod(SECRETS_PATH, 0o600)
    except Exception:
        pass
    SECRET_TOKENS.add(secrets.get("signing_secret", ""))
    SECRET_TOKENS.add(secrets.get("token", ""))


def load_executed():
    if IDEMPOTENCY_PATH.exists():
        try:
            return set(json.loads(IDEMPOTENCY_PATH.read_text()))
        except Exception:
            return set()
    return set()


def save_executed(s):
    IDEMPOTENCY_PATH.write_text(json.dumps(sorted(s)))


class EdgeAgent:
    def __init__(self, config):
        self.cfg = config
        self.base = config["cloud_url"].rstrip("/")
        self.agent_id = config["agent_id"]
        self.tenant_id = config["tenant_id"]
        self.location_id = config["location_id"]
        self.secrets = load_secrets()
        self.executed = load_executed()
        self.results_cache = {}
        self._stop = threading.Event()

    # ---- signing ----
    def _sign(self, method, path, ts, body: bytes):
        secret = self.secrets["signing_secret"]
        body_hash = hashlib.sha256(body or b"").hexdigest()
        msg = f"{method}\n{path}\n{ts}\n{body_hash}".encode()
        return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()

    def _signed(self, method, path, payload=None):
        url = self.base + path
        body = json.dumps(payload).encode() if payload is not None else b""
        ts = str(int(time.time()))
        headers = {
            "X-P2G-Agent": self.agent_id,
            "X-P2G-Timestamp": ts,
            "X-P2G-Signature": self._sign(method, path, ts, body),
            "Content-Type": "application/json",
        }
        return requests.request(method, url, data=body, headers=headers, timeout=15)

    # ---- registration (survives restart via encrypted secrets) ----
    def ensure_registered(self):
        if self.secrets and self.secrets.get("signing_secret"):
            SECRET_TOKENS.update([self.secrets["signing_secret"], self.secrets.get("token", "")])
            log.info("Loaded existing registration for %s", self.agent_id)
            return
        log.info("Registering %s with cloud...", self.agent_id)
        r = requests.post(f"{self.base}/api/production/edge-v2/register", json={
            "agent_id": self.agent_id, "tenant_id": self.tenant_id, "location_id": self.location_id,
            "agent_kind": "REAL", "version": self.cfg.get("version", "0.3.0"),
            "enrollment_token": self.cfg.get("enrollment_token", ""),
            "capabilities": sorted(capabilities.ALLOWLISTED),
        }, timeout=15)
        r.raise_for_status()
        data = r.json()
        self.secrets = {"agent_id": self.agent_id, "token": data["token"], "signing_secret": data["signing_secret"]}
        save_secrets(self.secrets)
        log.info("Registered. Secret stored in encrypted local store (never logged).")
        print("\n=== EDGE AGENT REGISTERED ===")
        print(f"  Agent ID     : {self.agent_id}")
        print(f"  Tenant       : {self.tenant_id}")
        print(f"  Location     : {self.location_id}")
        print(f"  Connection   : {self.base}")
        print(f"  Capabilities : {', '.join(sorted(capabilities.ALLOWLISTED))}")
        print(f"  Agent version: {self.cfg.get('version')}")
        print("  Last heartbeat: (starting)\n")

    # ---- heartbeat ----
    def heartbeat_loop(self):
        while not self._stop.is_set():
            try:
                r = self._signed("POST", "/api/production/edge-v2/heartbeat", {"state": "ONLINE"})
                if r.status_code == 200:
                    log.info("Heartbeat ok (real_online=%s)", r.json().get("real_online"))
                elif r.status_code == 401:
                    log.warning("Heartbeat unauthorized — re-registering.")
                    self.secrets = None
                    self.ensure_registered()
                else:
                    log.warning("Heartbeat status %s", r.status_code)
            except requests.RequestException as e:
                log.warning("Heartbeat network error (will retry): %s", type(e).__name__)
            self._stop.wait(self.cfg.get("heartbeat_seconds", 10))

    # ---- action execution (READ-ONLY allowlist) ----
    def execute(self, action, params):
        act = (action or "").upper()
        if act in capabilities.PROHIBITED:
            return False, {"error": "PROHIBITED_ACTION", "action": act}, {}
        if act not in capabilities.ALLOWLISTED:
            return False, {"error": "NOT_ALLOWLISTED", "action": act}, {}
        fiery = self.cfg.get("fiery", {})
        if act == "PING":
            return True, {"pong": True, "ts": time.time()}, {}
        if act == "GET_AGENT_STATUS":
            return True, {"version": self.cfg.get("version"), "uptime_s": round(time.time() - START_TS, 1),
                          "os": platform.system(), "python": platform.python_version()}, {}
        if act == "READ_CONFIGURATION":
            # host/IP deliberately NOT returned to cloud
            return True, {"device_role": "FIERY_PRIMARY", "fiery_server": fiery.get("server"),
                          "imposition_template": fiery.get("imposition_template"), "host": "[REDACTED]"}, {}
        if act == "CHECK_DEVICE_REACHABILITY":
            res = capabilities.check_reachability(fiery.get("host"), capabilities.FIERY_PROBE_PORTS)
            return True, {"reachable": res["reachable"], "device_role": "FIERY_PRIMARY"}, res["evidence_redacted"]
        if act == "DISCOVER_CAPABILITIES":
            rep = discovery.full_report(fiery)
            return True, {"report": {k: rep[k] for k in ("windows", "fiery_software", "px300", "london_bc",
                                                          "summary", "gui_automation_required",
                                                          "recommended_v0_4_backend", "REAL_FIERY_BACKEND")}}, \
                   {"capability_matrix": rep["capability_matrix"]}
        if act == "GET_ADAPTER_STATUS":
            matrix = capabilities.discover(fiery)
            return True, {"REAL_FIERY_BACKEND": "NOT_IMPLEMENTED", "active_mode": "DISCOVERY_ONLY",
                          "mechanisms": matrix["summary"]}, {}
        return False, {"error": "UNHANDLED"}, {}

    def poll_loop(self):
        while not self._stop.is_set():
            try:
                r = self._signed("GET", "/api/production/edge-v2/actions")
                if r.status_code != 200:
                    self._stop.wait(self.cfg.get("poll_seconds", 5)); continue
                for act in r.json().get("actions", []):
                    self.handle_action(act)
            except requests.RequestException as e:
                log.warning("Poll network error (will retry): %s", type(e).__name__)
            self._stop.wait(self.cfg.get("poll_seconds", 5))

    def handle_action(self, act):
        aid = act["id"]
        self._signed("POST", f"/api/production/edge-v2/actions/{aid}/ack")
        if aid in self.executed:  # idempotency — never re-execute
            log.info("Action %s already executed; returning cached result.", aid)
            ok, result, evidence = self.results_cache.get(aid, (True, {"idempotent": True}, {}))
        else:
            log.info("Executing action %s: %s", aid, act["action"])
            ok, result, evidence = self.execute(act["action"], act.get("params", {}))
            self.executed.add(aid); save_executed(self.executed)
            self.results_cache[aid] = (ok, result, evidence)
        self._signed("POST", f"/api/production/edge-v2/actions/{aid}/result",
                     {"ok": ok, "result": result, "evidence": evidence})

    def run(self):
        while True:
            try:
                self.ensure_registered()
                break
            except requests.RequestException:
                log.warning("Cloud unavailable during registration — retrying in 5s.")
                time.sleep(5)
        hb = threading.Thread(target=self.heartbeat_loop, daemon=True)
        pl = threading.Thread(target=self.poll_loop, daemon=True)
        hb.start(); pl.start()
        log.info("Edge agent running. Ctrl+C to stop.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self._stop.set()
            log.info("Shutting down.")


if __name__ == "__main__":
    EdgeAgent(load_config()).run()
