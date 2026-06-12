from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .oil import _summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def month_in_range(month: int, start: int, end: int) -> bool:
    if start <= end:
        return start <= month <= end
    return month >= start or month <= end  # range wraps past December


@router.get("")
def dashboard(db: Session = Depends(get_db)):
    today = date.today()

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

    tasks = db.query(models.SeasonalTask).order_by(models.SeasonalTask.start_month).all()
    active, upcoming = [], []
    next_months = {(today.month % 12) + 1, ((today.month + 1) % 12) + 1}
    for t in tasks:
        out = schemas.TaskOut.model_validate(t).model_dump()
        if month_in_range(today.month, t.start_month, t.end_month):
            active.append(out)
        elif t.start_month in next_months:
            upcoming.append(out)

    recent = (
        db.query(models.Activity)
        .order_by(models.Activity.date.desc(), models.Activity.id.desc())
        .limit(5)
        .all()
    )

    tree_count = (
        db.query(models.Tree).filter(models.Tree.status == "active").count()
    )

    return {
        "today": today.isoformat(),
        "tree_count": tree_count,
        "seasons": season_list,
        "oil": _summary(db),
        "active_tasks": active,
        "upcoming_tasks": upcoming,
        "recent_activities": [
            schemas.ActivityOut.model_validate(a).model_dump(mode="json") for a in recent
        ],
    }
