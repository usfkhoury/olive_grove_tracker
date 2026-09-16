# Deploying Olive Grove to Netlify

The backend is a single Netlify Function (`netlify/functions/api.mts`) built with
Hono. It replaces the FastAPI+SQLite backend and stores data in the 5 Notion
databases already populated by `/opt/data/olive_notion_migration/migrate.py`.
The React frontend under `frontend/` builds to `frontend/dist` and is served
statically by Netlify.

## 1. Required environment variables (set in Netlify site → Site settings → Environment variables)

Secrets:
- `NOTION_API_KEY` — Notion internal integration token (starts `ntn_…`).
- `OLIVE_SESSION_SECRET` — random 32+ byte string; signs the login cookie.
  Rotate to invalidate every outstanding session.
- `GOOGLE_CLIENT_ID` — the OAuth 2.0 Web Client ID used by Google Identity
  Services on the frontend (same value the frontend was already using).
- `OLIVE_OWNER_EMAIL` — the ONE Google account allowed to sign in.

Notion data-source IDs (from `/opt/data/olive_notion_migration/db_ids.json`,
`data_source_id` field of each entry):
- `NOTION_DS_TREES`
- `NOTION_DS_ACTIVITIES`
- `NOTION_DS_HARVESTS`
- `NOTION_DS_OIL`
- `NOTION_DS_TASKS`

Notion database IDs (same file, `database_id` field — needed only for
`POST /pages` calls when creating new rows):
- `NOTION_DB_TREES`
- `NOTION_DB_ACTIVITIES`
- `NOTION_DB_HARVESTS`
- `NOTION_DB_OIL`
- `NOTION_DB_TASKS`

Optional:
- `OLIVE_COOKIE_SECURE` — set to `false` ONLY for local HTTP dev.
  Default (production) is `true` (HTTPS-only cookie).

## 2. Deploy via Netlify CLI

```bash
# From /repos/olive_grove_tracker
npm install -g netlify-cli   # once
netlify login                # once
netlify init                 # link this dir to a new/existing Netlify site
# When it asks: build cmd = (from netlify.toml), publish = frontend/dist
netlify env:set NOTION_API_KEY 'ntn_...'
netlify env:set OLIVE_SESSION_SECRET "$(openssl rand -hex 32)"
netlify env:set GOOGLE_CLIENT_ID '...apps.googleusercontent.com'
netlify env:set OLIVE_OWNER_EMAIL 'usf.kh96@gmail.com'
# repeat for each NOTION_DS_* / NOTION_DB_*
netlify deploy --prod
```

Or through the dashboard: connect the GitHub repo, keep the auto-detected
build settings (they come from `netlify.toml`), paste the env vars in the
Environment settings, click Deploy.

## 3. Custom domain: olives.usfkhoury.com

In the Netlify site → **Domain management** → **Add a domain** →
`olives.usfkhoury.com`. Netlify shows the DNS record you need at your DNS
host (usually a `CNAME` pointing to `<site-name>.netlify.app`). Add it,
wait for propagation, and Netlify auto-provisions Let's Encrypt.

Update the Google OAuth Client's **Authorized JavaScript origins** in the
Google Cloud Console to include `https://olives.usfkhoury.com` before you
try to log in.

## 4. What to do with the old backend

You can shut down the GCP e2-micro VM once the Netlify site is serving
requests and you've verified login + at least one round-trip write. The
Notion databases are now the source of truth — the SQLite file is legacy.

## 5. Local development

```bash
cd /repos/olive_grove_tracker
netlify dev    # serves the frontend and functions together on :8888
```

Load env vars from Netlify with `netlify link` + `netlify env:list`, or point
`netlify dev` at a local `.env` in the repo root (do NOT commit it).

## 6. Tests

Hits real Notion. Run from `/repos/olive_grove_tracker/netlify/functions`:

```bash
npm install
npx tsc -p tsconfig.build.json
node test/run.mjs
```

The harness reads `NOTION_API_KEY` from `/opt/data/.env` and data-source IDs
from `/opt/data/olive_notion_migration/db_ids.json`. It creates and deletes
temp rows so it leaves Notion clean.
