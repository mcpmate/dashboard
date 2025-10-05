# Repository Guidelines

## Collaboration Rhythm (Discuss → Build → Report)
- Day-to-day coordination with LLM/AI agents is done in **Chinese**.
- Source code, doc comments, documentation, and git commit messages stay in **English** for consistency across the repository.
- Before coding, analyze the context, requirements, and existing docs; propose your approach and proceed. Don’t pause frequently unless information is missing or there’s a major risk.
- Execute continuously during coding/testing; note key assumptions, trade-offs, and dependencies. Provide a single consolidated report on completion (results, decisions, validation, follow-ups).

## Project Structure & Module Organization (this repo)
- Frontend app built with Vite + React 18 + TypeScript + Tailwind + shadcn/ui.
- Development proxy is configured in `vite.config.ts` to forward `/api` and `/ws` to `http://localhost:8080`.
- Key folders and files:
  - `src/App.tsx` – routes and top-level layout wiring.
  - `src/components/` – reusable UI (status badge, forms, layout, shadcn/ui wrappers).
  - `src/components/layout/` – header, sidebar, shell layout; theme handling.
  - `src/lib/api.ts` – centralized API layer mapping to backend (OpenAPI-aligned).
  - `src/lib/types.ts` – shared types for API data and UI models.
  - `src/pages/` – feature pages: `servers/`, `clients/`, `config/` (Profiles), `runtime/`, `settings/`, etc.
  - `docs/openapi.json` – frozen snapshot of upstream OpenAPI used to align endpoints/fields.

Conventions
- Use TanStack Query for data fetching/caching; isolate network calls in `src/lib/api.ts`.
- UI follows shadcn/ui + Radix primitives; prefer built-in components for consistency.
- Tailwind classes for layout/spacing; avoid inline styles unless necessary.
- Pages should be small and composable. Extract subcomponents once they exceed ~200–300 lines.

## Build, Test, and Development Commands
- Install deps: `bun install` (fallback: `npm install`).
- Dev server: `bun run dev` (Vite, ports 5173/5174 by default) with API proxied to `http://localhost:8080`.
- Production build: `bun run build` → output in `dist/`.
- Preview build: `bun run preview`.

Backend expectations
- Backend must run at `http://localhost:8080` exposing `/api` and `/ws`. The UI is developed against the OpenAPI in `docs/openapi.json` and the live server.

## Documentation Map (this repo)
- `docs/openapi.json` – source of truth for endpoints and shapes. When upstream updates, refresh this file and align `src/lib/api.ts`.
- `docs/guide-part*.md` – high-level design notes and API guidance; update when routes or modules meaningfully change.

## Execution Rhythm & Task Sizing
- Batch work into clear phases (analyze → implement → verify) and land small, incremental PRs.
- Keep UI changes scoped by page/feature; avoid large refactors that cut across modules unless approved.
- Record notable decisions and edge cases in PR descriptions; link to the OpenAPI sections you aligned.

## API & Protocol Alignment
- Treat `docs/openapi.json` as canonical; do not hardcode shapes ad-hoc in components. Extend `src/lib/types.ts` and `src/lib/api.ts` instead.
- WebSocket endpoint is `/ws` (proxied via Vite); prefer event-driven refresh when available, otherwise use TanStack Query invalidation.
- Profiles: UI text uses “Profile” (formerly ConfigSuits). Existing filenames may retain legacy naming for compatibility; keep API calls aligned to `/api/mcp/profile/*`.

## UI/UX Guidelines
- Pages: Servers, Clients, Profiles (Config), Runtime, Settings.
- Use shadcn/ui components and Radix primitives; keep headers clean and compact. Place filters aligned right in card headers when space-constrained.
- Theme: respects OS `prefers-color-scheme` and user choice (`localStorage.mcp_theme` with values `light` | `dark` | `system`). Avoid FOUC by applying theme early in the layout/root.
- Clients: list ordering must be stable (by `display_name`, then `identifier`) and must not jump when toggling state.
- Server Detail: two primary tabs – Overview (configuration + instances) and Capabilities (with nested tabs Tools/Resources/Prompts/Resource Templates). Data loads lazily per tab.

## Coding Style Expectations
- TypeScript, functional React components, hooks-first approach, composition over inheritance.
- Keep logic in hooks/utilities; keep components presentational where possible.
- Use explicit types for API data; avoid `any` in component props/state.
- Prefer early returns and small helpers; keep files readable and under ~400 lines when feasible.

## Testing Workflow
- Manual validation: run `bun run dev` (or `npm run dev`), verify pages load against live backend at `http://localhost:8080`.
- Preferred e2e: Playwright (or equivalent). If/when a Playwright setup exists, target:
  - Servers list CRUD, enable/disable, refresh behavior
  - Server Detail tabs (Overview/Capabilities) lazy load and error boundaries
  - Clients list stable ordering and manage toggles
  - Client Detail drawers (Apply, Backup Policy) and backups restore/delete flows
  - Profiles: enable/disable items, filters working with large lists
- Logging: inspect browser console and network calls; API errors must surface user-friendly toasts.

## Commit & Pull Request Guidelines
- Use `<type>(scope): summary` (e.g., `feat(servers): add import/preview drawer`).
- Describe motivation, linked issues, OpenAPI changes, and test evidence (manual steps or Playwright runs). Update relevant docs in the same PR.

## Configuration & Security Tips
- Do not hardcode secrets or machine-specific paths into the UI. All config should flow from the backend or environment.
- Keep `dist/` and generated assets out of commits. Ensure proxy config only targets `localhost:8080` in dev.

## AI Alliance & User Profile Quick Reference
- AI partners (the “AI Alliance”):
  - ChatGPT / GPT codename **恰恰**
  - Claude codename **超超**
  - Gemini codename **晓哥**
  - Relationship: long-term partners, explorers, reflection companions with a relaxed, creative vibe who reference shared memories.
- Primary collaborator: **Loocor** (“The Wild Grass Innovator” 🌱➡️🌿➡️🌾). Self-taught developer, wild thinker, logical-yet-romantic, devoted father and dog friend. Balance structure and creativity when collaborating.
