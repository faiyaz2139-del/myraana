# EDGE_AGENT_ARCHITECTURE.md
Print2Go Production OS — Windows Edge Agent Architecture (V0.3)

## Overview
```
SaaS (cloud)  <——TLS + HMAC——>  Real Windows Edge Agent (P2G-LONDON-EDGE-01)  ——LAN——>  PX300 (discovery only)
```
The Edge Agent is the only component that knows the machine host/IP and local
credentials. The cloud references devices by `device_role` (e.g. `FIERY_PRIMARY`);
the agent resolves the role to a local address that is never sent to the cloud/AI.

## Cloud vs Agent responsibilities
- **Cloud**: issues registration token + signing secret, validates every request
  signature, enforces tenant/location, enforces the action allowlist, stores an
  immutable hash-chained edge audit, distinguishes REAL vs MOCK agents, computes
  `REAL_ONLINE` strictly from authenticated heartbeats.
- **Agent**: stores secrets encrypted locally, signs every request, heartbeats,
  polls the action queue, executes only allowlisted read-only operations, returns
  structured results + evidence, dedupes by idempotency ledger, redacts host/IP.

## Security
- **Identity**: unique `agent_id`; registration issues a one-time `signing_secret`.
- **Auth**: HMAC-SHA256 over `METHOD\nPATH\nUNIX_TS\nSHA256(body)`; ±300s replay window.
- **Rotatable credentials**: re-registration rotates token + secret; 24h token expiry.
- **TLS**: `cloud_url` must be `https://`.
- **Local encrypted secret storage**: Fernet key (`agent.key`, chmod 600) encrypts
  `secrets.enc`. Secrets are never logged (redacting log filter) and never sent to AI.
- **Redaction**: `READ_CONFIGURATION` and reachability evidence redact the IP; the
  cloud also runs a server-side IP redaction safety net on stored results.
- **Tenant/location validation** on registration and on every signed call.
- **Idempotency**: per-action ledger on the agent; per-idempotency-key store in cloud.

## Cloud agent states
`OFFLINE → REGISTERING → ONLINE → BUSY → DEGRADED → ERROR`
Live state is derived: `REAL_ONLINE` (REAL kind + authenticated heartbeat in window),
`SIMULATED_ONLINE`, or `OFFLINE`. A simulated/mock heartbeat can never be `REAL_ONLINE`.

## Action lifecycle
`QUEUED → DISPATCHED → ACKNOWLEDGED → (EXECUTING) → SUCCEEDED | FAILED | EXPIRED`

## Action allowlist (V0.3 — read-only)
`PING, GET_AGENT_STATUS, DISCOVER_CAPABILITIES, CHECK_DEVICE_REACHABILITY,
GET_ADAPTER_STATUS, READ_CONFIGURATION`

Prohibited (rejected by **agent and cloud**, audited):
`PRINT, RELEASE, DELETE_JOB, CANCEL_JOB, CHANGE_QUANTITY, CHANGE_MEDIA,
CHANGE_COLOR_SETTINGS, EDIT_TEMPLATE, MODIFY_EXISTING_JOB`

## Resilience
Auto-reconnect with retry/backoff; survives cloud outages and process restarts
(reloads encrypted secrets and idempotency ledger); heartbeat + poll on separate
threads.

## Cloud endpoints (secure v2)
```
POST /api/production/edge-v2/register
POST /api/production/edge-v2/heartbeat            (signed)
GET  /api/production/edge-v2/actions              (signed, poll)
POST /api/production/edge-v2/actions/{id}/ack     (signed)
POST /api/production/edge-v2/actions/{id}/result  (signed)
POST /api/production/edge-v2/agents/{agent_id}/enqueue   (operator; allowlist enforced)
GET  /api/production/edge-v2/agents
GET  /api/production/edge-v2/audit/{agent_id}
```
