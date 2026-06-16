"""Read-side aggregation over the grove's data.

Pure read model: each function takes a Session and returns plain dicts — no HTTP,
no writes. Lives here (not inside a router) so the oil/harvests routes and the
dashboard all read from one place instead of importing each other.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models

TANAKE_KG = 15.0  # one 16L tanake holds ~15kg of oil
OIL_DENSITY = TANAKE_KG / 16.0  # kg per liter


def oil_balance(db: Session) -> dict:
    """Current oil stock: the signed sum of every ledger movement."""
    balance = db.query(func.coalesce(func.sum(models.OilMovement.amount_kg), 0.0)).scalar()
    return {
        "balance_kg": round(balance, 2),
        "balance_tanake": round(balance / TANAKE_KG, 2),
        "balance_liters": round(balance / OIL_DENSITY, 1),
    }


def season_summaries(db: Session) -> list[dict]:
    """Per-year totals across all pressing sessions, oldest season first.
    Single source of truth — used by GET /harvests/seasons and the dashboard."""
    harvests = db.query(models.Harvest).order_by(models.Harvest.date).all()
    seasons: dict[int, dict] = {}
    for h in harvests:
        s = seasons.setdefault(
            h.date.year,
            {"year": h.date.year, "olives_kg": 0.0, "oil_kg": 0.0, "tanake": 0.0, "sessions": 0},
        )
        s["olives_kg"] += h.olives_kg
        s["oil_kg"] += h.oil_kg
        s["tanake"] += h.tanake or 0
        s["sessions"] += 1

    season_list = []
    for s in sorted(seasons.values(), key=lambda x: x["year"]):
        s = {k: round(v, 2) if isinstance(v, float) else v for k, v in s.items()}
        s["yield_pct"] = round(s["oil_kg"] / s["olives_kg"] * 100, 1) if s["olives_kg"] else None
        s["ratio"] = round(s["olives_kg"] / s["oil_kg"], 1) if s["oil_kg"] else None
        season_list.append(s)
    return season_list
