import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import models  # noqa: F401 — registers models with Base
from .database import Base, SessionLocal, engine
from .routers import activities, dashboard, harvests, oil, tasks, trees
from .seed import seed_if_empty

Base.metadata.create_all(engine)
with SessionLocal() as _db:
    seed_if_empty(_db)

app = FastAPI(title="Olive Grove", version="1.0.0")

for r in (dashboard, trees, activities, harvests, oil, tasks):
    app.include_router(r.router, prefix="/api")


class SPAStaticFiles(StaticFiles):
    """Serve the built frontend; unknown paths fall back to index.html."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", SPAStaticFiles(directory=STATIC_DIR, html=True), name="spa")
