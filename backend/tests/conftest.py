import os
import tempfile

import pytest

# Point the app at a throwaway database BEFORE importing it — app.main creates
# tables and seeds on import, and database.py reads OLIVE_DB at import time.
os.environ["OLIVE_DB"] = os.path.join(tempfile.mkdtemp(), "test-olive.db")
os.environ["OLIVE_SESSION_SECRET"] = "test-secret"
os.environ["GOOGLE_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com"
os.environ["OLIVE_OWNER_EMAIL"] = "owner@example.com"
os.environ["OLIVE_COOKIE_SECURE"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from app import auth  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    # The rate limiter keeps failed-login counts in a module-global dict keyed
    # by client IP. Every test shares the same "testclient" IP, so without this
    # the 5 failures from test_rate_limit_after_five_failures would linger and
    # make later logins (the authed_client fixture) get a 429.
    auth._failures.clear()
    yield
    auth._failures.clear()


@pytest.fixture()
def client():
    # Context manager runs the lifespan handler (init_db + seed).
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def authed_client(client, monkeypatch):
    """Client with a valid session cookie — use for all write operations.

    Logs in through the real /api/auth/google endpoint (so the cookie is set via
    a normal Set-Cookie response and logout can clear it), mocking google-auth's
    token verification so no real Google call is made.
    """
    monkeypatch.setattr(
        auth.id_token,
        "verify_oauth2_token",
        lambda *args, **kwargs: {"email": "owner@example.com", "email_verified": True},
    )
    res = client.post("/api/auth/google", json={"credential": "test"})
    assert res.status_code == 200, f"Login failed: {res.text}"
    return client
