# Olive Grove Tracker — Agent Guide

Self-hosted web app for managing a home olive grove (~32 trees) in Lebanon.
Single Docker container: FastAPI backend + React SPA + SQLite database.

## Project layout

```
backend/app/
  main.py          FastAPI app: creates DB tables, seeds data, mounts SPA
  database.py      SQLite engine (OLIVE_DB env var → data/olive.db), SessionLocal, get_db
  models.py        SQLAlchemy ORM models
  schemas.py       Pydantic v2 schemas (In/Out pairs)
  seed.py          One-time seed: 32 trees, 15 pressing sessions, 9 seasonal tasks
  routers/
    dashboard.py   GET /api/dashboard — summary data for the home page
    trees.py       CRUD /api/trees
    activities.py  CRUD /api/activities
    harvests.py    CRUD /api/harvests (auto-syncs oil ledger on every write)
    oil.py         CRUD /api/oil/movements + GET /api/oil/summary
    tasks.py       CRUD /api/tasks (seasonal calendar)

frontend/src/
  api.js           Base fetch wrapper, helpers (today, fmtDate, ACTIVITY_TYPES, MONTHS)
  App.jsx          React Router routes + bottom nav
  pages/
    Dashboard.jsx  Home: oil stock, season summary, upcoming tasks, SeasonBars
    Trees.jsx      Grove map (CSS grid) + tree list
    TreeDetail.jsx Per-tree detail and activity history
    Activities.jsx Activity log + add form
    Harvests.jsx   Pressing sessions grouped by season; SeasonBars + YieldTrend
    Oil.jsx        Oil ledger: movements list + add form
    CalendarPage.jsx  Seasonal task calendar by month
  components/
    SeasonBars.jsx  Horizontal bar chart: olives vs oil per season, ratio label
    YieldTrend.jsx  SVG line chart: ratio trend across seasons (Y-axis inverted)

Dockerfile         Two-stage: Node 20 builds frontend → Python 3.12 serves API + static
docker-compose.yml Port 8000, volume ./data:/data, restart unless-stopped
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

- **Oil ledger integrity**: every `POST /api/harvests` creates or updates an `OilMovement` with `kind="press"` and `amount_kg = oil_kg`. `DELETE /api/harvests/{id}` deletes the matching movement first. Never create/delete `press`-kind movements directly.
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
- `amount_kg` in `OilMovement` is always stored with the correct sign: gifts/home/sale = negative, press/adjustment = positive or negative depending on context.
- OpenAPI docs available at `/docs` when running locally.

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
