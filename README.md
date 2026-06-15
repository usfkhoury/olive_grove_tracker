# 🫒 Olive Grove

A self-hosted web app to manage a home olive grove (~32 trees): Activity Log,
Harvest & Pressing sessions with oil yield, an oil ledger (tanake in/out), a
per-tree map, and a Lebanese seasonal task calendar. Runs as a **single Docker
container** with a SQLite database — no other dependencies on the machine.

Pre-seeded with the 2020–2025 pressing history from the old Notion page

## Run it

```powershell
docker compose up -d --build
```

Open **http://localhost:8000**.

### Use it from your phone (same Wi-Fi)

1. Find your PC's LAN IP: `ipconfig` → IPv4 Address (e.g. `192.168.1.20`).
2. Allow the port through Windows Firewall once (admin PowerShell):
   ```powershell
   New-NetFirewallRule -DisplayName "Olive Grove" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
   ```
3. On the phone, open `http://<your-pc-ip>:8000` and use the browser's
   **Add to Home Screen** — it installs as an app-like PWA.

The PC (and Docker Desktop) must be on for the app to be reachable.

## Production

Live at **https://olives.usfkhoury.com** — deployed on a GCP e2-micro VM (us-east1)
with Caddy as a reverse proxy and automatic HTTPS via Let's Encrypt.

To deploy an update from the VM:

```bash
cd olive-grove
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Production uses `docker-compose.prod.yml` (Caddy + app, ports 80/443) instead of the
local `docker-compose.yml` (port 8000 only). The `Caddyfile` at the repo root configures
the reverse proxy — edit it only if the domain changes.

## Rebuilding after changes

After editing any file, rebuild and restart the container:

```powershell
docker compose up -d --build
```

This rebuilds the image (frontend + backend) and restarts the container in one step.
The database in `./data/` is untouched — your data persists across rebuilds.

Two rules when changing backend code (details in `AGENTS.md`):

- **Changing a model's columns?** Append the matching `ALTER TABLE` to
  `MIGRATIONS` in `backend/app/migrations.py` — `create_all` never alters
  existing tables, so without it the live database keeps the old schema.
- **Touching harvests or the oil ledger?** Run the tests:
  ```powershell
  docker run --rm -v "${PWD}\backend:/b" -w /b python:3.12-slim sh -c "pip install -q -r requirements.txt -r requirements-dev.txt && pytest -q"
  ```

For a fully clean rebuild (clears Docker layer cache):

```powershell
docker compose down
docker compose up -d --build --no-cache
```

## What's inside

| Page | What it does |
|---|---|
| **Home** | Oil stock, current season totals, tasks due this time of year, recent activity, harvest history chart; download links for all CSV/JSON exports |
| **Trees** | Map of the grove (8×4 grid by default — edit row/col per tree to match reality), per-tree variety/age/notes and activity history; empty-cell placeholders and legend show occupied vs. vacant grid positions |
| **Log** | Record fertilizing, plowing, weeding, pruning, spraying, watering… for the whole grove or tagged trees; filter by keyword, date range, and activity type |
| **Harvest** | Pressing sessions: olives kg → oil kg → tanake (auto-estimated, 16L ≈ 15kg), olives-to-oil ratio computed, grouped per season |
| **Oil** | Ledger in kg / tanake (16L ≈ 15kg) / liters. Pressings add stock automatically; record gifts, home use, sales, adjustments |
| **Calendar** | Seasonal tasks by month (pruning Jan–Mar, harvest Oct–Nov, …) — fully editable |

All forms show a **Saving… / Saved ✓** indicator on submit. A theme toggle (top-right) cycles light / dark / auto (follows OS); choice is persisted to `localStorage`.

## First-time housekeeping

- **Oil stock**: the ledger was seeded assuming all pre-2025 oil is gone, so it
  currently shows the full 2025 production (121.5 kg). Add an **adjustment** on
  the Oil page to set the real current stock.
- **Tree map**: trees are seeded as T1–T32 in an 8×4 grid. Open each tree to
  set its real position, variety and planting year.

## Export & backups

The Dashboard page has one-click download links for every entity as CSV and a full JSON backup:

| Export | URL |
|---|---|
| Trees | `/api/export/trees.csv` |
| Activities | `/api/export/activities.csv` |
| Harvests | `/api/export/harvests.csv` |
| Oil ledger | `/api/export/oil.csv` |
| Calendar tasks | `/api/export/tasks.csv` |
| Full backup | `/api/export/all.json` |

The raw database file also lives at `./data/olive.db` — copy it to back up; restore by putting it back and restarting the container.

## Architecture

- `backend/` — FastAPI + SQLAlchemy + SQLite. REST API under `/api`, OpenAPI
  docs at `/docs`. Seeds the database on first start (`app/seed.py`).
- `frontend/` — React (Vite), mobile-first PWA. Built statically and served by
  FastAPI from the same container.
- `Dockerfile` — two-stage build (Node builds the frontend, Python serves).

### Local development (optional, without Docker)

```powershell
# backend
cd backend; pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000

# frontend (separate terminal — proxies /api to :8000)
cd frontend; npm install; npm run dev  # http://localhost:5173
```
