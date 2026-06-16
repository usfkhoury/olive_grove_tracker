from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_admin
from ..database import get_db
from ._common import get_or_404

router = APIRouter(prefix="/trees", tags=["trees"])


@router.get("", response_model=list[schemas.TreeOut])
def list_trees(db: Session = Depends(get_db)):
    return db.query(models.Tree).order_by(models.Tree.row, models.Tree.col).all()


@router.post("", response_model=schemas.TreeOut, status_code=201)
def create_tree(data: schemas.TreeIn, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    tree = models.Tree(**data.model_dump())
    db.add(tree)
    db.commit()
    return tree


@router.get("/{tree_id}", response_model=schemas.TreeOut)
def get_tree(tree_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Tree, tree_id, "Tree")


@router.put("/{tree_id}", response_model=schemas.TreeOut)
def update_tree(tree_id: int, data: schemas.TreeIn, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    tree = get_or_404(db, models.Tree, tree_id, "Tree")
    for key, value in data.model_dump().items():
        setattr(tree, key, value)
    db.commit()
    return tree


@router.delete("/{tree_id}", status_code=204)
def delete_tree(tree_id: int, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    tree = get_or_404(db, models.Tree, tree_id, "Tree")
    db.delete(tree)
    db.commit()
