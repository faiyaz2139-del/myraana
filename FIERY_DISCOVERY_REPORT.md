# FIERY_DISCOVERY_REPORT.md
Print2Go Production OS — V0.3 Read-Only Fiery Discovery

## Scope & honesty statement
This report documents a **read-only** discovery attempt against the London Fiery
target (`device_role = FIERY_PRIMARY`, server `PX300`, host held locally by the Edge
Agent). **No PX300 device is present on the network of the current cloud/sandbox
environment.** Therefore every device-dependent result below is reported as
`UNKNOWN` — never as a fabricated `YES`/`NO` and never as a simulated `PASS`.
`REAL_FIERY_BACKEND` remains `NOT_IMPLEMENTED`.

## Method
The real Windows Edge Agent (`/app/edge_agent`) performed:
- `CHECK_DEVICE_REACHABILITY` — TCP connect probes to candidate Fiery ports.
- `DISCOVER_CAPABILITIES` — maps open ports to candidate integration mechanisms.
No configuration was read from or written to any device. No job was submitted.
The Fiery host/IP is never transmitted to the cloud/AI (redacted to `[REDACTED]`);
the cloud only references `device_role = FIERY_PRIMARY`.

## Result in this environment
- `device_reachable = false` (all probed ports closed/unreachable).
- All candidate mechanisms = `UNKNOWN` (absence cannot be proven remotely).

## Candidate mechanisms investigated (ports probed)
| Mechanism | Indicative ports | Result here |
|---|---|---|
| Fiery API / EFI IQ | 8443, 443 | UNKNOWN |
| Command WorkStation / JDF | 8010 | UNKNOWN |
| Hot Folders (SMB) | 445, 139 | UNKNOWN |
| Virtual Printer (IPP) | 631 | UNKNOWN |
| LPR | 515 | UNKNOWN |
| Raw PDL | 9100 | UNKNOWN |
| JMF/JDF over HTTP | 8080, 8010 | UNKNOWN |

## "London BC" classification
Cannot be determined without the reachable Fiery / a Command WorkStation session.
Candidate classifications remain open: `IMPOSE_TEMPLATE`, `JOB_PRESET`,
`SERVER_PRESET`, `HOT_FOLDER_CONFIGURATION`, `LOCAL_CWS_TEMPLATE`, `OTHER`.
- `LONDON_BC_DETECTED = UNKNOWN`
- `LONDON_BC_PROGRAMMATICALLY_APPLICABLE = UNKNOWN`

## What must happen next (on real shop hardware)
Run the Edge Agent on the London Windows PC that can reach `PX300`. It will then be
able to confirm open ports and, in a later approved milestone, query the Fiery API /
CWS to positively classify "London BC" and populate the capability matrix with real
evidence and CONFIDENCE.
