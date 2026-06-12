from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/oil", tags=["oil"])

TANAKE_KG = 15.0  # one 16L tanake holds ~15kg of oil
OIL_DENSITY = TANAKE_KG / 16.0  # kg per liter

OUT_KINDS = {"gift", "home", "sale"}
ALLOWED_KINDS = OUT_KINDS | {"adjustment"}


def _summary(db: Session) -> dict:
    balance = db.query(func.coalesce(func.sum(models.OilMovement.amount_kg), 0.0)).scalar()
    return {
        "balance_kg": round(balance, 2),
        "balance_tanake": round(balance / TANAKE_KG, 2),
        "balance_liters": round(balance / OIL_DENSITY, 1),
    }


@router.get("/summary")
def oil_summary(db: Session = Depends(get_db)):
    return _summary(db)


@router.get("/movements", response_model=list[schemas.OilMovementOut])
def list_movements(db: Session = Depends(get_db)):
    return (
        db.query(models.OilMovement)
        .order_by(models.OilMovement.date.desc(), models.OilMovement.id.desc())
        .all()
    )


@router.post("/movements", response_model=schemas.OilMovementOut, status_code=201)
def create_movement(data: schemas.OilMovementIn, db: Session = Depends(get_db)):
    if data.kind not in ALLOWED_KINDS:
        raise HTTPException(400, f"kind must be one of {sorted(ALLOWED_KINDS)}")
    amount = data.amount_kg
    if data.kind in OUT_KINDS:
        amount = -abs(amount)
    movement = models.OilMovement(
        date=data.date, kind=data.kind, amount_kg=amount, notes=data.notes
    )
    db.add(movement)
    db.commit()
    return movement


@router.delete("/movements/{movement_id}", status_code=204)
def delete_movement(movement_id: int, db: Session = Depends(get_db)):
    movement = db.get(models.OilMovement, movement_id)
    if not movement:
        raise HTTPException(404, "Movement not found")
    if movement.kind == "press":
        raise HTTPException(400, "Press movements are managed via harvests")
    db.delete(movement)
    db.commit()
