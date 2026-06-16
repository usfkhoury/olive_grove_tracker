import os
import time
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

# Rate limit on /auth/google. Not anti-brute-force: there's no password to guess —
# a valid session requires a Google-signed token for the owner's email, which this
# endpoint can't be tricked into minting. It's a DoS/abuse guard that caps how fast
# an unauthenticated caller can hammer verify_oauth2_token (which validates against
# Google's certs and is comparatively expensive).
_rate_lock = Lock()
_failures: dict[str, list[float]] = defaultdict(list)
_MAX_ATTEMPTS = 5
_WINDOW = 300  # 5-minute sliding window
_SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

# Set OLIVE_COOKIE_SECURE=false in local HTTP dev environments.
_SECURE = os.environ.get("OLIVE_COOKIE_SECURE", "true").lower() != "false"


def _session_secret() -> str:
    """Signing key for the session cookie.

    Dedicated secret (not the old admin token): identity is now proven via
    Google sign-in, so the cookie's signing key is decoupled from login.
    Rotating it instantly invalidates every outstanding session.
    """
    s = os.environ.get("OLIVE_SESSION_SECRET", "")
    if not s:
        raise HTTPException(503, "Auth not configured on server")
    return s


def _google_client_id() -> str:
    v = os.environ.get("GOOGLE_CLIENT_ID", "")
    if not v:
        raise HTTPException(503, "Google sign-in not configured on server")
    return v


def _owner_email() -> str:
    v = os.environ.get("OLIVE_OWNER_EMAIL", "")
    if not v:
        raise HTTPException(503, "Google sign-in not configured on server")
    return v


def _client_ip(request: Request) -> str:
    """Real client IP for rate limiting.

    Behind Caddy the TCP peer is the proxy, so request.client.host would be one
    shared address for everyone — five wrong guesses from anyone would lock out
    all users. Caddy sets X-Forwarded-For; trust its first hop (the original
    client). Only reachable via the proxy in prod, so XFF isn't attacker-set.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# The session cookie is a *signed* value, never a credential itself: a leaked
# cookie can't be replayed as a login, sessions expire, and rotating
# OLIVE_SESSION_SECRET (the signing key) instantly invalidates every old cookie.
def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_session_secret(), salt="olive-session")


def _issue_session() -> str:
    return _serializer().dumps("owner")


def _valid_session(value: str | None) -> bool:
    if not value:
        return False
    try:
        _serializer().loads(value, max_age=_SESSION_MAX_AGE)
        return True
    except (BadSignature, SignatureExpired):
        return False


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    with _rate_lock:
        recent = [t for t in _failures.get(ip, []) if now - t < _WINDOW]
        _failures[ip] = recent
        if len(recent) >= _MAX_ATTEMPTS:
            raise HTTPException(429, "Too many failed attempts. Try again in 5 minutes.")


def _record_failure(ip: str) -> None:
    with _rate_lock:
        _failures[ip].append(time.time())


def _clear_failures(ip: str) -> None:
    with _rate_lock:
        _failures.pop(ip, None)


def _set_session_cookie(response: Response) -> None:
    response.set_cookie(
        "olive_session",
        _issue_session(),
        max_age=_SESSION_MAX_AGE,
        httponly=True,
        secure=_SECURE,
        samesite="strict",
        path="/",
    )


def require_admin(olive_session: str | None = Cookie(default=None)) -> None:
    """FastAPI dependency — add to every POST, PUT, DELETE endpoint."""
    _session_secret()  # 503 if auth isn't configured on the server
    if not _valid_session(olive_session):
        raise HTTPException(401, "Authentication required")


class _GoogleBody(BaseModel):
    credential: str


@router.post("/google")
def google_login(body: _GoogleBody, response: Response, request: Request) -> dict:
    """Exchange a Google Identity Services ID token for our session cookie.

    Only the configured owner's verified email is accepted. The ID token's
    signature, audience, issuer and expiry are validated by google-auth.
    """
    ip = _client_ip(request)
    _check_rate_limit(ip)
    client_id = _google_client_id()
    owner = _owner_email()

    try:
        info = id_token.verify_oauth2_token(
            body.credential, google_requests.Request(), client_id
        )
    except (ValueError, GoogleAuthError):
        _record_failure(ip)
        raise HTTPException(401, "Invalid Google credential")

    email = info.get("email", "")
    if not info.get("email_verified") or email.lower() != owner.lower():
        _record_failure(ip)
        raise HTTPException(403, "This Google account is not authorized")

    _clear_failures(ip)
    _set_session_cookie(response)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie("olive_session", path="/")
    return {"ok": True}


@router.get("/verify")
def verify(olive_session: str | None = Cookie(default=None)) -> dict:
    require_admin(olive_session)
    return {"ok": True}
