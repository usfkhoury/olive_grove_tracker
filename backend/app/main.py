import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import models  # noqa: F401 — registers models with Base
from .database import SessionLocal, engine
from .migrations import init_db
from .routers import activities, dashboard, export, harvests, oil, tasks, trees
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup work lives here (not at module level) so importing app.main —
    # from tests, scripts, a future alembic env — never mutates a database.
    init_db(engine)
    with SessionLocal() as db:
        seed_if_empty(db)
    yield


app = FastAPI(title="Olive Grove", version="1.0.0", lifespan=lifespan)

for r in (dashboard, trees, activities, harvests, oil, tasks, export):
    app.include_router(r.router, prefix="/api")


class SPAStaticFiles(StaticFiles):
    """Serve the built frontend; unknown paths fall back to index.html."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            # Unknown API routes must stay a JSON 404 — serving index.html
            # with a 200 makes the client's res.json() fail cryptically.
            if exc.status_code == 404 and not scope["path"].startswith("/api"):
                return await super().get_response("index.html", scope)
            raise


STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", SPAStaticFiles(directory=STATIC_DIR, html=True), name="spa")
