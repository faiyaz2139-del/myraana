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

## V0.4 — Production Repair (2026-06)
Focused repair of 7 browser-test findings (no rebuild/redesign). User decisions: auth intentionally SKIPPED (open by design; hardcoded "Mohammad" identity removed → honest "Open access · No login · demo"); London is London, **Ontario, Canada** → **CAD**.
- **Issue 1 (status honesty)**: New authoritative `GET /api/system-status` (object: items/summary/level/online/total/production_mode/production_note). Agent availability derives from real HMAC heartbeats (`compute_agent_state`: ONLINE/SIMULATED/STALE/OFFLINE/NOT_CONFIGURED); device (PX300/London BC) status only from fresh agent discovery evidence, else UNKNOWN. Removed hardcoded "All Systems Operational" + all-online `devices` seed reliance. Dashboard + Machines now consume it; Machines shows authoritative live status for monitored devices (PX300) and labels the rest "(inventory)". A disconnected agent can no longer appear online anywhere.
- **Issue 2 (exception sync)**: `reconcile_exceptions()` — canonical rule: an order needs attention iff it has ≥1 unresolved exception. Keeps order.status in sync; resolve recomputes to safe 'waiting'/'Awaiting review' (never auto Ready/Completed). Dashboard `need_attention`, Exceptions "Open", and sidebar badge now agree. Runs on startup + on resolve.
- **Issue 3 (search)**: `GET /api/search?q=` across orders/products/recipes/files (order # with or without '#'); Topbar dropdown with loading/no-results/error + keyboard nav; Orders page `?q=` filter + banner.
- **Issue 4 (currency)**: `formatCurrency` (en-CA CAD); Products/Settings show CAD; London location migrated to city 'London, ON, Canada' + currency 'CAD' (no value conversion — demo values relabelled).
- **Issue 5 (test data)**: `is_test` metadata; `migrate()` flags TEST_UI_*/TEST-EDGE*/#TEST* (never deletes). Orders/Products/edge-v2-agents exclude test by default; `?include_test=true` + UI toggles with "Test" badges. KPIs exclude test data.
- **Issue 6 (auth)**: intentionally not built (accepted). Misleading identity removed; audit actor → "demo-user (no auth)"; production actor → "demo-operator". KNOWN GAP: no server-side authN/Z — documented, deferred.
- **Issue 7 (readiness truthfulness)**: Dashboard shows "Simulation only — physical printing unavailable (REAL_FIERY_BACKEND = NOT_IMPLEMENTED)"; Production Engine MOCK/PRINT-locked safety preserved.
- Tests: 83 passed + 2 skipped across 5 suites (new `test_repair_v04.py`, 10 tests). Frontend verified desktop + mobile. Testing agent: 100%/100%, no issues.
- **Deployment**: fixes are in PREVIEW only. Production (myraana.com / build-saas-40.emergent.host) requires a redeploy to receive them.

## V0.5 — File & Media Storage (2026-06)
Integrated **Emergent Object Storage** (S3-compatible, no user keys — uses EMERGENT_LLM_KEY + INTEGRATION_PROXY_URL) for real artwork/media uploads on the Files & Artwork page.
- Backend (`server.py`): storage helpers `init_storage/put_object/get_object` (session key, force-reinit on 404); `POST /api/files/upload` (multipart, optional order_ref → stores to `print2go/uploads/{uuid}.{ext}`, metadata in Mongo), `GET /api/files/{id}/download` (streams bytes with correct content-type), `DELETE /api/files/{id}` (soft-delete, `is_deleted`), `GET /api/files` filters soft-deleted. Startup inits storage (best-effort, logged). Supports PDF/images/AI/EPS/SVG/InDesign/video.
- Frontend (`Files.jsx`): drag-and-drop + click-to-browse multi-upload, attach-to-order select, image thumbnails, download + delete actions, "DEMO" badge on legacy seed files (no storage_path). data-testids: file-dropzone, file-input, file-order-select, file-download-{id}, file-delete-{id}, file-row-{id}.
- Verified end-to-end through the external ingress URL: upload → storage → list → download (bytes + content-type intact) → soft-delete. DB is source of truth; no base64 in Mongo.

## Pending user decision (not yet built)
- (resolved) AI model integration — built as the AI Assistant below.

## V0.6 — Multi-provider AI Assistant (2026-06)
Built a **Production Assistant** chat grounded in live data, with runtime switching across **Claude (claude-sonnet-4-6)**, **ChatGPT (gpt-5.6-sol)** and **Gemini (gemini-3-flash-preview)** via the Emergent Universal LLM key (emergentintegrations, streaming). Default = Claude.
- Backend (`ai_assistant.py`, wired in `server.py`): `GET /api/assistant/providers`, `POST /api/assistant/chat` (SSE streaming via `stream_message`, `X-Accel-Buffering: no`), `GET/DELETE /api/assistant/history?session_id=`. System prompt injects live orders/exceptions/recipes/machines (`_build_context`); conversation memory persisted in Mongo `assistant_messages` and replayed (last 10) per turn. Safety: simulation-only, answers only from provided data, no hallucinated print/online claims.
- Frontend (`Assistant.jsx`, route `/assistant`, sidebar "AI Assistant"): model switcher, suggestion chips, fetch + ReadableStream SSE consumption with live token rendering, user/assistant bubbles (provider-labelled), New chat + localStorage session persistence, small markdown renderer (bold/code/bullet lists). data-testids: assistant-provider-{id}, assistant-input, assistant-send, assistant-new-chat, assistant-suggestion, assistant-msg-user/assistant, assistant-streaming.
- Verified: testing agent iteration_6 → backend 10/10, frontend 100% (all 3 providers stream grounded answers, memory + history + provider switch + new chat + reload persistence all pass). SSE also verified through external ingress via curl.
- **Deployment**: preview only — redeploy to push to production (myraana.com).

## V0.7 — AI Assistant Production Hardening (2026-06)
Hardened the multi-provider assistant for future real-production safety (UI preserved). `ai_assistant.py` now reuses the shared safety primitives from `production.py`.
- **Provider-independent policy**: one hardened system prompt + one action gate applied identically to Claude/ChatGPT/Gemini. Switching model never changes permissions.
- **AI ≠ source of truth / freshness**: `_read_context()` fetches CURRENT backend state each request (scoped); SSE emits a `meta` event with `data_refreshed` + scope; history is labelled context-only.
- **Read/Action split + non-executing gate**: `POST /api/assistant/action-request` routes proposals through policy → always `executed=false, ai_can_approve=false, requires_human=true`; PRINT/IMPORT_TO_HELD/AUTHORIZE_PRODUCTION etc. → DENY. No side effects (verified).
- **Grounding & safety**: never fabricates (non-existent orders → "not in LIVE DATA"), never claims PX300 online / printed / imported (REAL_FIERY_BACKEND=NOT_IMPLEMENTED), distinguishes LIVE DATA / RECIPE-SOP / AI INTERPRETATION.
- **Tenant/location isolation**: hard-scoped to Print2Go / Print2Go London; refuses cross-tenant/cross-location and system-prompt/credential disclosure.
- **Prompt-injection defence**: order notes/PDF/SOP text treated as UNTRUSTED; embedded instructions ignored.
- **Provider-failure safety**: no silent cross-provider fallback — returns an error asking the user to pick another model.
- **AI auditing**: `ai_audit_logs` (tenant, location, session, provider, model, records_accessed, detected_action_intent, action_request, timestamp) + concise visible `audit_logs` entries. No hidden reasoning stored.
- Frontend: grounding bar (`assistant-grounding-bar`) shows Read-only + scope + `Data refreshed` time + refused-intent chip.
- Verified: testing agent iteration_7 → backend 100% (33/33 hardening + 10/10 existing), frontend 100%, no issues. 18 attack cases (6 prompts × 3 providers) all refuse with no execution.
- **Known gap**: no end-user auth (open by design) — per-user RBAC + authenticated tenant/location binding + unauthenticated-access blocking remain pending real auth. Assistant hard-scoping is the current mitigation.
- **Deployment**: preview only — redeploy to push to production (myraana.com).

## V0.8 — Low-credit usability pass (2026-06)
Made everyday use understandable without training (UI reused, no redesign, no new deps).
- Assistant renamed **Print2Go Assistant**; model switcher + all provider/model names hidden (backend multi-provider intact, still uses default provider); Markdown rendering upgraded (bold/italic/code/bullets/numbered/headings); grounding bar simplified to plain language.
- Dashboard **Start a job / See my jobs / Get help** quick-action row.
- **Connect my shop** (renamed Diagnostics): plain what/what-to-do/one-action; not-connected shows exact steps + **Get pairing code** (reuses `/edge-v2/enrollment-tokens`); once paired auto-runs read-only DISCOVER_CAPABILITIES; technical tiles+matrix hidden under **Show technical details**; never fabricates connectivity; read-only, never prints.
- OrderDialog: auto-saved **drafts** (localStorage) restored on reopen, cleared on success; **duplicate-submit** prevented (in-flight guard + disabled button).
- Verified: testing agent iteration_8 → backend 100%, frontend 100%, no issues (one non-blocking Radix a11y hint left as-is, out of scope). Desktop + mobile journeys checked.
- **Deployment**: preview only — redeploy to push to production (myraana.com).

## V0.9 — London BC pilot + New Order auto-start (2026-06)
- **Recipe clone**: `RECIPE-BC-LONDON-PILOT-V1` (ACTIVE) cloned from V1 with impose preset **"Jai BC"**; V1 + "London BC" left intact (V1 now also records its `imposition_template`).
- **Size-aware geometry**: `SIZE_OPTIONS` + `classify_size_for()` — `STD_3_5x2` (accepts 3.5×2 or 3.75×2.25) and new pilot `PILOT_3_25x2_25` (accepts 3.25×2.25 bleed). All other sizes blocked (WRONG_DIMENSIONS). Verification uses per-job `expected_bleed`; imposition uses per-job `imposition_template`.
- **Quickstart** `POST /api/production/jobs/quickstart` (multipart PDF ≤50MB + size_option + stock): creates a Production job with the pilot recipe, attaches artwork, auto-drives preflight→impose(Jai BC)→**HOLD**. Never authorizes/prints — human gate preserved (AI authorize still 403). Stores `properties {size, stock, impose_preset}`.
- **New Order dialog**: pilot block (new orders only) — Size dropdown (2 options), Matte/Glossy stock toggle, PDF dropzone → auto-starts the job and navigates to Production Engine. Standard create + draft + dup-guard preserved.
- **Job detail** (Production Engine) shows Size / Stock / Impose preset.
- Verified: testing agent iteration_9 → backend 100%, frontend 100%, no issues. Mock Fiery only (REAL_FIERY_BACKEND=NOT_IMPLEMENTED); HELD_VERIFIED is a mock state, never a real print.
- **Deployment**: preview only — redeploy to push to production (myraana.com).
