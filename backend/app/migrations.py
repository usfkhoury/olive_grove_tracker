"""Lightweight schema migrations for the SQLite database.

`Base.metadata.create_all()` only creates tables that don't exist yet — it
never alters existing ones. So every model change that touches an existing
table MUST come with a matching SQL statement appended to MIGRATIONS, e.g.:

    MIGRATIONS = [
        "ALTER TABLE harvests ADD COLUMN press_location TEXT NOT NULL DEFAULT ''",
    ]

Never reorder or edit past entries — the schema version of a live database is
the count of entries already applied (stored in SQLite's `PRAGMA user_version`).
Brand-new tables don't need an entry; create_all handles them.
"""

from sqlalchemy.engine import Engine

from .database import Base

MIGRATIONS: list[str] = []


def init_db(engine: Engine) -> None:
    """Create tables on a fresh database, or apply pending migrations to an
    existing one. Either way the database ends up at schema version
    len(MIGRATIONS) with all tables present."""
    with engine.connect() as conn:
        is_fresh = (
            conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table' LIMIT 1"
            ).first()
            is None
        )

    if is_fresh:
        # create_all builds the latest schema directly; stamp the version so
        # existing migrations are never replayed on top of it.
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.exec_driver_sql(f"PRAGMA user_version = {len(MIGRATIONS)}")
        return

    with engine.connect() as conn:
        version = conn.exec_driver_sql("PRAGMA user_version").scalar() or 0
    if version > len(MIGRATIONS):
        raise RuntimeError(
            f"Database schema version {version} is newer than this code "
            f"(knows {len(MIGRATIONS)}). Refusing to start — update the app."
        )

    for number, statement in enumerate(MIGRATIONS[version:], start=version + 1):
        with engine.begin() as conn:
            conn.exec_driver_sql(statement)
            conn.exec_driver_sql(f"PRAGMA user_version = {number}")
        print(f"Applied migration {number}/{len(MIGRATIONS)}: {statement}")

    # Pick up any tables added since this database was created.
    Base.metadata.create_all(engine)
