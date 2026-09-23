"""Read-only Fiery capability discovery. Performs TCP reachability probes only.
Never modifies device configuration, never submits jobs. Honest UNKNOWN when a
mechanism cannot be positively confirmed."""
import socket

ALLOWLISTED = {
    "PING", "GET_AGENT_STATUS", "DISCOVER_CAPABILITIES", "CHECK_DEVICE_REACHABILITY",
    "GET_ADAPTER_STATUS", "READ_CONFIGURATION",
}
PROHIBITED = {
    "PRINT", "RELEASE", "DELETE_JOB", "CANCEL_JOB", "CHANGE_QUANTITY", "CHANGE_MEDIA",
    "CHANGE_COLOR_SETTINGS", "EDIT_TEMPLATE", "MODIFY_EXISTING_JOB",
}

# Candidate Fiery integration mechanisms and the TCP ports that would indicate them.
MECHANISM_PORTS = {
    "FIERY_API": [8443, 443],       # EFI Fiery API / IQ
    "COMMAND_WORKSTATION_JDF": [8010],
    "HOT_FOLDERS_SMB": [445, 139],
    "VIRTUAL_PRINTER_IPP": [631],
    "LPR": [515],
    "RAW_PDL": [9100],
    "JMF_JDF_HTTP": [8080, 8010],
}
FIERY_PROBE_PORTS = sorted({p for ports in MECHANISM_PORTS.values() for p in ports})


def _tcp_open(host, port, timeout=1.0):
    if not host:
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def check_reachability(host, ports):
    probes = {}
    any_open = False
    for p in ports:
        ok = _tcp_open(host, p)
        probes[str(p)] = "open" if ok else "closed/unreachable"
        any_open = any_open or ok
    # host redacted — evidence returns ports only, never the IP
    return {"reachable": any_open, "evidence_redacted": {"ports": probes, "host": "[REDACTED]"}}


def discover(fiery_cfg):
    host = fiery_cfg.get("host")
    reach = check_reachability(host, FIERY_PROBE_PORTS)
    probes = reach["evidence_redacted"]["ports"]

    def mech_state(ports):
        opens = [str(p) for p in ports if probes.get(str(p)) == "open"]
        if opens:
            return "AVAILABLE", opens
        return "UNKNOWN", []  # cannot confirm absence remotely; never claim NO

    summary = {}
    for mech, ports in MECHANISM_PORTS.items():
        state, opens = mech_state(ports)
        summary[mech] = {"state": state, "ports_open": opens, "confidence": "LOW" if state == "UNKNOWN" else "MEDIUM"}

    # Capability matrix for the Fiery adapter operations — all UNKNOWN until device confirmed.
    ops = ["CONNECT", "IMPORT_TO_HELD", "FIND_JOB", "READ_JOB_STATE", "OPEN_IMPOSE",
           "APPLY_TEMPLATE", "SAVE_IMPOSED_JOB", "VERIFY_JOB_STATE"]
    matrix = []
    for op in ops:
        matrix.append({
            "action": op, "available": "UNKNOWN", "mechanism": "Fiery API / Hot Folder / CWS (TBD)",
            "supported": "UNKNOWN", "requires_configuration": "UNKNOWN", "requires_license": "UNKNOWN",
            "local_or_server": "SERVER", "evidence": "TCP probe only; device not reachable in this environment",
            "confidence": "LOW",
        })

    flags = {
        "REAL_FIERY_API_AVAILABLE": summary["FIERY_API"]["state"] if summary["FIERY_API"]["state"] == "AVAILABLE" else "UNKNOWN",
        "HOT_FOLDER_AVAILABLE": summary["HOT_FOLDERS_SMB"]["state"] if summary["HOT_FOLDERS_SMB"]["state"] == "AVAILABLE" else "UNKNOWN",
        "JDF_JMF_AVAILABLE": summary["JMF_JDF_HTTP"]["state"] if summary["JMF_JDF_HTTP"]["state"] == "AVAILABLE" else "UNKNOWN",
        "LONDON_BC_DETECTED": "UNKNOWN",
        "LONDON_BC_PROGRAMMATICALLY_APPLICABLE": "UNKNOWN",
        "GUI_AUTOMATION_REQUIRED": "UNKNOWN",
        "device_reachable": reach["reachable"],
    }
    return {"summary": {"mechanisms": summary, "flags": flags}, "matrix": matrix}
