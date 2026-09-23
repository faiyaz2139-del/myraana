"""Print2Go Edge Diagnostic — standalone READ-ONLY discovery tool (V0.3A).
Runs locally (no cloud needed), prints a status summary, and writes:
  logs/P2G_LONDON_DISCOVERY_REPORT.json
  logs/P2G_LONDON_DISCOVERY_REPORT.md
It performs NO destructive actions. Usage: python diagnose.py
"""
import json
import time
from pathlib import Path

import discovery

BASE = Path(__file__).parent
LOGS = BASE / "logs"
LOGS.mkdir(exist_ok=True)


def load_fiery_cfg():
    cfg_path = BASE / "config.json"
    if cfg_path.exists():
        try:
            return json.loads(cfg_path.read_text()).get("fiery", {})
        except Exception:
            pass
    return {"server": "PX300", "host": "192.168.0.200", "imposition_template": "London BC"}


def assemble_fields(rep, connected=False):
    return {
        "EDGE_AGENT_CONNECTED": connected,
        "PX300_REACHABLE": rep["px300"]["reachable"],
        "CWS_DETECTED": rep["fiery_software"]["command_workstation"]["detected"],
        "CWS_VERSION": rep["fiery_software"]["command_workstation"].get("version", "UNKNOWN"),
        "HOT_FOLDER_AVAILABLE": rep["fiery_software"]["hot_folders"]["detected"],
        "JOBFLOW_AVAILABLE": rep["fiery_software"]["jobflow"]["detected"],
        "FIERY_API_AVAILABLE": rep["summary"]["flags"].get("REAL_FIERY_API_AVAILABLE", "UNKNOWN"),
        "JDF_JMF_AVAILABLE": rep["summary"]["flags"].get("JDF_JMF_AVAILABLE", "UNKNOWN"),
        "LONDON_BC_DETECTED": rep["london_bc"]["detected"],
        "LONDON_BC_TYPE": rep["london_bc"]["type"],
        "LONDON_BC_PROGRAMMATICALLY_APPLICABLE": rep["london_bc"]["programmatically_applicable"],
        "GUI_AUTOMATION_REQUIRED": rep["gui_automation_required"],
        "REAL_FIERY_BACKEND": "NOT_IMPLEMENTED",
        "RECOMMENDED_V0_4_BACKEND": rep["recommended_v0_4_backend"],
    }


def render_md(fields, rep):
    lines = ["# P2G_LONDON_DISCOVERY_REPORT", "", f"_Generated (local diagnostic): {time.ctime()}_", "",
             "## Summary", "```"]
    for k, v in fields.items():
        lines.append(f"{k} = {v}")
    lines += ["```", "", "## Windows environment",
              f"- is_windows: {rep['windows']['is_windows']}",
              f"- os: {rep['windows']['os']} {rep['windows']['release']}",
              "", "## Capability Matrix", "",
              "| ACTION | AVAILABLE | MECHANISM | SUPPORTED | REQ_CONFIG | REQ_LICENSE | LOCAL/SERVER | CONFIDENCE |",
              "|---|---|---|---|---|---|---|---|"]
    for r in rep["capability_matrix"]:
        lines.append(f"| {r['action']} | {r['available']} | {r['mechanism']} | {r['supported']} | "
                     f"{r['requires_configuration']} | {r['requires_license']} | {r['local_or_server']} | {r['confidence']} |")
    lines += ["", "> READ-ONLY. REAL_FIERY_BACKEND = NOT_IMPLEMENTED. No job submitted; PX300 not modified."]
    return "\n".join(lines)


def main():
    print("Print2Go Edge Diagnostic — READ ONLY. No print/import/modify will occur.")
    fiery = load_fiery_cfg()
    rep = discovery.full_report(fiery)
    fields = assemble_fields(rep)
    (LOGS / "P2G_LONDON_DISCOVERY_REPORT.json").write_text(json.dumps({"fields": fields, "report": rep}, indent=2))
    (LOGS / "P2G_LONDON_DISCOVERY_REPORT.md").write_text(render_md(fields, rep))
    print("\n=== DISCOVERY SUMMARY ===")
    for k, v in fields.items():
        print(f"  {k:<38} = {v}")
    print(f"\nReports written to: {LOGS}")


if __name__ == "__main__":
    main()
