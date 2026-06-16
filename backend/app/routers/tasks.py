from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_admin
from ..database import get_db
from ._common import get_or_404

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[schemas.TaskOut])
def list_tasks(db: Session = Depends(get_db)):
    return (
        db.query(models.SeasonalTask)
        .order_by(models.SeasonalTask.start_month, models.SeasonalTask.id)
        .all()
    )


@router.post("", response_model=schemas.TaskOut, status_code=201)
def create_task(data: schemas.TaskIn, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    task = models.SeasonalTask(**data.model_dump())
    db.add(task)
    db.commit()
    return task


@router.put("/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, data: schemas.TaskIn, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    task = get_or_404(db, models.SeasonalTask, task_id, "Task")
    for key, value in data.model_dump().items():
        setattr(task, key, value)
    db.commit()
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    task = get_or_404(db, models.SeasonalTask, task_id, "Task")
    db.delete(task)
    db.commit()
