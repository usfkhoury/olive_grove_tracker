# Deployment & operations

The single home for running the live site: how deploys work, the secrets model,
how to reach the VM and the repo, manual fallback, and recovery. (Domain language
lives in [`CONTEXT.md`](../CONTEXT.md); the auth decision is in
[ADR-0001](adr/0001-google-oidc-no-breakglass-token.md).)

## Live environment

- **URL**: https://olives.usfkhoury.com
- **Host**: GCP e2-micro VM, region `us-east1` (Always Free tier), Ubuntu 22.04
- **Reverse proxy**: Caddy 2 (Docker) — auto-provisions Let's Encrypt TLS
- **App**: one container (FastAPI + built React SPA), SQLite at `./data/olive.db`
  on the VM's 30 GB persistent disk
- **Prod compose file**: `docker-compose.prod.yml` (Caddy + app, ports 80/443;
  no direct `8000`). Local dev uses `docker-compose.yml` (port 8000 only).

## How deploys work (automatic)

Pushing to `main` runs `.github/workflows/deploy.yml`. There is nothing to run by
hand.

- **Markdown-only changes are skipped** (`paths-ignore: '**.md'`) — editing docs
  does not redeploy the app.
- Steps on each qualifying push to `main`:
  1. A GitHub-hosted runner checks out the repo (cloning with the built-in
     `GITHUB_TOKEN`, scoped `contents: read`).
  2. It strips `.git`, then **SCP-copies** the source to the VM.
  3. It **SSHes** into the VM and runs
     `docker compose -f docker-compose.prod.yml build --no-cache && up -d --force-recreate`.
  4. A **health check** curls the live site and **fails the run** if it doesn't
     come back within ~60s (`--resolve` hits the local container directly, so it
     doesn't depend on hairpin NAT).
- **Manual trigger**: Actions tab → "Deploy to production" → Run workflow (or
  `gh workflow run "Deploy to production"`).

`--force-recreate` matters: the `Caddyfile` is bind-mounted, not baked into the
image, so a plain `up -d` leaves the running Caddy on its old config and
`Caddyfile` edits (security headers, CSP) silently never apply.

## Secrets & config model

Config is **not** stored in a `.env` on the VM. The workflow forwards GitHub repo
secrets into the remote shell, and `docker compose` interpolates `${VAR}` at build
and run time. The deploy script fails loudly if any required secret is empty,
rather than building a container that 503s on login.

Secrets live in **Settings → Secrets and variables → Actions**:

| Secret | What it is |
|---|---|
| `DEPLOY_HOST` | the VM's public IP |
| `DEPLOY_USER` | the Linux user on the VM (its `authorized_keys` holds the deploy pubkey; in the `docker` group, no sudo) |
| `DEPLOY_PATH` | absolute path on the VM the source is copied to |
| `DEPLOY_SSH_KEY` | the **private** half of the deploy key |
| `OLIVE_SESSION_SECRET` | session-cookie signing key |
| `GOOGLE_CLIENT_ID` | OAuth client ID (backend audience check) |
| `VITE_GOOGLE_CLIENT_ID` | same client ID, baked into the frontend build arg |
| `OLIVE_OWNER_EMAIL` | the single Gmail allowed to sign in |
| `GITHUB_TOKEN` | auto-provided per run, `contents: read`, used by `checkout` on the runner only |

## SSH keys: the mental model

- **Private key** — the secret half. Lives *only* on the machine that **starts** a
  connection. Never upload or share it.
- **Public key** — goes on whatever you connect **to** (a server's
  `authorized_keys`, or your GitHub account). Safe to share.
- **Host key** — the server's *own* identity key; the client checks it to be sure
  it's talking to the real server, not an impostor.

| Key | Private half lives | Public half lives | Used for |
|---|---|---|---|
| **Your personal key** | your laptop only | your GitHub account **and** the VM's `authorized_keys` | you running `git push`; you SSHing into the VM by hand |
| **Deploy key** | GitHub secret `DEPLOY_SSH_KEY` | the VM's `authorized_keys` | the GitHub Action reaching the VM (scp + ssh) |
| **VM host key** | the VM (`/etc/ssh/ssh_host_ecdsa_key`) | pinned as a fingerprint in `deploy.yml` | proving the VM's identity to the Action |

The VM holds **no** private key for GitHub — which is exactly why it can't
`git pull` a private repo, and why deploys use SCP instead.

### Why SCP and not `git pull` on the VM

A private repo requires the VM to authenticate to GitHub. The ephemeral
`GITHUB_TOKEN` is rejected for git from an external host (it only works from
GitHub's own runners), and a long-lived deploy key or PAT *on the VM* would add a
stored credential there — the one thing we wanted to avoid. SCP keeps all GitHub
auth on the runner (where `GITHUB_TOKEN` works) and uses only the SSH deploy key
to reach the VM.

### Host-key fingerprint

`deploy.yml` pins the VM's **ECDSA** host-key fingerprint (`SHA256:…`) so the
Action refuses to connect to any host but the real VM.

- It's **ECDSA** specifically because the Go SSH client the action uses negotiates
  it over ED25519.
- **Change it only when the VM's host key changes** — i.e. if you rebuild/recreate
  the VM. Reboots, app changes, and rotating the deploy key never affect it.
  ```bash
  ssh-keyscan -t ecdsa <VM_IP> | ssh-keygen -lf -    # take the "SHA256:…" field
  ```
  A mismatch you didn't cause is the impersonation alarm this pin exists to raise.

## Accessing the VM

SSH in with your **personal** key (its public half is in the VM's
`authorized_keys`):

```bash
ssh <DEPLOY_USER>@<DEPLOY_HOST>
```

`DEPLOY_USER` and `DEPLOY_HOST` are the GitHub Actions secrets (or your own
records) — they're deliberately not committed. The user is in the `docker` group
(no sudo), which is enough to run `docker compose`. The app lives at `DEPLOY_PATH`.

## Accessing the git repo

```bash
git clone git@github.com:usfkhoury/olive_grove_tracker.git
```

Push/pull use your personal SSH key registered on your GitHub account. The VM never
clones the repo (see "Why SCP" above).

## Manual fallback deploy (on the VM)

Only if you ever need to deploy by hand. Because config comes from the environment,
export the same vars first (or pass them inline), then:

```bash
cd <DEPLOY_PATH>
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```

## Break-glass recovery (owner login unavailable)

There is **no fallback login credential** by design (see
[ADR-0001](adr/0001-google-oidc-no-breakglass-token.md)). If Google sign-in is
down, `OLIVE_OWNER_EMAIL` is wrong, or the Gmail account is lost, regain write
access out-of-band by minting a session cookie on the VM — the `olive_session`
cookie is just a value signed with `OLIVE_SESSION_SECRET`, so no login endpoint is
involved:

```bash
docker compose exec olive python -c "from app.auth import _issue_session; print(_issue_session())"
```

Set `olive_session` to that value in the browser (devtools → Application →
Cookies), or send it straight to the API:

```bash
curl -b "olive_session=<value>" -X POST https://olives.usfkhoury.com/api/...
```

This is gated by SSH access to the VM (the same trust level as the deploy secrets),
the assumed always-available escape hatch.

**Revoking sessions**: sessions are stateless signed cookies (30-day max-age) with
no server-side store, so `logout` only clears the cookie in the calling browser. To
kill a leaked session, **rotate `OLIVE_SESSION_SECRET`** (update the GitHub secret)
and redeploy — this invalidates every session at once (you re-login on all your own
devices too). That's the deliberate panic button; there is no per-session
revocation.

## Rotating keys

- **Deploy key** (if the CI key is ever exposed): generate a fresh keypair, add the
  new pubkey to the VM's `authorized_keys`, replace the `DEPLOY_SSH_KEY` secret,
  then remove the old `authorized_keys` line.
  ```bash
  ssh-keygen -t ed25519 -f deploy_key -C "gha-deploy@olive" -N ""
  ```
- **Personal key**: standard GitHub SSH-key rotation; also update the VM's
  `authorized_keys`.
- Keep private keys readable only by you (`chmod 600`).
