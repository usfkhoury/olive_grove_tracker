from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import ledger, models, schemas, summaries
from ..auth import require_admin
from ..database import get_db
from ._common import get_or_404

router = APIRouter(prefix="/oil", tags=["oil"])

# Valid input kinds are enforced by schemas.OilMovementIn ("press" excluded —
# press movements only exist via the harvests router).
OUT_KINDS = {"gift", "home", "sale"}


@router.get("/summary")
def oil_summary(db: Session = Depends(get_db)):
    return summaries.oil_balance(db)


@router.get("/movements", response_model=list[schemas.OilMovementOut])
def list_movements(db: Session = Depends(get_db)):
    return (
        db.query(models.OilMovement)
        .order_by(models.OilMovement.date.desc(), models.OilMovement.id.desc())
        .all()
    )


@router.post("/movements", response_model=schemas.OilMovementOut, status_code=201)
def create_movement(data: schemas.OilMovementIn, db: Session = Depends(get_db), _: None = Depends(require_admin)):
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
def delete_movement(movement_id: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    movement = get_or_404(db, models.OilMovement, movement_id, "Movement")
    if ledger.is_press_movement(movement):
        raise HTTPException(400, "Press movements are managed via harvests")
    db.delete(movement)
    db.commit()
