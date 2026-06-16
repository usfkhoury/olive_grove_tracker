from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas, summaries
from ..database import get_db

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def month_in_range(month: int, start: int, end: int) -> bool:
    if start <= end:
        return start <= month <= end
    return month >= start or month <= end  # range wraps past December


@router.get("")
def dashboard(db: Session = Depends(get_db)):
    today = date.today()

    season_list = summaries.season_summaries(db)

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
        "oil": summaries.oil_balance(db),
        "active_tasks": active,
        "upcoming_tasks": upcoming,
        "recent_activities": [
            schemas.ActivityOut.model_validate(a).model_dump(mode="json") for a in recent
        ],
    }
