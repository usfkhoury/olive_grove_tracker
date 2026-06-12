from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
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


@router.get("", response_model=list[schemas.HarvestOut])
def list_harvests(db: Session = Depends(get_db)):
    return (
        db.query(models.Harvest)
        .order_by(models.Harvest.date.desc(), models.Harvest.id.desc())
        .all()
    )


@router.post("", response_model=schemas.HarvestOut, status_code=201)
def create_harvest(data: schemas.HarvestIn, db: Session = Depends(get_db)):
    harvest = models.Harvest(**data.model_dump())
    db.add(harvest)
    db.flush()
    _sync_press_movement(db, harvest)
    db.commit()
    return harvest


@router.put("/{harvest_id}", response_model=schemas.HarvestOut)
def update_harvest(
    harvest_id: int, data: schemas.HarvestIn, db: Session = Depends(get_db)
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
def delete_harvest(harvest_id: int, db: Session = Depends(get_db)):
    harvest = db.get(models.Harvest, harvest_id)
    if not harvest:
        raise HTTPException(404, "Harvest not found")
    db.query(models.OilMovement).filter(
        models.OilMovement.harvest_id == harvest_id
    ).delete()
    db.delete(harvest)
    db.commit()
