from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import ledger, models, schemas, summaries
from ..auth import require_admin
from ..database import get_db
from ._common import get_or_404

router = APIRouter(prefix="/harvests", tags=["harvests"])


@router.get("", response_model=list[schemas.HarvestOut])
def list_harvests(db: Session = Depends(get_db)):
    return (
        db.query(models.Harvest)
        .order_by(models.Harvest.date.desc(), models.Harvest.id.desc())
        .all()
    )


@router.get("/seasons")
def list_seasons(db: Session = Depends(get_db)):
    return summaries.season_summaries(db)


@router.post("", response_model=schemas.HarvestOut, status_code=201)
def create_harvest(data: schemas.HarvestIn, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    harvest = models.Harvest(**data.model_dump())
    db.add(harvest)
    db.flush()
    ledger.record_pressing(db, harvest)
    db.commit()
    return harvest


@router.put("/{harvest_id}", response_model=schemas.HarvestOut)
def update_harvest(
    harvest_id: int, data: schemas.HarvestIn, db: Session = Depends(get_db), _: None = Depends(require_admin)
):
    harvest = get_or_404(db, models.Harvest, harvest_id, "Harvest")
    for key, value in data.model_dump().items():
        setattr(harvest, key, value)
    ledger.record_pressing(db, harvest)
    db.commit()
    return harvest


@router.delete("/{harvest_id}", status_code=204)
def delete_harvest(harvest_id: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    harvest = get_or_404(db, models.Harvest, harvest_id, "Harvest")
    ledger.remove_pressing(db, harvest)
    db.delete(harvest)
    db.commit()
