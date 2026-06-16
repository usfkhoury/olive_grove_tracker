# Olive Grove Tracker — Agent Guide

Self-hosted web app for managing a home olive grove (~32 trees) in Lebanon.
Single Docker container: FastAPI backend + React SPA + SQLite database.

Companion docs (each topic has one home — don't duplicate):
- **`CONTEXT.md`** — the single glossary (domain language + local terms).
- **`README.md`** — human-facing: running locally, rebuilding, what's inside.
- **`docs/deploy.md`** — deployment, CI, secrets, VM/repo access, recovery.
- **`docs/adr/`** — recorded decisions.

## Tooling — run everything in Docker

Do **not** rely on host-installed toolchains (python, node, npm, pytest — examples,
not an exhaustive list). Host versions are often stale; Docker gives the pinned,
known-good versions the project builds and tests against. Run tests and one-off
scripts in a container, never on the host. The app itself runs via
`docker compose` (see README).

Run the tests in Docker:

```bash
docker run --rm -v "$PWD/backend:/b" -w /b python:3.12-slim \
  sh -c "pip install -q -r requirements.txt -r requirements-dev.txt && pytest -q"
```

## Project layout

```
backend/app/
  main.py          FastAPI app: runs init_db (create/migrate), seeds data, mounts SPA
  database.py      SQLite engine (OLIVE_DB env var → data/olive.db), SessionLocal, get_db
  models.py        SQLAlchemy ORM models
  schemas.py       Pydantic v2 schemas (In/Out pairs)
  migrations.py    init_db + MIGRATIONS list (PRAGMA user_version-based ALTERs)
  seed.py          One-time seed: 32 trees, 15 pressing sessions, 9 seasonal tasks
  auth.py          Owner auth: /api/auth google/logout/verify, signed-cookie session, require_admin dependency, per-IP rate limit
  ledger.py        Oil-ledger write rule: a pressing session owns one press movement (record_pressing/remove_pressing/is_press_movement). Used by harvests router + seed.
  summaries.py     Read-side aggregation (FastAPI-free): season_summaries() + oil_balance(). Used by the harvests/oil routes and the dashboard.
  routers/
    dashboard.py   GET /api/dashboard — summary data for the home page
    trees.py       CRUD /api/trees
    activities.py  CRUD /api/activities
    harvests.py    CRUD /api/harvests + GET /api/harvests/seasons (auto-syncs oil ledger on every write)
    oil.py         CRUD /api/oil/movements + GET /api/oil/summary
    tasks.py       CRUD /api/tasks (seasonal calendar)
    export.py      GET /api/export/{entity}.csv (trees/activities/harvests/oil/tasks) + GET /api/export/all.json

backend/tests/
  conftest.py           Points OLIVE_DB at a temp file before importing the app; autouse fixture resets the login rate-limit state between tests
  test_auth.py          Login/session/rate-limit behaviour; public GETs vs auth-gated writes
  test_harvest_ledger.py  Guards the harvest↔oil-ledger invariant
  test_export.py        Covers CSV exports and the full JSON backup endpoint
  test_csp.py           Guards that the Caddy CSP permits Google Identity Services

frontend/src/
  api.js           Base fetch wrapper, helpers (today, fmtDate, ACTIVITY_TYPES, MONTHS)
  App.jsx          React Router routes + bottom nav; top bar with theme toggle (light/dark/auto)
  styles.css       All CSS; uses CSS custom properties for full light/dark theming
  useSaveState.js  Hook: { saving, saved, run } — wraps async form submits with Saving…/Saved ✓ state
  pages/
    Dashboard.jsx  Home: oil stock, season summary, upcoming tasks, SeasonBars, export download links
    Trees.jsx      Grove map (CSS grid) + tree list; empty-cell placeholders + active/removed/empty legend
    TreeDetail.jsx Per-tree detail and activity history
    Activities.jsx Activity log + add form; filter by keyword, date range, and activity type
    Harvests.jsx   Pressing sessions grouped by season; SeasonBars + YieldTrend
    Oil.jsx        Oil ledger: movements list + add form
    CalendarPage.jsx  Seasonal task calendar by month
  components/
    SeasonBars.jsx   Horizontal bar chart: olives vs oil per season, ratio label
    YieldTrend.jsx   SVG line chart: ratio trend across seasons (Y-axis inverted); uses CSS class names for theming
    ErrorBoundary.jsx  Class component; wraps <Routes> — catches render errors, shows "Try again" card

Dockerfile              Two-stage: Node 20 builds frontend → Python 3.12 serves API + static
docker-compose.yml      Local: port 8000, volume ./data:/data, env_file .env, restart unless-stopped
docker-compose.prod.yml Production: adds Caddy reverse proxy, exposes 80/443, no direct port 8000
Caddyfile               Caddy config: reverse-proxies olives.usfkhoury.com → olive:8000, auto-TLS, security headers + CSP
```

## Data model

| Table | Key columns | Notes |
|---|---|---|
| `trees` | label, row, col, variety, planted_year, status (active/removed) | T1–T32, 8×4 grid |
| `activities` | date, type, notes; M2M → trees via `activity_trees` | empty trees = whole grove |
| `harvests` | date, olives_kg, oil_kg, tanake (nullable), notes | `tanake` = 16L tins (~15kg oil) |
| `oil_movements` | date, kind, amount_kg, notes, harvest_id FK | positive = in, negative = out |
| `seasonal_tasks` | name, start_month, end_month (1–12, wraps OK), notes | |

## Critical invariants

- **Oil ledger integrity**: every `POST /api/harvests` creates or updates an `OilMovement` with `kind="press"` and `amount_kg = oil_kg`. `DELETE /api/harvests/{id}` deletes the matching movement first. Never create/delete `press`-kind movements directly. This invariant is covered by `backend/tests/test_harvest_ledger.py` — run the tests (in Docker, see **Tooling**) after touching harvests/oil code.
- **Auth on writes**: GET endpoints are public; every POST/PUT/DELETE takes `_: None = Depends(require_admin)`. The session cookie is an `itsdangerous`-signed token (signing key = `OLIVE_SESSION_SECRET`), never a credential — so rotating `OLIVE_SESSION_SECRET` invalidates all sessions. Login is **Google sign-in (OIDC)**: `POST /api/auth/google` verifies the ID token via `google-auth` (audience = `GOOGLE_CLIENT_ID`) and accepts only `OLIVE_OWNER_EMAIL` (verified). `OilMovementIn.kind` excludes `"press"`; login is rate-limited per client IP (read from `X-Forwarded-For` behind Caddy). When adding a mutating route, add the `require_admin` dependency and a test in `test_auth.py`. Decision + rationale in `docs/adr/0001-google-oidc-no-breakglass-token.md`.
- **CSP must permit Google sign-in**: the Caddy `Content-Security-Policy` must allowlist the GIS origins (`https://accounts.google.com/gsi/*`) or the owner-login script is blocked in prod. Guarded by `backend/tests/test_csp.py`.
- **Schema changes need a migration**: `create_all` never alters existing tables. Any change to an existing model's columns MUST come with a matching SQL statement appended to `MIGRATIONS` in `backend/app/migrations.py` (applied in order, tracked via `PRAGMA user_version`). Brand-new tables need no entry. Never reorder or edit past entries.
- **Dependencies are pinned** (`requirements.txt` exact versions, `frontend/package-lock.json` + `npm ci` in the Dockerfile) so a VM rebuild can't pull surprise upgrades. Bump versions deliberately and run the tests.
- **`seed_if_empty`** checks for existing Tree or Harvest rows before inserting anything. Never drops or truncates tables.
- **Pydantic v2**: all `Out` schemas use `model_config = ConfigDict(from_attributes=True)`. Use `model_dump(mode="json")` when you need JSON-serialisable dicts.
- **`yield_pct`** is a computed `@property` on `Harvest` (kept for schema compat) — the UI uses **ratio** (`olives_kg / oil_kg`, lower is better). No percentage signs appear anywhere in the UI.
- **Tanake auto-estimate**: `Math.round((oil_kg / 15) * 10) / 10`. A `tanakeEdited` flag in the Harvests form prevents overwriting a manual edit when the oil field changes.

## Domain vocabulary

The glossary (domain language + local terms like tanake/kis/3aser/jefet/ratio)
lives in **`CONTEXT.md`** — the single source. Use its terms; don't drift to
synonyms it lists under _Avoid_.

## API conventions

- All routes are prefixed `/api` (router prefix + app prefix).
- Dates as ISO strings (`YYYY-MM-DD`).
- Input validation lives in `schemas.py` (Pydantic `Field` constraints + `Literal` kinds/status), not in routers — invalid payloads get a 422. `OilMovementIn.kind` deliberately excludes `"press"`.
- Per-season aggregation has a single source of truth: `season_summaries()` in `summaries.py`, served at `GET /api/harvests/seasons` and embedded in `GET /api/dashboard`. The frontend never re-computes it. Oil balance (`oil_balance()`) lives in the same module, served at `GET /api/oil/summary` and also embedded in the dashboard.
- `amount_kg` in `OilMovement` is always stored with the correct sign: gifts/home/sale = negative, press/adjustment = positive or negative depending on context.
- OpenAPI docs available at `/docs` when running locally.

## Deployment

Deploys are automatic on push to `main`. Full model — CI flow, secrets, VM/repo
access, recovery — is in **`docs/deploy.md`**. Markdown-only changes are skipped
by the workflow, so editing docs doesn't redeploy.

## Running & rebuilding

Local run, rebuild, and the `.env`/login setup are in **`README.md`**. Everything
runs in Docker (see **Tooling**). Data in `./data/olive.db` survives rebuilds.

## Agent skills

### Issue tracker
Issues live in GitHub Issues for usfkhoury/olive_grove_tracker, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels
Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs
Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## What NOT to do

- Do not add expenses or cost tracking — the app intentionally omits them (oil is for home/gifts).
- Do not write press movements by hand; always go through `ledger.record_pressing` / `ledger.remove_pressing` (the one home for the pressing↔ledger rule, used by both the harvests router and the seed).
- Do not drop or truncate `oil_movements` to reset stock — use an `adjustment` movement instead.
- Do not introduce yield percentages in the UI; ratio (`X:1`) is the only yield metric shown.
- Do not run host toolchains (python/node/npm/pytest) — use Docker (see **Tooling**).
