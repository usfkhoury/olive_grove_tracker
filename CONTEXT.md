# Olive Grove Tracker

Single-owner web app for tracking olive trees, harvests, and oil production.
The public site is read-only; only the owner can change data. Stack: static
React frontend + one Netlify Function backed by Notion (five databases).

This is the **single glossary** for the project — domain language and local
terms.

## Language

**Owner**:
The one person allowed to make changes. Identity is proven by Google sign-in
and the verified email matching `OWNER_EMAIL`; there is no concept of
multiple users or roles.
_Avoid_: User, admin, account.

**Owner login**:
Proving you are the Owner via Google Identity Services. The Google ID token
(JWT) is stored in `localStorage.olive_google_id_token` and sent on every
mutating request as `Authorization: Bearer <token>`. The server verifies the
token on every write (audience = `GOOGLE_CLIENT_ID`, email = `OWNER_EMAIL`,
email must be verified). There is no server session and no server-issued
credential.
_Avoid_: Sign-in cookie, password, session cookie.

**Token expiry**:
Google ID tokens expire ~1 hour after issue. When a mutating request comes
back 401/403, the frontend clears the stored token and returns the UI to
read-only; the Owner signs in again.

## Olives & oil

**Pressing session**:
One trip to the press: a quantity of olives turned into a quantity of oil on
a given date. Stored as a Harvest row.
_Avoid_: Harvest (in prose), batch, run.

**Oil ledger**:
The running record of oil entering and leaving stock, as signed movements
(in = positive, out = negative). Its balance is the current stock.
_Avoid_: Inventory, stock log.

**Press movement**:
The single Oil-ledger entry that mirrors a Pressing session — it always
equals that session's oil and is owned by it: created, updated, and removed
only through the session, never edited directly.
_Avoid_: Press entry, harvest movement.

## Local terms

The Lebanese/Arabic vocabulary the grove is run in. The UI and code use
these terms; keep to them rather than synonyms.

| Term | Meaning |
|---|---|
| tanake (singular: tanakeh) | 16L oil tin ≈ 15kg oil |
| kis | sack ≈ 25kg olives |
| 3aser | olive press / mill |
| jefet | pomace left after pressing — dried for firewood |
| ratio | kg olives / kg oil (lower = better pressing; 2024 was 3.8:1, best on record) |
