# Print2Go Production OS — PRD

## Original Problem Statement
"Build a SaaS app as shown in UI." Provided screenshot: **Print2Go Production OS**, a print production management dashboard for a commercial printing company.

## User Choices
- Full build across all sidebar sections
- No authentication (app opens directly to dashboard)
- AI recipe import feature
- Fully functional with MongoDB persistence
- Design close to the screenshot (blue accent, light theme) + dark mode

## Architecture
- **Frontend**: React 19, react-router v7, TanStack Query, Tailwind, shadcn/ui, lucide-react, recharts, sonner. Fixed slate sidebar + sticky topbar layout, light/dark theme toggle.
- **Backend**: FastAPI + Motor (MongoDB). All routes under `/api`. Auto-seeds demo data on startup.
- **AI**: `/api/recipes/import` uses emergentintegrations `LlmChat` (OpenAI gpt-5.4) via EMERGENT_LLM_KEY to structure SOP/PDF/chat text into a recipe.

## User Personas
- Production Manager: monitors floor, manages orders/exceptions, reviews reports.
- Prepress/Press/Finishing operators: track jobs through the production queue.
- Admin: manages locations, users, tenants, machines.

## Core Requirements (static)
- Dashboard KPIs, production queue, system status, recent exceptions, quick actions.
- Orders CRUD + status workflow (waiting → ready → running → completed / exception).
- Products catalog, Recipes (+AI import), Processes, Machines, Edge Agents.
- Files, SOP Library, Audit Log, Reports.
- Admin: Settings, Locations, Users, Tenants.

## Implemented (2026-06 — first build)
- All 17 sections built and wired to backend with seeded data.
- Orders: create/edit/delete, advance stage, mark complete; dashboard + kanban + table views.
- Products & Machines: create + delete/toggle. Exceptions: resolve with live sidebar badge.
- AI recipe import working (real LLM). Reports with recharts. Dark mode toggle.
- Tested: backend 24/24 pass, all frontend flows pass, data persists.

## Backlog (P1/P2)
- P1: Order detail page with production timeline; file upload (object storage) for artwork.
- P1: Recipe → apply to order (auto-populate steps/machines).
- P2: Auth + role-based access; multi-tenant switching; real edge-agent telemetry; export reports (CSV/PDF).

## Next Tasks
- Gather feedback on first build; prioritize order detail view or artwork uploads next.

## V0.2 — Real Production Engine (2026-06)
Added a real production orchestration engine (`/app/backend/production.py`) alongside the preserved V0.1 MVP.
- Business Card (PROD-BC-001) is the only ACTIVE production product; recipe RECIPE-BC-LONDON-V1 ACTIVE, all others DRAFT.
- Immutable 12-state workflow (ORDER_RECEIVED → … → PRODUCTION_AUTHORIZED) with recipe-version pinning (snapshot at job creation).
- Policy engine (ALLOW / DENY / HUMAN_APPROVAL_REQUIRED / CONFIGURATION_REQUIRED) gates every transition; tenant/location isolation enforced.
- Backend-enforced executable STOP rules (WRONG_DIMENSIONS, WRONG_ASPECT_RATIO, MISSING_BACK, UNSAFE_SAFE_AREA, BLEED_UNVERIFIED, PROTECTED_CONTENT_REVIEW, PDF_EXPORT_FAILED, PRINT_READY_VERIFICATION_FAILED, DEVICE_OFFLINE, FIERY_UNAVAILABLE, TEMPLATE_NOT_FOUND, JOB_AMBIGUOUS, CONFIGURATION_REQUIRED). AI cannot override a STOP.
- File lineage ORIGINAL → WORKING_COPY → PRINT_READY → PRODUCTION_OUTPUT with SHA-256; ORIGINAL never overwritten; bytes stored in Mongo (no pod-local files).
- Deterministic PRINT_READY verification via pypdf (page count, MediaBox/TrimBox/BleedBox, orientation, expected bleed dims). Trim-only artwork gets canvas expanded to bleed without distortion.
- Idempotency key = sha256(tenant|order|printready_hash|process|version) prevents duplicate Fiery submissions.
- Immutable hash-chained audit per job (prev_hash → entry_hash), chain validation endpoint.
- Edge Agent cloud protocol: register/heartbeat/capabilities/action-queue/ack/result; live_state computed from real heartbeats (no fake ONLINE). Action states QUEUED→DISPATCHED→ACKNOWLEDGED→SUCCEEDED/FAILED.
- FieryAdapter boundary: MockFieryAdapter only, clearly labelled MOCK; REAL_FIERY_BACKEND=NOT_IMPLEMENTED; mock refused when DEPLOY_ENV=production. London Fiery config (PX300 / 192.168.0.200 / "London BC") is location-scoped, not global.
- Human PRINT gate: PRODUCTION_AUTHORIZATION_REQUIRED needs human authorize; PRINT is not implemented/locked. AI authorize attempts are 403.
- AI Recipe Import now only ever creates DRAFT recipes with provenance + extraction_model; incomplete → CONFIGURATION_REQUIRED, conflicting → REVIEW_REQUIRED.
- UI: new Production Engine page (workflow stepper, controls, STOP banner, lineage, audit chain, honesty banners); Recipes ACTIVE/DRAFT badges; Edge Agents honesty banner + live OFFLINE state. No redesign of V0.1.
- Tests: 48 backend tests (24 V0.1 preserved + 24 V0.2) — 47 passed, 1 skipped (test isolation). Frontend E2E verified.
- Deliberately NOT built: physical printing, job release/delete, real Fiery control, unrestricted AI desktop control. Awaiting approval for V0.3.

## V0.3 — Real Windows Edge Agent + Fiery Discovery (2026-06)
- Real runnable Edge Agent at `/app/edge_agent/` (agent.py, capabilities.py, config.example.json, README, requirements). Windows-targeted, cross-platform Python; packageable to .exe via PyInstaller.
- Secure cloud edge protocol `/api/production/edge-v2/*`: registration (one-time signing_secret, 24h token), HMAC-SHA256 signed requests (METHOD\nPATH\nTS\nsha256(body)) with ±300s replay window, TLS, tenant/location validation, token-expiry checks.
- REAL vs MOCK agent kinds; `REAL_ONLINE` only from an authenticated heartbeat — a simulated heartbeat can never be REAL_ONLINE.
- Read-only action allowlist (PING, GET_AGENT_STATUS, DISCOVER_CAPABILITIES, CHECK_DEVICE_REACHABILITY, GET_ADAPTER_STATUS, READ_CONFIGURATION). Prohibited actions (PRINT/RELEASE/DELETE_JOB/CANCEL_JOB/CHANGE_*/EDIT_TEMPLATE/MODIFY_EXISTING_JOB) rejected by cloud (403) and agent, and audited.
- Action lifecycle QUEUED→DISPATCHED→ACKNOWLEDGED→SUCCEEDED/FAILED; idempotency by key; immutable hash-chained edge audit per agent.
- Security: local encrypted secret store (Fernet), redacting logger, host/IP redaction (key-based + regex substring) so machine addresses/secrets never reach cloud/AI; cloud references device_role=FIERY_PRIMARY (host resolved locally by agent).
- Read-only Fiery discovery via TCP port probing → capability matrix; PX300 not present in sandbox so results honestly UNKNOWN/UNREACHABLE. REAL_FIERY_BACKEND remains NOT_IMPLEMENTED.
- Deterministic safe-area detection (pypdf content-stream analysis): PASS / UNSAFE_SAFE_AREA / SAFE_AREA_REVIEW_REQUIRED; full-bleed backgrounds ignored; margin from approved recipe; AI cannot invent a PASS.
- Docs: FIERY_DISCOVERY_REPORT.md, EDGE_AGENT_ARCHITECTURE.md, FIERY_CAPABILITY_MATRIX.md, V0.4_RECOMMENDATION.md.
- Tests: 66 passed + 1 skipped, 0 failed (V0.1 24 + V0.2 24 + V0.3 edge-v2 19; new file test_edge_v2.py). Real agent demonstrated E2E (REAL_ONLINE, PRINT 403, redaction, UNKNOWN discovery, valid audit chain).
- Awaiting explicit approval for V0.4 real Fiery write backend (HELD-only, no printing).

## V0.3A — On-Prem Windows Discovery Package (2026-06)
- Windows deployment package `/app/edge_agent/windows_package/` (install/start/uninstall/run_discovery .bat, config.template.json, build_windows_exe.bat + README). Self-contained `.exe` built on Windows via PyInstaller (no Python needed on the shop PC; cross-compile not possible from Linux — build script provided).
- First-run setup in agent.py: prompts only for SaaS URL + registration (enrollment) token, then prints Agent ID/Tenant/Location/Connection/Capabilities/Version.
- Optional enrollment tokens: cloud `POST /edge-v2/enrollment-tokens` mints single-use tokens; register enforces them only if any are minted (backward compatible).
- Read-only discovery module `discovery.py`: Windows env + network, installed Fiery software (Command WorkStation/Hot Folders/JobFlow via uninstall registry), PX300 TCP reachability, and a read-only London BC classification attempt (never applied). Standalone `diagnose.py` writes `P2G_LONDON_DISCOVERY_REPORT.json/.md`.
- Cloud discovery endpoints: `GET /edge-v2/discovery/{agent}/latest` and `/report` (JSON + Markdown) built from the agent's latest read-only DISCOVER_CAPABILITIES result.
- SaaS Diagnostics screen (`/diagnostics`): status tiles (Edge Agent, PX300, Network, CWS, Hot Folders, London BC, JobFlow, REAL FIERY BACKEND=NOT IMPLEMENTED), capability matrix, RUN READ-ONLY DISCOVERY + EXPORT DISCOVERY REPORT.
- Hard-blocked during discovery: PRINT/RELEASE/DELETE/CANCEL/IMPORT/CHANGE_*/APPLY_TEMPLATE/MODIFY_JOB/CREATE_HOT_FOLDER/EDIT_PRESET. Everything remains read-only; PX300 not present in sandbox → all results honest UNKNOWN/UNREACHABLE.
- Sample reports at repo root: `P2G_LONDON_DISCOVERY_REPORT.json/.md` (generated in sandbox).
- Tests: 66 passed + 1 skipped (fixed idempotent-enqueue replay stability). Real agent demonstrated E2E populating the Diagnostics matrix.
- STOP: package ready for install on the real London PC; its report will determine V0.4 architecture (pending approval).
