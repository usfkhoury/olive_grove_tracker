# Owner login is Google sign-in only, with no in-app break-glass token

The app is single-owner: GETs are public, every write is gated. We replaced the
shared `OLIVE_ADMIN_TOKEN` login with Google sign-in (OIDC) — only the verified
email matching `OLIVE_OWNER_EMAIL` is accepted — and **deliberately did not keep
any fallback login credential**. A second internet-reachable shared secret is the
exact attack surface we were removing, so re-adding one as "break-glass" would
defeat the change.

Recovery when Google login is unavailable (outage, lost/typo'd owner email) is
out-of-band and SSH-gated: the session cookie is just a value signed with
`OLIVE_SESSION_SECRET`, which lives on the VM, so the owner mints a valid session
by hand rather than via any login endpoint:

```bash
docker compose exec olive python -c "from app.auth import _issue_session; print(_issue_session())"
```

then sets `olive_session` to that value in the browser (or sends it as a cookie to
the API). This reuses existing machinery, adds no code, and is gated by the same
trust as editing `.env` and redeploying. The standing assumption is therefore that
the owner can always SSH to the VM; losing SSH is an access/backups problem, not
something the auth design defends against.

## Considered Options

- **Keep `OLIVE_ADMIN_TOKEN` as a break-glass login** — rejected: resurrects the
  internet-facing shared secret we removed, plus a second auth path to secure and test.
- **In-app emergency-token endpoint** — rejected for the same reason; a permanent
  network-reachable credential usable by anyone who has the token.
- **SSH-minted session cookie (chosen)** — no new code or attack surface; only
  usable by someone who already has shell on the box.
