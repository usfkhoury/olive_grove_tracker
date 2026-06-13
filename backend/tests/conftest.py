import os
import tempfile

import pytest

# Point the app at a throwaway database BEFORE importing it — app.main creates
# tables and seeds on import, and database.py reads OLIVE_DB at import time.
os.environ["OLIVE_DB"] = os.path.join(tempfile.mkdtemp(), "test-olive.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    return TestClient(app)
