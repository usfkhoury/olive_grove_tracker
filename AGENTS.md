# Olive Grove Tracker — Agent Guide

Self-hosted web app for managing a home olive grove (~32 trees) in Lebanon.
Single Docker container: FastAPI backend + React SPA + SQLite database.

## Project layout

```
backend/app/
  main.py          FastAPI app: runs init_db (create/migrate), seeds data, mounts SPA
  database.py      SQLite engine (OLIVE_DB env var → data/olive.db), SessionLocal, get_db
  models.py        SQLAlchemy ORM models
  schemas.py       Pydantic v2 schemas (In/Out pairs)
  migrations.py    init_db + MIGRATIONS list (PRAGMA user_version-based ALTERs)
  seed.py          One-time seed: 32 trees, 15 pressing sessions, 9 seasonal tasks
  auth.py          Owner auth: /api/auth login/logout/verify, signed-cookie session, require_admin dependency, per-IP login rate limit
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
docker-compose.yml      Local: port 8000, volume ./data:/data, restart unless-stopped
docker-compose.prod.yml Production: adds Caddy reverse proxy, exposes 80/443, no direct port 8000
Caddyfile               Caddy config: reverse-proxies olives.usfkhoury.com → olive:8000, auto-TLS
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

- **Oil ledger integrity**: every `POST /api/harvests` creates or updates an `OilMovement` with `kind="press"` and `amount_kg = oil_kg`. `DELETE /api/harvests/{id}` deletes the matching movement first. Never create/delete `press`-kind movements directly. This invariant is covered by `backend/tests/test_harvest_ledger.py` — run the tests after touching harvests/oil code:
  ```powershell
  cd backend; pip install -r requirements.txt -r requirements-dev.txt; pytest
  ```
- **Auth on writes**: GET endpoints are public; every POST/PUT/DELETE takes `_: None = Depends(require_admin)`. The session cookie is an `itsdangerous`-signed token (signing key = `OLIVE_ADMIN_TOKEN`), never the raw token — so rotating `OLIVE_ADMIN_TOKEN` invalidates all sessions. `OilMovementIn.kind` excludes `"press"`; the login is rate-limited per client IP (read from `X-Forwarded-For` behind Caddy). When adding a mutating route, add the `require_admin` dependency and a test in `test_auth.py`.
- **Schema changes need a migration**: `create_all` never alters existing tables. Any change to an existing model's columns MUST come with a matching SQL statement appended to `MIGRATIONS` in `backend/app/migrations.py` (applied in order, tracked via `PRAGMA user_version`). Brand-new tables need no entry. Never reorder or edit past entries.
- **Dependencies are pinned** (`requirements.txt` exact versions, `frontend/package-lock.json` + `npm ci` in the Dockerfile) so a VM rebuild can't pull surprise upgrades. Bump versions deliberately and run the tests.
- **`seed_if_empty`** checks for existing Tree or Harvest rows before inserting anything. Never drops or truncates tables.
- **Pydantic v2**: all `Out` schemas use `model_config = ConfigDict(from_attributes=True)`. Use `model_dump(mode="json")` when you need JSON-serialisable dicts.
- **`yield_pct`** is a computed `@property` on `Harvest` (kept for schema compat) — the UI uses **ratio** (`olives_kg / oil_kg`, lower is better). No percentage signs appear anywhere in the UI.
- **Tanake auto-estimate**: `Math.round((oil_kg / 15) * 10) / 10`. A `tanakeEdited` flag in the Harvests form prevents overwriting a manual edit when the oil field changes.

## Domain vocabulary

| Term | Meaning |
|---|---|
| tanake (singular: tanakeh) | 16L oil tin ≈ 15kg oil |
| kis | sack ≈ 25kg olives |
| 3aser | olive press / mill |
| jefet | pomace left after pressing — dried for firewood |
| ratio | kg olives / kg oil (lower = better pressing; 2024 was 3.8:1, best on record) |

## API conventions

- All routes are prefixed `/api` (router prefix + app prefix).
- Dates as ISO strings (`YYYY-MM-DD`).
- Input validation lives in `schemas.py` (Pydantic `Field` constraints + `Literal` kinds/status), not in routers — invalid payloads get a 422. `OilMovementIn.kind` deliberately excludes `"press"`.
- Per-season aggregation has a single source of truth: `season_summaries()` in `routers/harvests.py`, served at `GET /api/harvests/seasons` and embedded in `GET /api/dashboard`. The frontend never re-computes it.
- `amount_kg` in `OilMovement` is always stored with the correct sign: gifts/home/sale = negative, press/adjustment = positive or negative depending on context.
- OpenAPI docs available at `/docs` when running locally.

## Production deployment

- **Live URL**: https://olives.usfkhoury.com
- **Host**: GCP e2-micro VM, region `us-east1` (Always Free tier), Ubuntu 22.04
- **Reverse proxy**: Caddy 2 (Docker) — auto-provisions Let's Encrypt TLS for the domain
- **DB**: SQLite at `./data/olive.db` on the VM's 30 GB persistent disk
- **CI/CD**: pushing to `main` runs `.github/workflows/deploy.yml`, which SCP-copies the
  source to the VM and rebuilds — no manual step. The runner clones with `GITHUB_TOKEN`
  and reaches the VM with the `DEPLOY_SSH_KEY` deploy key; **no GitHub credential is stored
  on the VM**. Full key/secret model in README → "SSH keys, secrets & how deploys authenticate".
- **`--force-recreate` is required** when restarting in prod (the workflow does this): the
  `Caddyfile` is bind-mounted, not baked in, so a plain `up -d` leaves the running Caddy on
  its old config and `Caddyfile` edits (e.g. security headers) silently never apply.
- **Host-key fingerprint** in `deploy.yml` pins the VM's **ECDSA** key — update it only if
  the VM is rebuilt (regenerate: `ssh-keyscan -t ecdsa <VM_IP> | ssh-keygen -lf -`).
- Manual fallback (on the VM): `docker compose -f docker-compose.prod.yml up -d --build --force-recreate`.
- Do not edit `Caddyfile` unless the domain changes — Caddy re-provisions TLS on any change.

## Running locally (without Docker)

```powershell
# backend (http://localhost:8000)
cd backend; pip install -r requirements.txt
uvicorn app.main:app --reload

# frontend (http://localhost:5173 — proxies /api to :8000)
cd frontend; npm install; npm run dev
```

## Rebuild after editing files

```powershell
docker compose up -d --build          # everyday rebuild
docker compose down
docker compose up -d --build --no-cache   # full clean rebuild
```

Data in `./data/olive.db` survives all rebuilds.

## What NOT to do

- Do not add expenses or cost tracking — the app intentionally omits them (oil is for home/gifts).
- Do not bypass `_sync_press_movement` when writing harvests; always go through the router.
- Do not drop or truncate `oil_movements` to reset stock — use an `adjustment` movement instead.
- Do not introduce yield percentages in the UI; ratio (`X:1`) is the only yield metric shown.
