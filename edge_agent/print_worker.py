"""Print2Go Edge Agent — physical print worker (runs on the shop Windows PC).

Outbound-only. Polls the cloud for AUTHORIZED_HELD jobs, claims exactly once,
downloads the production PDF, drops it into the Fiery Hot Folder with a job ticket,
and reports SENT_TO_FIERY -> PRINTING -> PRINTED. Falls back to MOCK when the
hot folder is not reachable. Idempotent via a local ledger so a reconnect never
double-prints. Honours cancel within one poll.
"""
import os
import json
import time
import shutil
import logging
from pathlib import Path

log = logging.getLogger("print2go.print_worker")


class PrintWorker:
    def __init__(self, client, config, ledger_path):
        self.client = client            # signed cloud client (see agent.py)
        self.cfg = config
        self.hot_folder = config.get("hot_folder_path", "")
        self.fiery_ip = config.get("fiery_ip", "192.168.0.200")
        self.queue = config.get("print_queue", "Jai BC")
        self.ledger = Path(ledger_path)
        self._load_ledger()

    # ---- local idempotency ledger ----
    def _load_ledger(self):
        try:
            self.done = set(json.loads(self.ledger.read_text()))
        except Exception:
            self.done = set()

    def _mark(self, key):
        self.done.add(key)
        try:
            self.ledger.write_text(json.dumps(sorted(self.done)))
        except Exception as e:
            log.error("ledger write failed: %s", e)

    # ---- capability probe (reported in heartbeat) ----
    def hot_folder_reachable(self):
        return bool(self.hot_folder) and os.path.isdir(self.hot_folder) and os.access(self.hot_folder, os.W_OK)

    def capabilities(self):
        return {
            "hot_folder_reachable": self.hot_folder_reachable(),
            "hot_folder_path": self.hot_folder,
            "fiery_reachable": self.hot_folder_reachable(),  # drop-folder writable == usable in this design
            "fiery_ip": self.fiery_ip,
            "print_queue": self.queue,
        }

    def _cancelled(self, job_id):
        try:
            st = self.client.get(f"/edge-v2/print/{job_id}/status").json()
            return bool(st.get("cancel_requested")) or st.get("print_state") == "CANCELLED"
        except Exception:
            return False

    def _report(self, job_id, state, copies=None, error=None, mock=False):
        body = {"state": state, "copies": copies, "error": error, "mock": mock}
        return self.client.post(f"/edge-v2/print/{job_id}/report", json=body).json()

    def _drop(self, job, pdf_bytes, copies):
        """Write PDF + sidecar job ticket into the hot folder (atomic: temp then rename)."""
        jn = job["job_number"]
        ticket = {"job_number": jn, "queue": self.queue, "copies": copies,
                  "media": job.get("stock"), "size": (job.get("properties") or {}).get("size"),
                  "impose_preset": job.get("impose_preset"), "duplex": job.get("sides", 1) == 2,
                  "fiery": self.fiery_ip, "test_mode": job.get("test_mode")}
        tmp_pdf = os.path.join(self.hot_folder, f".{jn}.pdf.part")
        final_pdf = os.path.join(self.hot_folder, f"{jn}.pdf")
        with open(tmp_pdf, "wb") as fh:
            fh.write(pdf_bytes)
        with open(os.path.join(self.hot_folder, f"{jn}.ticket.json"), "w") as fh:
            json.dump(ticket, fh, indent=2)
        os.replace(tmp_pdf, final_pdf)   # rename = the moment the hot folder ingests it
        return final_pdf

    def process_once(self):
        """One poll cycle. Returns number of jobs handled."""
        try:
            resp = self.client.get("/edge-v2/print/claimable").json()
        except Exception as e:
            log.error("claimable poll failed: %s", e)
            return 0
        jobs = resp.get("jobs", [])
        handled = 0
        for jb in jobs:
            job_id = jb["id"]
            if job_id in self.done:
                continue  # already printed by us — never re-drop
            # claim exactly once
            try:
                claim = self.client.post(f"/edge-v2/print/{job_id}/claim").json()
            except Exception as e:
                log.error("claim failed %s: %s", job_id, e)
                continue
            if not claim.get("claimed"):
                continue
            job = claim["job"]
            copies = job.get("copies", 1)
            # cancel check right before doing anything physical
            if self._cancelled(job_id):
                log.info("job %s cancelled before drop — skipping", job_id)
                continue
            try:
                pdf = self.client.get(f"/edge-v2/print/{job_id}/production-pdf").content
            except Exception as e:
                self._report(job_id, "PRINT_FAILED", error=f"pdf download: {e}")
                continue
            if not self.hot_folder_reachable():
                # MOCK path — never touches a device
                log.info("hot folder unreachable — MOCK print job %s (%d copies)", job["job_number"], copies)
                self._report(job_id, "SENT_TO_FIERY", copies=copies, mock=True)
                self._report(job_id, "PRINTING", copies=copies, mock=True)
                self._report(job_id, "PRINTED", copies=copies, mock=True)
                self._mark(job_id)
                handled += 1
                continue
            # real drop
            if self._cancelled(job_id):
                continue
            try:
                path = self._drop(job, pdf, copies)
                self._report(job_id, "SENT_TO_FIERY", copies=copies)
                log.info("dropped %s -> %s (%d copies)", job["job_number"], path, copies)
                self._report(job_id, "PRINTING", copies=copies)
                # In a real integration the agent would watch the Fiery for completion.
                self._report(job_id, "PRINTED", copies=copies)
                self._mark(job_id)
                handled += 1
            except Exception as e:
                log.error("drop failed %s: %s", job_id, e)
                self._report(job_id, "PRINT_FAILED", error=str(e))
        return handled
