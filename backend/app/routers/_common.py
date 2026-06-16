"""Shared router plumbing."""

from fastapi import HTTPException
from sqlalchemy.orm import Session


def get_or_404(db: Session, model, ident, name: str):
    """Fetch a row by primary key or raise a 404. `name` is the human label in
    the error message (it doesn't always match the class name — OilMovement is
    "Movement", SeasonalTask is "Task")."""
    obj = db.get(model, ident)
    if obj is None:
        raise HTTPException(404, f"{name} not found")
    return obj
