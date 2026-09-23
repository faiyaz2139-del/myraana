# Print2Go Edge Agent — Windows Deployment Package (V0.3A)

Read-only discovery package for the **Print2Go London** production PC.
It connects to the SaaS, reports status, and runs **read-only** discovery of the
local Windows/Fiery environment and PX300. It does **not** print, import, release,
delete, cancel, or modify any job/preset/template/hot folder.

## Contents
- `Print2GoEdgeAgent.exe` — the agent (built via `build_windows_exe.bat`).
- `Print2GoEdgeDiagnostic.exe` — standalone read-only discovery tool.
- `config.template.json` — copied to `config.json` on first install.
- `install.bat` / `start.bat` / `uninstall.bat` — lifecycle scripts.
- `run_discovery.bat` — run the read-only diagnostic and export the report.
- `build_windows_exe.bat` — build the two `.exe` files (run on Windows once).
- `logs\` — reports + logs are written here.
- `README.md` — this file.

> **Note on the executables:** PyInstaller cannot cross-compile a Windows `.exe`
> from Linux/macOS. Run `build_windows_exe.bat` **on a Windows machine** once to
> produce `Print2GoEdgeAgent.exe` and `Print2GoEdgeDiagnostic.exe`, then copy them
> into this folder. The operator PC then needs **no Python**.

## Install (operator, ~1 minute)
1. Unzip the package anywhere (e.g. `C:\Print2GoEdge`).
2. Double-click `install.bat`.
3. First-run setup asks only for:
   - **SaaS server URL** (e.g. `https://cloud.print2go...`)
   - **Edge Agent registration token** (from your Print2Go admin; blank if none)
4. After registration the agent prints: Agent ID, Tenant, Location, Connection,
   Capabilities, Agent version, and begins heartbeating.

The Fiery host/IP stays in local `config.json` and is **never** sent to the cloud —
the cloud references `device_role = FIERY_PRIMARY` only.

## Run read-only discovery
- From the SaaS **Diagnostics** screen: click **RUN READ-ONLY DISCOVERY**, then
  **EXPORT DISCOVERY REPORT**; or
- On the PC: double-click `run_discovery.bat`. Reports are written to
  `logs\P2G_LONDON_DISCOVERY_REPORT.json` and `...md`.

## What discovery detects (read-only)
Windows version + network interfaces; installed Fiery software (Command WorkStation,
Hot Folders, JobFlow, Fiery utilities) via the Windows uninstall registry; PX300
reachability via TCP probes; and a best-effort **classification attempt** for
"London BC" (never applied). Anything that cannot be positively confirmed is
reported `UNKNOWN` — never a fabricated YES/NO.

## Safety (hard-blocked during discovery)
PRINT, RELEASE, DELETE, CANCEL, IMPORT, CHANGE MEDIA, CHANGE QUANTITY, CHANGE COLOR,
APPLY TEMPLATE, MODIFY JOB, CREATE HOT FOLDER, EDIT PRESET.

`REAL_FIERY_BACKEND = NOT_IMPLEMENTED`. The real discovery report from the London PC
will determine the V0.4 architecture (pending explicit approval).

## Run as a Windows service (optional)
```
nssm install P2GEdgeAgent "C:\Print2GoEdge\Print2GoEdgeAgent.exe"
nssm start P2GEdgeAgent
```
