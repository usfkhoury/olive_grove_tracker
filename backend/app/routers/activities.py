from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/activities", tags=["activities"])


def _resolve_trees(db: Session, tree_ids: list[int]) -> list[models.Tree]:
    if not tree_ids:
        return []
    trees = db.query(models.Tree).filter(models.Tree.id.in_(tree_ids)).all()
    if len(trees) != len(set(tree_ids)):
        raise HTTPException(400, "One or more tree ids do not exist")
    return trees


@router.get("", response_model=list[schemas.ActivityOut])
def list_activities(
    tree_id: int | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    query = db.query(models.Activity)
    if tree_id is not None:
        query = query.filter(models.Activity.trees.any(models.Tree.id == tree_id))
    return (
        query.order_by(models.Activity.date.desc(), models.Activity.id.desc())
        .limit(limit)
        .all()
    )


@router.post("", response_model=schemas.ActivityOut, status_code=201)
def create_activity(data: schemas.ActivityIn, db: Session = Depends(get_db)):
    activity = models.Activity(date=data.date, type=data.type, notes=data.notes)
    activity.trees = _resolve_trees(db, data.tree_ids)
    db.add(activity)
    db.commit()
    return activity


@router.put("/{activity_id}", response_model=schemas.ActivityOut)
def update_activity(
    activity_id: int, data: schemas.ActivityIn, db: Session = Depends(get_db)
):
    activity = db.get(models.Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Activity not found")
    activity.date = data.date
    activity.type = data.type
    activity.notes = data.notes
    activity.trees = _resolve_trees(db, data.tree_ids)
    db.commit()
    return activity


@router.delete("/{activity_id}", status_code=204)
def delete_activity(activity_id: int, db: Session = Depends(get_db)):
    activity = db.get(models.Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Activity not found")
    db.delete(activity)
    db.commit()
