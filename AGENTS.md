# Agent notes — olive_grove_tracker

Single-owner web app for a ~32-tree olive grove in Lebanon. React SPA (Vite) +
one Netlify Function backed by Notion. No server, no container, no SQLite.

Live: **https://olives.usfkhoury.com** — Netlify site
`effulgent-narwhal-c4ff8b` (id `432d1705-1185-4101-b191-3b684b1d745f`).

## Architecture

- `frontend/` — Vite + React SPA. Built to `frontend/dist`, which Netlify
  publishes. Google Identity Services for owner sign-in; token stored in
  `localStorage.olive_google_id_token` and sent as `Authorization: Bearer …`
  on every mutating request.
- `netlify/functions/api.js` — the entire backend, one CommonJS file, manual
  path routing on `event.path`. Uses `@notionhq/client` (Notion API
  `2025-09-03`) + `google-auth-library`. GETs are public; writes require a
  valid Google ID token whose verified email matches `OWNER_EMAIL`.
- `netlify.toml` — build (`cd frontend && npm ci && npm run build`, publish
  `frontend/dist`), `/api/*` → function redirect, SPA fallback.

## Data model — Notion (5 databases under the "Olives" parent page)

| Frontend name  | Notion DB       | Env var                |
|---             |---              |---                     |
| trees          | Trees           | `NOTION_DB_TREES`      |
| activities     | Activities      | `NOTION_DB_ACTIVITIES` |
| harvests       | Harvests        | `NOTION_DB_HARVESTS`   |
| oil_movements  | Oil movements   | `NOTION_DB_OIL`        |
| seasonal_tasks | Seasonal tasks  | `NOTION_DB_TASKS`      |
| tree_checks    | Tree checks     | `NOTION_DB_CHECKS` (optional) |

Tree checks = one row per tree per season (`T12 — 2026`): Tree + Press
relations, Canopy density / Fruit size / Pruning planned selects, Ripeness at
harvest (0–7), Sacks, Notes. Season is parsed from the Name — no Season
property. API: `GET/POST /checks` (`?tree_id=`, `?season=`), `PUT/DELETE
/checks/:id`; one check per tree per season (409 on duplicate).

### Hard invariants — do not break

1. **Row id = Notion page uuid.** Legacy `[sqlite:<table>#<n>]` markers were
   purged (Sept 2026); `notesPlain()` still strips stray ones on read. Never
   write a marker.
2. **Harvest ↔ press-movement pair.** Every Harvest owns exactly one Oil
   movement with `Kind = "press"`, `amount_kg = harvest.oil_kg`,
   `date = harvest.date`, linked via the Harvest relation. It is created,
   updated, and archived only through the harvest's own POST/PUT/DELETE.
   The oil-movements endpoint rejects `kind: "press"` writes and refuses to
   delete press movements (400). Non-press movements can be edited (PUT).
3. **Task links are Notion relations, never name matches.** Activities and
   Harvests both carry a `Task` relation → Seasonal tasks. `GET /tasks` and
   `/dashboard` return each task's `done_dates` (activity + press dates via
   that relation); the browser turns them into due / done / not logged
   (`frontend/src/lib/season.js`). New harvests inherit the latest harvest's
   `Task` (= "Harvest & Pressing"), so presses tick that task automatically.

## Env vars (Netlify → Environment)

Backend: `NOTION_TOKEN` (or legacy `NOTION_API_KEY`), `GOOGLE_CLIENT_ID`,
`OWNER_EMAIL` (or legacy `OLIVE_OWNER_EMAIL`), plus the five `NOTION_DB_*`
and `NOTION_DB_CHECKS`.

Frontend build: `VITE_GOOGLE_CLIENT_ID` (same value as `GOOGLE_CLIENT_ID`),
`VITE_HOME_URL`.

## Tests

```
npm test                       # backend pure helpers (node:test, tests/)
cd frontend && npm test        # frontend lib/ maths (node:test)
```
Pure frontend logic lives in `frontend/src/lib/*.js` and imports only
`frontend/src/constants.js` (plain JS), so node can run it without JSX.

## Local dev

```
cd frontend && npm ci && npm run dev
cd netlify/functions && npm ci
npx netlify-cli dev   # proxies /api/* to the function
```

## Style rules

- Backend stays one CommonJS file, plain `.js`, 2-space indent, single
  quotes, no TypeScript, no framework, no bundler. Match `soap-calc`.
- Never `git commit` or `git push` from an agent.

## Deep context

Full ADRs and domain glossary archived at
`/opt/data/repo-archives/olive_grove_tracker/`:
`AGENTS.md` (the pre-simplification long version), `CONTEXT.md` (domain
glossary — pressing session, oil ledger, tanake/kis/3aser/jefet, ratio),
`docs/adr/`, `docs/agents/`.
