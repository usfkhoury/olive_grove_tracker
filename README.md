# 🫒 Olive Grove

A self-hosted web app to manage a home olive grove (~32 trees): Activity Log,
Harvest & Pressing sessions with oil yield, an oil ledger (tanake in/out), a
per-tree map, and a Lebanese seasonal task calendar. Runs as a **single Docker
container** with a SQLite database — no other dependencies on the machine.

Pre-seeded with the 2020–2025 pressing history from the old Notion page.

## Run it locally

Everything runs in Docker — no Python/Node/npm needed on your machine.

```bash
docker compose up -d --build
```

Open **http://localhost:8000**. Browsing is public and read-only and needs no
configuration.

### Enable owner login locally

Owner login is Google sign-in (OIDC). To use it on localhost you need a few env
vars and a one-time Google setup:

1. Copy the env template:
   ```bash
   cp .env.example .env
   ```
2. Fill these in `.env`:
   - `OLIVE_SESSION_SECRET` — generate one (in Docker, no host tools):
     ```bash
     docker run --rm python:3.12-slim python -c "import secrets; print(secrets.token_hex(32))"
     ```
   - `GOOGLE_CLIENT_ID` **and** `VITE_GOOGLE_CLIENT_ID` — both set to your OAuth
     Web-application client ID
   - `OLIVE_OWNER_EMAIL` — the Gmail address allowed to sign in
   - `OLIVE_COOKIE_SECURE=false` — **required** on `http://localhost` (browsers
     won't store a `secure` cookie over plain HTTP, so login would silently fail
     to stick)
3. In Google Cloud Console, add `http://localhost:8000` as an **Authorized
   JavaScript origin** on that OAuth client.
4. Rebuild so the client ID is baked into the frontend bundle:
   ```bash
   docker compose up -d --build
   ```

### Use it from your phone (same Wi-Fi)

On a **Windows** host serving the container:

1. Find your PC's LAN IP: `ipconfig` → IPv4 Address (e.g. `192.168.1.20`).
2. Allow the port through Windows Firewall once (admin PowerShell):
   ```powershell
   New-NetFirewallRule -DisplayName "Olive Grove" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
   ```
3. On the phone, open `http://<your-pc-ip>:8000` and use the browser's
   **Add to Home Screen** — it installs as an app-like PWA.

The PC (and Docker) must be on for the app to be reachable.

## Rebuilding after changes

After editing any file, rebuild and restart the container:

```bash
docker compose up -d --build
```

This rebuilds the image (frontend + backend) and restarts the container in one
step. The database in `./data/` is untouched — your data persists across rebuilds.

For a fully clean rebuild (clears Docker layer cache):

```bash
docker compose down
docker compose up -d --build --no-cache
```

Two rules when changing backend code (details in `AGENTS.md`):

- **Changing a model's columns?** Append the matching `ALTER TABLE` to
  `MIGRATIONS` in `backend/app/migrations.py` — `create_all` never alters
  existing tables, so without it the live database keeps the old schema.
- **Touching harvests or the oil ledger?** Run the tests (in Docker):
  ```bash
  docker run --rm -v "$PWD/backend:/b" -w /b python:3.12-slim \
    sh -c "pip install -q -r requirements.txt -r requirements-dev.txt && pytest -q"
  ```

## Production & deployment

Live at **https://olives.usfkhoury.com**, on a GCP e2-micro VM with Caddy as a
reverse proxy and automatic HTTPS. **Deploys are automatic** — pushing to `main`
builds and restarts the app on the VM; there's nothing to run by hand.

The full operational picture — how the CI deploy works, the secrets model, how to
reach the VM and the repo, manual fallback, and break-glass recovery — lives in
**[docs/deploy.md](docs/deploy.md)**.

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

Domain language is defined in [`CONTEXT.md`](CONTEXT.md); contributor/agent
conventions are in [`AGENTS.md`](AGENTS.md); recorded decisions live in
[`docs/adr/`](docs/adr/).

## License

[MIT](LICENSE).
