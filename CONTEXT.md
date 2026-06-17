# Olive Grove Tracker

A single-owner web app for tracking olive trees, harvests, and oil production.
The public site is read-only; only the owner can change data.

This is the **single glossary** for the project — domain language and local terms.

## Language

**Owner**:
The one person allowed to make changes. Identity is proven by Google sign-in and
the verified email matching the configured owner address; there is no concept of
multiple users or roles.
_Avoid_: User, admin, account.

**Owner login**:
Proving you are the Owner via Google sign-in (OIDC). On success the server issues
a Session, not a long-lived credential.
_Avoid_: Sign-in token, password.

**Session**:
A signed, expiring cookie (`olive_session`) that marks a browser as the Owner. It
is not a credential — it is signed with `OLIVE_SESSION_SECRET` and verified on every
write; rotating that secret invalidates all sessions at once.
_Avoid_: Token, login token.

**Break-glass recovery**:
Regaining write access when Owner login is unavailable, by minting a Session cookie
by hand on the VM (gated by SSH access), rather than via any fallback login. See
[ADR-0001](./docs/adr/0001-google-oidc-no-breakglass-token.md); the runbook is in
[docs/deploy.md](./docs/deploy.md).
_Avoid_: Emergency token, admin token, fallback login.

## Olives & oil

**Pressing session**:
One trip to the press: a quantity of olives turned into a quantity of oil on a
given date. Stored as a Harvest row.
_Avoid_: Harvest (in prose), batch, run.

**Oil ledger**:
The running record of oil entering and leaving stock, as signed movements (in =
positive, out = negative). Its balance is the current stock.
_Avoid_: Inventory, stock log.

**Press movement**:
The single Oil ledger entry that mirrors a Pressing session — it always equals that
session's oil and is owned by it: created, updated, and removed only through the
session, never edited directly.
_Avoid_: Press entry, harvest movement.

## Local terms

The Lebanese/Arabic vocabulary the grove is run in. The UI and code use these
terms; keep to them rather than synonyms.

| Term | Meaning |
|---|---|
| tanake (singular: tanakeh) | 16L oil tin ≈ 15kg oil |
| kis | sack ≈ 25kg olives |
| 3aser | olive press / mill |
| jefet | pomace left after pressing — dried for firewood |
| ratio | kg olives / kg oil (lower = better pressing; 2024 was 3.8:1, best on record) |
