import os
import tempfile

import pytest

# Point the app at a throwaway database BEFORE importing it — app.main creates
# tables and seeds on import, and database.py reads OLIVE_DB at import time.
os.environ["OLIVE_DB"] = os.path.join(tempfile.mkdtemp(), "test-olive.db")
os.environ["OLIVE_ADMIN_TOKEN"] = "test-secret"
os.environ["OLIVE_COOKIE_SECURE"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    # Context manager runs the lifespan handler (init_db + seed).
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def authed_client(client):
    """Client with a valid session cookie — use for all write operations."""
    res = client.post("/api/auth/login", json={"token": "test-secret"})
    assert res.status_code == 200, f"Login failed: {res.text}"
    return client
