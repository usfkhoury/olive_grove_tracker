# Auth & frontend login — current state and next-session handoff

This is the context for the planned work: replacing the shared admin-token login
with a **passwordless** owner login. The choice between **Google sign-in (OIDC)**
and **passkeys (WebAuthn)** will be made at the start of that session. Either way,
the goal is the same: stop relying on a single shared `OLIVE_ADMIN_TOKEN` that the
owner types in.

> Background: this app is single-owner. GETs are public (read-only site); every
> write (POST/PUT/DELETE) is gated. Used as a mobile PWA ("Add to Home Screen")
> and on desktop.

---

## 1. How login works today

### Backend — `backend/app/auth.py`
Router mounted at `/api/auth`. Endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | body `{ "token": "<OLIVE_ADMIN_TOKEN>" }`; on match, sets the session cookie |
| `POST /api/auth/logout` | clears the cookie |
| `GET  /api/auth/verify` | 200 if the cookie is a valid session, else 401 |

Key mechanics:

- **The secret**: `OLIVE_ADMIN_TOKEN` (env var). `_admin_token()` returns it, or raises
  503 if unset. Login compares the submitted token with `hmac.compare_digest`.
- **The session cookie is NOT the token**. On success, `_issue_session()` mints an
  `itsdangerous` `URLSafeTimedSerializer` token (signing key = `OLIVE_ADMIN_TOKEN`,
  salt `"olive-session"`, payload `"owner"`, 30-day max-age) and sets it as the
  `olive_session` cookie (`httponly`, `secure` per `OLIVE_COOKIE_SECURE`,
  `samesite=strict`, `path=/`).
- **`require_admin(olive_session: Cookie)`** is the FastAPI dependency on every
  mutating route. It calls `_valid_session()` which verifies the signature + expiry.
  Because the signing key is `OLIVE_ADMIN_TOKEN`, rotating that token invalidates all
  sessions.
- **Rate limit**: 5 failed logins per client IP per 5 min → 429. Client IP comes from
  `X-Forwarded-For` (set by Caddy) via `_client_ip()`, falling back to the socket peer.

### Frontend
- `frontend/src/AuthContext.jsx` — provides `{ isOwner, login, logout }`. On mount it
  `GET /api/auth/verify` and flips `isOwner` true if the cookie is valid. `login(token)`
  POSTs to `/api/auth/login`; `logout()` POSTs `/api/auth/logout`.
- `frontend/src/components/LoginModal.jsx` — a password input where the owner pastes the
  token; calls `login(token)`.
- Write UI across the app is shown/enabled based on `isOwner`.

### Where the secret lives
- `OLIVE_ADMIN_TOKEN` is set in the VM's `.env` (see `.env.example`) and passed to the
  container by `docker-compose.prod.yml`. It is **not** in git or in CI.
- Tests set it to `test-secret` in `backend/tests/conftest.py`.

### Tests
- `backend/tests/test_auth.py` covers login/logout/verify, the public-GET vs gated-write
  split, and the rate limit. `conftest.py` has an autouse fixture that resets the
  rate-limit state between tests.

---

## 2. What stays the same regardless of which option is chosen

Both Google and passkeys only change **how the owner proves identity**. After a
successful proof, reuse the existing machinery:

- Keep issuing the **same signed `olive_session` cookie** (`_issue_session()`), so
  `require_admin` and every gated route are untouched.
- **Session signing key**: today it's `OLIVE_ADMIN_TOKEN`. If login no longer uses that
  token, introduce a dedicated **`OLIVE_SESSION_SECRET`** env var for signing the cookie
  (don't keep overloading the admin token). Decide whether to keep `OLIVE_ADMIN_TOKEN`
  as a **bootstrap/break-glass fallback** login or remove it.
- **Frontend**: `AuthContext` stays the source of truth for `isOwner`; replace the
  `login(token)` path / `LoginModal` with the new flow but keep `verify` on mount and
  `logout`.
- **Deployment**: any new env var (client ID, owner email, session secret) must be added
  to **both** `.env.example` + the VM's `.env` **and** the `environment:` list in
  `docker-compose.prod.yml`. Deploys are automatic on push to `main`.
- **HTTPS**: prod has it (Caddy). Localhost is treated as a secure context by both
  WebAuthn and Google for dev.
- Add coverage to `backend/tests/test_auth.py`.

---

## 3. Option A — Sign in with Google (OIDC)

Owner clicks "Sign in with Google"; only their Gmail is allowed. Removes the shared
token entirely. Best match for the "reduce credentials" goal.

**External setup (one-time, in Google Cloud Console):**
- Create an **OAuth 2.0 Client ID** of type *Web application*.
- Authorized JavaScript origins: `https://olives.usfkhoury.com` and
  `http://localhost:5173` (dev).
- Note the **Client ID** (the GIS ID-token flow needs no client *secret*).

**New env vars:** `GOOGLE_CLIENT_ID`, `OLIVE_OWNER_EMAIL` (the one allowed address),
`OLIVE_SESSION_SECRET`.

**Backend (`auth.py`):**
- Add `POST /api/auth/google` accepting the GIS **ID token** (a JWT credential).
- Verify it with `google-auth` (`google.oauth2.id_token.verify_oauth2_token`, audience =
  `GOOGLE_CLIENT_ID`); check `email_verified` and `email == OLIVE_OWNER_EMAIL`.
- On success, `_issue_session()` and set the cookie (same as today).
- Add `google-auth` to `backend/requirements.txt` (pinned).

**Frontend:**
- Load Google Identity Services, render the Sign-in button, send the returned
  `credential` to `/api/auth/google`, then set `isOwner`. Replace `LoginModal`.

**Trade-offs:** depends on Google; needs the OAuth client; no new DB table; smallest
backend surface. Keep `OLIVE_ADMIN_TOKEN` as an optional break-glass login or drop it.

---

## 4. Option B — Passkeys (WebAuthn)

Passwordless, phishing-resistant, device-bound. No third party.

**Library:** `webauthn` (py_webauthn) on the backend; `navigator.credentials`
create/get on the frontend.

**Data model (needs a migration):** a `credentials` table — `credential_id` (PK/unique),
`public_key`, `sign_count`, `transports`, `created_at`. Add the model in `models.py` and
an `ALTER`/new-table note per the migration rules in `AGENTS.md` (new tables are created
by `create_all`; no MIGRATIONS entry needed for a brand-new table).

**Backend (`auth.py`):**
- Registration: `POST /api/auth/passkey/register/options` + `.../verify`. Gate the
  *first* registration with the existing `OLIVE_ADMIN_TOKEN` (one-time bootstrap), then
  the passkey is primary.
- Authentication: `POST /api/auth/passkey/login/options` + `.../verify`; on a valid
  assertion, `_issue_session()`.
- Config: **RP ID** = `olives.usfkhoury.com` (`localhost` in dev), expected origin checks,
  store/verify `sign_count`.

**New env vars:** `OLIVE_SESSION_SECRET` (and the RP ID can be derived or an env var).

**Frontend:** "Register passkey" / "Sign in with passkey" using the WebAuthn API; replace
`LoginModal`.

**Trade-offs:** no external dependency, but more code on both ends, a schema change, and
it's device-bound — **keep a recovery path** (e.g. retain `OLIVE_ADMIN_TOKEN` login as
break-glass, or support registering multiple passkeys).

---

## 5. Files the next session will likely touch

- `backend/app/auth.py` — new endpoints; reuse `_issue_session` / `require_admin`.
- `backend/app/models.py` + `backend/app/migrations.py` — **passkeys only** (new table).
- `backend/requirements.txt` — `google-auth` *or* `webauthn` (pin the version).
- `frontend/src/AuthContext.jsx`, `frontend/src/components/LoginModal.jsx` (or a new
  component) — swap the token flow for the chosen one.
- `.env.example` **and** `docker-compose.prod.yml` — new env vars; also add them to the
  VM's `.env`.
- `backend/tests/test_auth.py` — cover the new flow.

## 6. Suggested first steps in the new session

1. Pick Google vs passkeys (Section 3 vs 4).
2. Introduce `OLIVE_SESSION_SECRET` and switch the cookie signing key off
   `OLIVE_ADMIN_TOKEN`; decide the fate of `OLIVE_ADMIN_TOKEN` (drop vs break-glass).
3. Implement backend endpoint(s) + tests; keep `_issue_session`/`require_admin` intact.
4. Implement the frontend flow in `AuthContext` + replace `LoginModal`.
5. Add env vars to `.env.example`, the VM `.env`, and `docker-compose.prod.yml`.
6. For Google: register the OAuth client first. For passkeys: set RP ID per environment.
