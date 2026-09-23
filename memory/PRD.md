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
