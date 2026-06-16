import hmac
import os
import time
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

_rate_lock = Lock()
_failures: dict[str, list[float]] = defaultdict(list)
_MAX_ATTEMPTS = 5
_WINDOW = 300  # 5-minute sliding window
_SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

# Set OLIVE_COOKIE_SECURE=false in local HTTP dev environments.
_SECURE = os.environ.get("OLIVE_COOKIE_SECURE", "true").lower() != "false"


def _admin_token() -> str:
    t = os.environ.get("OLIVE_ADMIN_TOKEN", "")
    if not t:
        raise HTTPException(503, "Auth not configured on server")
    return t


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


# The session cookie is a *signed* value, never the admin token itself: a leaked
# cookie can't be replayed as the password, sessions expire, and rotating
# OLIVE_ADMIN_TOKEN (the signing key) instantly invalidates every old cookie.
def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_admin_token(), salt="olive-session")


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


def require_admin(olive_session: str | None = Cookie(default=None)) -> None:
    """FastAPI dependency — add to every POST, PUT, DELETE endpoint."""
    _admin_token()  # 503 if auth isn't configured on the server
    if not _valid_session(olive_session):
        raise HTTPException(401, "Authentication required")


class _LoginBody(BaseModel):
    token: str


@router.post("/login")
def login(body: _LoginBody, response: Response, request: Request) -> dict:
    ip = _client_ip(request)
    _check_rate_limit(ip)
    expected = _admin_token()
    if not hmac.compare_digest(body.token.encode(), expected.encode()):
        _record_failure(ip)
        raise HTTPException(401, "Invalid token")
    _clear_failures(ip)
    response.set_cookie(
        "olive_session",
        _issue_session(),
        max_age=_SESSION_MAX_AGE,
        httponly=True,
        secure=_SECURE,
        samesite="strict",
        path="/",
    )
    return {"ok": True}


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie("olive_session", path="/")
    return {"ok": True}


@router.get("/verify")
def verify(olive_session: str | None = Cookie(default=None)) -> dict:
    require_admin(olive_session)
    return {"ok": True}
