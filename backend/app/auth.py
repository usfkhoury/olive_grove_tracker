import hmac
import os
import time
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

_rate_lock = Lock()
_failures: dict[str, list[float]] = defaultdict(list)
_MAX_ATTEMPTS = 5
_WINDOW = 300  # 5-minute sliding window

# Set OLIVE_COOKIE_SECURE=false in local HTTP dev environments.
_SECURE = os.environ.get("OLIVE_COOKIE_SECURE", "true").lower() != "false"


def _admin_token() -> str:
    t = os.environ.get("OLIVE_ADMIN_TOKEN", "")
    if not t:
        raise HTTPException(503, "Auth not configured on server")
    return t


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
    expected = _admin_token()
    if not olive_session or not hmac.compare_digest(
        olive_session.encode(), expected.encode()
    ):
        raise HTTPException(401, "Authentication required")


class _LoginBody(BaseModel):
    token: str


@router.post("/login")
def login(body: _LoginBody, response: Response, request: Request) -> dict:
    ip = request.client.host
    _check_rate_limit(ip)
    expected = _admin_token()
    if not hmac.compare_digest(body.token.encode(), expected.encode()):
        _record_failure(ip)
        raise HTTPException(401, "Invalid token")
    _clear_failures(ip)
    response.set_cookie(
        "olive_session",
        body.token,
        max_age=60 * 60 * 24 * 30,  # 30 days
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
