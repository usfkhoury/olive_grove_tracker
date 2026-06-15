from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_admin
from ..database import get_db

router = APIRouter(prefix="/harvests", tags=["harvests"])


def _sync_press_movement(db: Session, harvest: models.Harvest):
    """Each pressing session is mirrored as an 'in' movement in the oil ledger."""
    movement = (
        db.query(models.OilMovement)
        .filter(models.OilMovement.harvest_id == harvest.id)
        .first()
    )
    if movement is None:
        movement = models.OilMovement(harvest_id=harvest.id, kind="press")
        db.add(movement)
    movement.date = harvest.date
    movement.amount_kg = harvest.oil_kg
    movement.notes = f"Pressing of {harvest.olives_kg:g}kg olives"


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


@router.get("", response_model=list[schemas.HarvestOut])
def list_harvests(db: Session = Depends(get_db)):
    return (
        db.query(models.Harvest)
        .order_by(models.Harvest.date.desc(), models.Harvest.id.desc())
        .all()
    )


@router.get("/seasons")
def list_seasons(db: Session = Depends(get_db)):
    return season_summaries(db)


@router.post("", response_model=schemas.HarvestOut, status_code=201)
def create_harvest(data: schemas.HarvestIn, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    harvest = models.Harvest(**data.model_dump())
    db.add(harvest)
    db.flush()
    _sync_press_movement(db, harvest)
    db.commit()
    return harvest


@router.put("/{harvest_id}", response_model=schemas.HarvestOut)
def update_harvest(
    harvest_id: int, data: schemas.HarvestIn, db: Session = Depends(get_db), _: None = Depends(require_admin)
):
    harvest = db.get(models.Harvest, harvest_id)
    if not harvest:
        raise HTTPException(404, "Harvest not found")
    for key, value in data.model_dump().items():
        setattr(harvest, key, value)
    _sync_press_movement(db, harvest)
    db.commit()
    return harvest


@router.delete("/{harvest_id}", status_code=204)
def delete_harvest(harvest_id: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    harvest = db.get(models.Harvest, harvest_id)
    if not harvest:
        raise HTTPException(404, "Harvest not found")
    db.query(models.OilMovement).filter(
        models.OilMovement.harvest_id == harvest_id
    ).delete()
    db.delete(harvest)
    db.commit()
