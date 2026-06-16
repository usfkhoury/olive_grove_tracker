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

## Production

Live at **https://olives.usfkhoury.com** — deployed on a GCP e2-micro VM (us-east1)
with Caddy as a reverse proxy and automatic HTTPS via Let's Encrypt.

Production uses `docker-compose.prod.yml` (Caddy + app, ports 80/443) instead of the
local `docker-compose.yml` (port 8000 only). The `Caddyfile` at the repo root configures
the reverse proxy — edit it only if the domain changes.

## Deploying

**Deploys are automatic.** Pushing to `main` triggers `.github/workflows/deploy.yml`,
which builds and restarts the app on the VM. There's nothing to run by hand.

What the workflow does on each push to `main`:

1. A GitHub-hosted runner checks out this repo (cloning it with the built-in `GITHUB_TOKEN`).
2. It strips `.git`, then **SCP-copies** the source to the VM.
3. It **SSHes** into the VM and runs
   `docker compose -f docker-compose.prod.yml build --no-cache && up -d --force-recreate`.
4. A health check curls the live site and **fails the run** if it doesn't come back.

The VM never talks to GitHub — the runner pushes files to it — so **no GitHub
credential is ever stored on the server**. The full credential model is in
[SSH keys, secrets & how deploys authenticate](#ssh-keys-secrets--how-deploys-authenticate).

Manual fallback (only if you ever need to deploy by hand, logged into the VM):

```bash
cd <DEPLOY_PATH>
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```

`--force-recreate` matters: without it a changed `Caddyfile` (it's bind-mounted, not
baked into the image) is **not** re-read, so edits like security headers silently never
take effect.

## SSH keys, secrets & how deploys authenticate

> Reference for the whole SSH / credentials picture so it's not lost later.

### The mental model: private vs public vs host keys

- **Private key** — the secret half. Lives *only* on the machine that **starts** a
  connection. Never upload or share it.
- **Public key** — goes on whatever you connect **to** (a server's
  `~/.ssh/authorized_keys`, or your GitHub account). Safe to share. It only grants access
  to whoever holds the matching *private* key.
- **Host key** — the server's *own* identity key. The client checks it to be sure it's
  talking to the real server and not an impostor (man-in-the-middle).

### The keys in this project

| Key | Private half lives | Public half lives | Used for |
|---|---|---|---|
| **Your personal key** (`~/.ssh/id_ed25519` on your laptop, WSL + Windows) | your laptop only | your GitHub account **and** the VM's `authorized_keys` | you running `git push`; you SSHing into the VM by hand |
| **Deploy key** (CI → VM) | GitHub repo secret **`DEPLOY_SSH_KEY`** | the VM's `~/.ssh/authorized_keys` | the GitHub Action connecting to the VM (scp + ssh) |
| **VM host key** (`/etc/ssh/ssh_host_ecdsa_key`) | the VM | pinned as a *fingerprint* in `deploy.yml` | proving the VM's identity to the Action |

Key takeaway: a public key on GitHub or in `authorized_keys` only empowers whoever has the
matching **private** key. The VM holds **no** private key for GitHub — that's exactly why
it can't `git pull` a private repo, and why deploys use SCP instead (see below).

### The host-key fingerprint (`fingerprint:` in deploy.yml)

`deploy.yml` pins the VM's **ECDSA** host-key fingerprint (`SHA256:…`) so the Action
refuses to connect to any host but the real VM.

- It's the **ECDSA** key specifically because the Go SSH client the action uses prefers
  ECDSA over ED25519 — so that's the key the handshake negotiates and compares.
- The value must include the `SHA256:` prefix (the form `ssh.FingerprintSHA256` produces).
- **Change it only when the VM's host key changes** — i.e. if you rebuild/recreate the VM.
  Reboots, app changes, and rotating the deploy key never affect it. Regenerate with:
  ```bash
  ssh-keyscan -t ecdsa <VM_IP> | ssh-keygen -lf -    # take the "SHA256:…" field
  ```
  A mismatch you didn't cause is the MITM/impersonation alarm this pin exists to raise.

### GitHub repo secrets (Settings → Secrets and variables → Actions)

| Secret | What it is |
|---|---|
| `DEPLOY_HOST` | the VM's public IP |
| `DEPLOY_USER` | the Linux user on the VM (whose `authorized_keys` holds the deploy pubkey; in the `docker` group, no sudo) |
| `DEPLOY_SSH_KEY` | the **private** half of the deploy key |
| `DEPLOY_PATH` | absolute path on the VM the source is copied to |
| `GITHUB_TOKEN` | auto-provided per run, scoped to `contents: read`, expires when the job ends — used by `checkout` on the runner only |

### Why SCP and not `git pull` on the VM?

A private repo requires the VM to authenticate to GitHub. The ephemeral `GITHUB_TOKEN` is
**rejected when used for git from an external host** (it only works from GitHub's own
runners), and a long-lived deploy key or PAT *on the VM* would add a stored credential
there — the one thing we wanted to avoid. SCP keeps all GitHub auth on the runner (where
`GITHUB_TOKEN` works) and uses only the SSH deploy key to reach the VM.

### Rotating / regenerating keys

- **Deploy key** (if the CI key is ever exposed): generate a fresh keypair, add the new
  pubkey to the VM's `authorized_keys`, replace the `DEPLOY_SSH_KEY` secret with the new
  private key, then remove the old `authorized_keys` line.
  ```bash
  ssh-keygen -t ed25519 -f deploy_key -C "gha-deploy@olive" -N ""
  ```
- **Personal key**: standard GitHub SSH-key rotation; also update the VM's `authorized_keys`.
- Keep private keys readable only by you — Linux: `chmod 600`; Windows: restrict the file's
  ACL (remove inheritance, grant only your user).

### App login is separate from all of the above

The owner login on the website does **not** use SSH keys. It's a single secret token,
`OLIVE_ADMIN_TOKEN`, set in the VM's `.env` (see `.env.example`). The browser session is a
**signed cookie** (not the token itself), so a leaked cookie can't be replayed as the
password and rotating `OLIVE_ADMIN_TOKEN` invalidates all sessions. Generate a strong token
with `python -c "import secrets; print(secrets.token_hex(32))"`.

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
