# 🫒 Olive Grove

A self-hosted web app to manage a home olive grove (~32 trees): Activity Log,
Harvest & Pressing sessions with oil yield, an oil ledger (tanake in/out), a
per-tree map, and a Lebanese seasonal task calendar. Runs as a **single Docker
container** with a SQLite database — no other dependencies on the machine.

Pre-seeded with the 2020–2025 pressing history from the old Notion page.

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

## Rebuilding after changes

After editing any file, rebuild and restart the container:

```powershell
docker compose up -d --build
```

This rebuilds the image (frontend + backend) and restarts the container in one step.
The database in `./data/` is untouched — your data persists across rebuilds.

For a fully clean rebuild (clears Docker layer cache):

```powershell
docker compose down
docker compose up -d --build --no-cache
```

## What's inside

| Page | What it does |
|---|---|
| **Home** | Oil stock, current season totals, tasks due this time of year, recent activity, harvest history chart |
| **Trees** | Map of the grove (8×4 grid by default — edit row/col per tree to match reality), per-tree variety/age/notes and activity history |
| **Log** | Record fertilizing, plowing, weeding, pruning, spraying, watering… for the whole grove or tagged trees |
| **Harvest** | Pressing sessions: olives kg → oil kg → tanake (auto-estimated, 16L ≈ 15kg), olives-to-oil ratio computed, grouped per season |
| **Oil** | Ledger in kg / tanake (16L ≈ 15kg) / liters. Pressings add stock automatically; record gifts, home use, sales, adjustments |
| **Calendar** | Seasonal tasks by month (pruning Jan–Mar, harvest Oct–Nov, …) — fully editable |

## First-time housekeeping

- **Oil stock**: the ledger was seeded assuming all pre-2025 oil is gone, so it
  currently shows the full 2025 production (121.5 kg). Add an **adjustment** on
  the Oil page to set the real current stock.
- **Tree map**: trees are seeded as T1–T32 in an 8×4 grid. Open each tree to
  set its real position, variety and planting year.

## Data & backups

Everything lives in one file: `./data/olive.db`. Copy that file to back up;
restore by putting it back and restarting the container.

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
