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
relations, Fruit size / Pruning planned selects, Ripeness at
harvest (0–7), Sacks, Notes. (The Notion `Canopy density` column is no longer
used by the app — values kept, never written.) Season is parsed from the Name — no Season
property. API: `GET/POST /checks` (`?tree_id=`, `?season=`), `PUT/DELETE
/checks/:id`; one check per tree per season (409 on duplicate).

Oil movements: Kind (`press` / `home` / `gift` / `sale` / `soap` / `reserve` /
`adjustment`), Amount kg (signed; out-kinds stored negative), optional
**Vintage** (pressing year the oil belongs to; set by the Update stock panel),
optional **Soap batch** relation → the soap app's Soap Batches DB.
`reserve` moves oil from stock into the soap reserve (total at home unchanged);
`soap` uses the reserve first, then the stock. `GET /oil/summary` returns
`balance_kg` (total at home) = `stock_kg` (olive oil in stock) +
`soap_reserve_kg`, plus `stock_tanake` / `stock_liters`. `GET /soap/batches` lists the
soap app's batches, found through the Soap batch relation (no env var).
Per-year breakdown (`vintageFlows`, `frontend/src/lib/oil.js`): tagged
movements hit their vintage first, untagged ones the oldest oil.

**Units:** 1 tanake = 16 kg of oil; olive oil = 0.915 kg/L (tanake ≈ 17.5 L);
standard bottle 2.75 L. Constants live in `frontend/src/constants.js` and the
top of the summaries section in `netlify/functions/api.js` — keep them equal.
Harvest oil kg are weighed; Harvest Tanake = oil kg ÷ 16.

**Offline reading:** `frontend/public/sw.js` (registered from `App.jsx`, production
builds only). Page loads and API GETs are network-first with the last good copy
as fallback (marked `X-Olive-Offline: 1`, which shows the no-signal banner).
With signal, the app posts `'warm'` (at most every 10 min) and the worker saves
the full lists in `WARM` (`frontend/public/sw-offline.js`); per-tree / per-season
URLs never opened online are derived from them (`derive`, tested in
`frontend/src/lib/swOffline.test.js`). Add new GET endpoints to `WARM`;
`/assets/*` cache-first; writes, `/api/export/*` and `/api/auth/*` are never
cached. Bump `VERSION` in `sw.js` to drop old caches.

**Spray weather:** Home always shows Open-Meteo spray windows (next 4 days,
grove at Bireh ~915 m) (`frontend/src/lib/weather.js`,
`components/SprayWindow.jsx`). Nothing in the app keys off task names.

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
4. **Press ↔ trees = the Tree check's `Press` relation** (one press per tree
   per season). Harvest POST/PUT accept optional `tree_ids`; the API sets
   `Press` on those trees' checks for the press's year (creating checks as
   needed) and clears it on checks no longer ticked (`syncPressTrees`). Omit
   `tree_ids` to leave the links untouched.

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
