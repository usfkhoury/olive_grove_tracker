# Olive Grove Tracker — Agent Guide

Single-owner web app for a home olive grove (~32 trees) in Lebanon. Runs on
**Netlify**: a React SPA (Vite) plus one Netlify Function that talks to
**Notion** as the database. There is no server, no container, no SQLite.

Companion docs (each topic has one home — don't duplicate):
- **`CONTEXT.md`** — glossary (domain language + local terms).
- **`README.md`** — human-facing: running locally, rebuilding, what's inside.
- **`docs/adr/`** — recorded decisions.

Live URL: <https://olives.usfkhoury.com>. Netlify site
`effulgent-narwhal-c4ff8b` (id `432d1705-1185-4101-b191-3b684b1d745f`).

## Project layout

```
netlify/functions/
  api.js           The whole backend, in one CommonJS file.
                   - Node runtime, Netlify Functions v1 (`exports.handler`).
                   - Uses @notionhq/client SDK against Notion API 2025-09-03.
                   - Reads (GET) are public; every mutating request requires
                     `Authorization: Bearer <google-id-token>` — verified with
                     google-auth-library against GOOGLE_CLIENT_ID and
                     OWNER_EMAIL. Stateless: no cookies, no server session.
                   - Manual path routing on `event.path` — no framework.
  package.json     Only two deps: @notionhq/client, google-auth-library.

frontend/src/
  api.js           Fetch wrapper. Injects `Authorization: Bearer <token>` from
                   localStorage on every request. Dispatches an
                   `olive:auth-invalid` custom event on 401/403 to drop the
                   token and return the UI to read-only.
  AuthContext.jsx  Stores the Google ID token in `localStorage.olive_google_id_token`.
                   Verifies via POST /api/auth/verify on mount + on login.
                   Exposes { isOwner, token, loginWithGoogle, logout }.
  App.jsx          React Router routes + top bar (theme toggle) + bottom nav.
  styles.css       All CSS. CSS custom properties power light/dark/auto themes.
  useSaveState.js  Hook: { saving, saved, run } for async form submits.
  pages/
    Dashboard.jsx  Home: oil stock, season summary, upcoming tasks, exports.
    Trees.jsx      Grove map (CSS grid) + tree list.
    TreeDetail.jsx Per-tree detail + activity history.
    Activities.jsx Activity log + add form; filter by keyword/date/type.
    Harvests.jsx   Pressing sessions grouped by season.
    Oil.jsx        Oil ledger: movements list + add form.
    CalendarPage.jsx  Seasonal task calendar by month.
  components/
    LoginModal.jsx     Google Identity Services button; calls loginWithGoogle.
    SeasonBars.jsx     Olives-vs-oil bars per season with ratio.
    YieldTrend.jsx     SVG line chart of ratio trend.
    ErrorBoundary.jsx  Wraps <Routes>.

netlify.toml       Build (`cd frontend && npm ci && npm run build`, publish
                   `frontend/dist`) + `/api/*` -> function redirect + SPA
                   fallback. Kept intentionally minimal to match soap-calc's
                   working shape.
```

## Notion data sources

Five Notion databases under the "Olives" parent page — one per SQLite table
in the old backend. `@notionhq/client`'s `databases.query({ database_id })`
handles the 2025-09-03 data-source translation for us; the code passes
database ids (not data-source ids).

| Frontend name  | Notion DB          | Env var                |
|---             |---                 |---                     |
| trees          | Trees              | `NOTION_DB_TREES`      |
| activities     | Activities         | `NOTION_DB_ACTIVITIES` |
| harvests       | Harvests           | `NOTION_DB_HARVESTS`   |
| oil_movements  | Oil movements      | `NOTION_DB_OIL`        |
| seasonal_tasks | Seasonal tasks     | `NOTION_DB_TASKS`      |

### Integer id bridge

Every page carries a marker at the end of its Notes rich_text field:

```
[sqlite:<table>#<int_id>]
```

`<table>` is one of `trees | activities | harvests | oil_movements |
seasonal_tasks`. The int is what the frontend and CSV/JSON exports use.
Creating a row scans for `max(existing) + 1`. This is a hard invariant —
never change the marker format and never mutate an existing marker.

### Harvest ↔ press-movement invariant

Every Harvest owns exactly one Oil movement with `Kind = "press"`, linked via
the Harvest relation, with `amount_kg = harvest.oil_kg`, `date = harvest.date`,
`notes = "Pressing of <olives_kg>kg olives"`.

- On POST /api/harvests: create the harvest, then create its paired press.
- On PUT /api/harvests/:id: update the harvest, then upsert its paired press.
- On DELETE /api/harvests/:id: archive both.
- POSTing an oil movement with `kind: "press"` is rejected implicitly by the
  input filter (only gift/home/sale/adjustment accepted).
- DELETE /api/oil/movements/:id refuses to archive a press movement (400) —
  press movements are managed via harvests.

## Env vars (Netlify site → Environment variables)

Required for the function:

- `NOTION_TOKEN` (or legacy `NOTION_API_KEY` — code accepts either)
- `GOOGLE_CLIENT_ID`
- `OWNER_EMAIL` (or legacy `OLIVE_OWNER_EMAIL`)
- `NOTION_DB_TREES`, `NOTION_DB_ACTIVITIES`, `NOTION_DB_HARVESTS`,
  `NOTION_DB_OIL`, `NOTION_DB_TASKS`

Frontend build vars:

- `VITE_GOOGLE_CLIENT_ID` (same value as `GOOGLE_CLIENT_ID`)
- `VITE_HOME_URL`

## Routes

All under `/api`, proxied by Netlify to `/.netlify/functions/api/:splat`.

```
GET    /api/trees                 GET    /api/harvests
GET    /api/trees/:id             GET    /api/harvests/seasons
POST   /api/trees                 POST   /api/harvests
PUT    /api/trees/:id             PUT    /api/harvests/:id
DELETE /api/trees/:id             DELETE /api/harvests/:id

GET    /api/activities?tree_id=&limit=   GET    /api/oil/summary
POST   /api/activities                    GET    /api/oil/movements
PUT    /api/activities/:id                POST   /api/oil/movements
DELETE /api/activities/:id                DELETE /api/oil/movements/:id

GET    /api/tasks                 GET    /api/dashboard
POST   /api/tasks                 GET    /api/export/trees.csv
PUT    /api/tasks/:id             GET    /api/export/activities.csv
DELETE /api/tasks/:id             GET    /api/export/harvests.csv
                                  GET    /api/export/oil.csv
POST   /api/auth/verify           GET    /api/export/tasks.csv
POST   /api/auth/logout           GET    /api/export/all.json
```

GETs are public. Mutating routes require `Authorization: Bearer <token>`.

## Local development

```bash
cd frontend && npm ci && npm run dev
cd netlify/functions && npm ci
# Full stack via Netlify CLI (proxies /api/* to the function):
npx netlify-cli dev
```

## Deploy

Push to the default branch — Netlify builds automatically. Manual override:

```bash
cd frontend && npm ci && VITE_GOOGLE_CLIENT_ID=... VITE_HOME_URL=... npm run build
cd ..
NETLIFY_AUTH_TOKEN=... npx netlify-cli deploy --prod \
  --dir=frontend/dist --functions=netlify/functions \
  --site=432d1705-1185-4101-b191-3b684b1d745f
```

## Style rules

- One function file (`netlify/functions/api.js`), CommonJS, plain `.js`.
  Match the soap-calc sibling site's shape: 2-space indent, single quotes,
  minimal comments where they add value, no TypeScript, no bundler config,
  no framework.
- Never `git commit` or `git push` from an agent — the human owner commits.
