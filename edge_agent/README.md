# Print2Go Windows Edge Agent (V0.3)

Real on-prem agent that connects a Print2Go location to the SaaS. It is **read-only**
in V0.3: it discovers capabilities and checks device reachability. It never prints,
releases, deletes, cancels, or modifies any Fiery job.

## Identity
`P2G-LONDON-EDGE-01` — tenant `TEN-PRINT2GO`, location `LOC-LONDON`.

## What it does
- Secure registration → receives a one-time `signing_secret` (stored **encrypted** locally).
- Signs **every** request with HMAC-SHA256 over `METHOD\nPATH\nTIMESTAMP\nSHA256(body)`.
- Communicates over **TLS** (use an `https://` `cloud_url`).
- Sends authenticated heartbeats → cloud marks the agent `REAL_ONLINE`.
- Polls an action queue, acknowledges, executes **allowlisted read-only** actions, returns structured results + evidence.
- Idempotent (never re-executes an action id), retries, auto-reconnects, survives restart.
- **Never** logs or transmits secrets or the machine host/IP. `READ_CONFIGURATION` redacts the IP; cloud references `device_role = FIERY_PRIMARY` only.

## Allowed actions (V0.3)
`PING`, `GET_AGENT_STATUS`, `DISCOVER_CAPABILITIES`, `CHECK_DEVICE_REACHABILITY`,
`GET_ADAPTER_STATUS`, `READ_CONFIGURATION`.

Prohibited (rejected by agent **and** cloud): `PRINT`, `RELEASE`, `DELETE_JOB`,
`CANCEL_JOB`, `CHANGE_QUANTITY`, `CHANGE_MEDIA`, `CHANGE_COLOR_SETTINGS`,
`EDIT_TEMPLATE`, `MODIFY_EXISTING_JOB`.

## Run on Windows
```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy config.example.json config.json   # then edit cloud_url + fiery host
python agent.py
```

## Build a single Windows executable
```powershell
pip install pyinstaller
pyinstaller --onefile --name P2G-LONDON-EDGE-01 agent.py
# dist\P2G-LONDON-EDGE-01.exe
```
Install as a Windows Service with NSSM if you want it to auto-start:
```powershell
nssm install P2GEdgeAgent "C:\path\dist\P2G-LONDON-EDGE-01.exe"
```

## Local files (never committed)
- `agent.key` — Fernet key for the local encrypted secret store.
- `secrets.enc` — encrypted `{token, signing_secret}`.
- `executed_actions.json` — idempotency ledger.
- `config.json` — your local config (contains the Fiery host/IP, stays on-prem).

## Fiery discovery
Discovery is **TCP reachability probing only** (ports for Fiery API, Hot Folders,
CWS/JDF, IPP, LPR, raw PDL). It never modifies PX300 and never submits a job.
When a mechanism cannot be positively confirmed it is reported `UNKNOWN` (never a
fabricated `NO`/`YES`). See `../FIERY_DISCOVERY_REPORT.md`.
