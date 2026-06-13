"""Read-only data export: a CSV per entity plus a single JSON backup of the
whole database. Useful for off-box backups and analysis in a spreadsheet."""

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/export", tags=["export"])


def _trees(db: Session):
    header = ["id", "label", "row", "col", "variety", "planted_year", "status", "notes"]
    rows = [
        [t.id, t.label, t.row, t.col, t.variety, t.planted_year, t.status, t.notes]
        for t in db.query(models.Tree).order_by(models.Tree.row, models.Tree.col).all()
    ]
    return header, rows


def _activities(db: Session):
    header = ["id", "date", "type", "trees", "notes"]
    rows = [
        [a.id, a.date, a.type, "; ".join(t.label for t in a.trees), a.notes]
        for a in db.query(models.Activity).order_by(models.Activity.date.desc()).all()
    ]
    return header, rows


def _harvests(db: Session):
    header = ["id", "date", "olives_kg", "oil_kg", "tanake", "yield_pct", "notes"]
    rows = [
        [h.id, h.date, h.olives_kg, h.oil_kg, h.tanake, h.yield_pct, h.notes]
        for h in db.query(models.Harvest).order_by(models.Harvest.date).all()
    ]
    return header, rows


def _oil(db: Session):
    header = ["id", "date", "kind", "amount_kg", "notes", "harvest_id"]
    rows = [
        [m.id, m.date, m.kind, m.amount_kg, m.notes, m.harvest_id]
        for m in db.query(models.OilMovement)
        .order_by(models.OilMovement.date, models.OilMovement.id)
        .all()
    ]
    return header, rows


def _tasks(db: Session):
    header = ["id", "name", "start_month", "end_month", "notes"]
    rows = [
        [t.id, t.name, t.start_month, t.end_month, t.notes]
        for t in db.query(models.SeasonalTask)
        .order_by(models.SeasonalTask.start_month)
        .all()
    ]
    return header, rows


EXPORTERS = {
    "trees": _trees,
    "activities": _activities,
    "harvests": _harvests,
    "oil": _oil,
    "tasks": _tasks,
}


@router.get("/{entity}.csv")
def export_csv(entity: str, db: Session = Depends(get_db)):
    exporter = EXPORTERS.get(entity)
    if not exporter:
        raise HTTPException(404, "Unknown export")
    header, rows = exporter(db)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{entity}.csv"'},
    )


@router.get("/all.json")
def export_all(db: Session = Depends(get_db)):
    """Full database dump for backup. Dates are encoded as ISO strings."""

    def dump(exporter):
        header, rows = exporter(db)
        return [dict(zip(header, row)) for row in rows]

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "trees": dump(_trees),
        "activities": dump(_activities),
        "harvests": dump(_harvests),
        "oil_movements": dump(_oil),
        "seasonal_tasks": dump(_tasks),
    }
