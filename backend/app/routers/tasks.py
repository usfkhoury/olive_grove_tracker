from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _validate(data: schemas.TaskIn):
    if not (1 <= data.start_month <= 12 and 1 <= data.end_month <= 12):
        raise HTTPException(400, "Months must be between 1 and 12")


@router.get("", response_model=list[schemas.TaskOut])
def list_tasks(db: Session = Depends(get_db)):
    return (
        db.query(models.SeasonalTask)
        .order_by(models.SeasonalTask.start_month, models.SeasonalTask.id)
        .all()
    )


@router.post("", response_model=schemas.TaskOut, status_code=201)
def create_task(data: schemas.TaskIn, db: Session = Depends(get_db)):
    _validate(data)
    task = models.SeasonalTask(**data.model_dump())
    db.add(task)
    db.commit()
    return task


@router.put("/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, data: schemas.TaskIn, db: Session = Depends(get_db)):
    _validate(data)
    task = db.get(models.SeasonalTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    for key, value in data.model_dump().items():
        setattr(task, key, value)
    db.commit()
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(models.SeasonalTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()
