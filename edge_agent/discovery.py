"""Read-only on-prem discovery for the Print2Go Windows Edge Agent (V0.3A).
Detects Windows environment + Fiery software + PX300 reachability + attempts a
read-only 'London BC' classification. NEVER prints, imports, or modifies anything.
Honest UNKNOWN whenever a fact cannot be positively confirmed.
"""
import os
import sys
import platform
import socket
import subprocess

import capabilities

# Actions that discovery must NEVER perform (hard-blocked by construction).
BLOCKED_ACTIONS = [
    "PRINT", "RELEASE", "DELETE", "CANCEL", "IMPORT", "CHANGE_MEDIA", "CHANGE_QUANTITY",
    "CHANGE_COLOR", "APPLY_TEMPLATE", "MODIFY_JOB", "CREATE_HOT_FOLDER", "EDIT_PRESET",
]

FIERY_SOFTWARE_KEYS = {
    "command_workstation": ["Fiery Command WorkStation", "Command WorkStation"],
    "hot_folders": ["Fiery Hot Folders", "Hot Folders"],
    "jobflow": ["Fiery JobFlow", "JobFlow"],
    "fiery_util": ["Fiery"],
}


def _is_windows():
    return platform.system().lower().startswith("win")


def _network_interfaces():
    ifaces = []
    try:
        host = socket.gethostname()
        ifaces.append({"hostname": host})
        if _is_windows():
            out = subprocess.run(["ipconfig"], capture_output=True, text=True, timeout=8).stdout
            ifaces.append({"ipconfig_lines": len(out.splitlines())})
    except Exception as e:
        ifaces.append({"error": type(e).__name__})
    return ifaces


def _scan_windows_uninstall():
    """Read HKLM/HKCU uninstall registry (read-only) for installed program display names."""
    names = []
    if not _is_windows():
        return names
    try:
        import winreg
        roots = [(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
                 (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
                 (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")]
        for root, path in roots:
            try:
                key = winreg.OpenKey(root, path)
            except OSError:
                continue
            for i in range(winreg.QueryInfoKey(key)[0]):
                try:
                    sub = winreg.OpenKey(key, winreg.EnumKey(key, i))
                    dn, _ = winreg.QueryValueEx(sub, "DisplayName")
                    ver = ""
                    try:
                        ver, _ = winreg.QueryValueEx(sub, "DisplayVersion")
                    except OSError:
                        pass
                    names.append((dn, ver))
                except OSError:
                    continue
    except Exception:
        pass
    return names


def _detect_fiery_software():
    installed = _scan_windows_uninstall()
    result = {}
    for comp, needles in FIERY_SOFTWARE_KEYS.items():
        detected = False
        version = None
        for dn, ver in installed:
            if any(n.lower() in (dn or "").lower() for n in needles):
                detected = True
                version = ver or version
        if not _is_windows():
            # Cannot inspect Windows registry off-Windows — honest UNKNOWN
            result[comp] = {"detected": "UNKNOWN", "version": "UNKNOWN", "note": "not a Windows host"}
        else:
            result[comp] = {"detected": detected, "version": version or "UNKNOWN"}
    return result


def _windows_env():
    return {
        "is_windows": _is_windows(),
        "os": platform.system(),
        "version": platform.version(),
        "release": platform.release(),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "network_interfaces": _network_interfaces(),
    }


def _classify_london_bc(fiery_cfg, fiery_software, px300_reachable):
    """READ-ONLY attempt to classify 'London BC'. Without a reachable Fiery/CWS we
    cannot positively classify it -> UNKNOWN. Never applies the template."""
    template = fiery_cfg.get("imposition_template", "London BC")
    detected = "UNKNOWN"
    kind = "UNKNOWN"
    where = "UNKNOWN"
    applicable = "UNKNOWN"
    evidence = []
    # If a local Hot Folders install exists we *might* find a hot folder by that name,
    # but we do not enumerate customer folders here (privacy + read-only). Report UNKNOWN.
    if not px300_reachable:
        evidence.append("PX300 unreachable — server-side presets/templates cannot be queried")
    hf = fiery_software.get("hot_folders", {}).get("detected")
    cws = fiery_software.get("command_workstation", {}).get("detected")
    evidence.append(f"hot_folders_detected={hf}; command_workstation_detected={cws}")
    return {"template": template, "detected": detected, "type": kind, "location": where,
            "programmatically_applicable": applicable, "evidence": evidence}


def full_report(fiery_cfg):
    win = _windows_env()
    fsoft = _detect_fiery_software()
    reach = capabilities.check_reachability(fiery_cfg.get("host"), capabilities.FIERY_PROBE_PORTS)
    disc = capabilities.discover(fiery_cfg)
    london = _classify_london_bc(fiery_cfg, fsoft, reach["reachable"])
    # Recommendation is deferred until real on-prem evidence exists.
    rec = "UNKNOWN — run on the London PC that can reach PX300 to obtain evidence"
    return {
        "windows": win,
        "fiery_software": {
            "command_workstation": fsoft["command_workstation"],
            "hot_folders": fsoft["hot_folders"],
            "jobflow": fsoft["jobflow"],
            "fiery_api": {"detected": "UNKNOWN"},
        },
        "px300": {"reachable": reach["reachable"], "host": "[REDACTED]", "ports": reach["evidence_redacted"]["ports"]},
        "london_bc": london,
        "summary": disc["summary"],
        "capability_matrix": disc["matrix"],
        "gui_automation_required": "UNKNOWN",
        "recommended_v0_4_backend": rec,
        "read_only_enforced": True,
        "blocked_actions": BLOCKED_ACTIONS,
        "REAL_FIERY_BACKEND": "NOT_IMPLEMENTED",
    }
