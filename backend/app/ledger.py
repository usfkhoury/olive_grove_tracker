"""The oil ledger's one enforced write rule.

A pressing session (Harvest) owns exactly one press movement in the oil ledger:
an OilMovement with kind="press" whose amount mirrors the session's oil. That
movement is created, updated and removed only through the session here — never
edited directly via the oil API. This module is the single home for that rule;
the harvests router and the seed both go through it.

None of these functions commit. They mutate the caller's session, leaving the
transaction boundary to the caller (a route, or the seed batching many writes).
record_pressing/remove_pressing assume `harvest` is already flushed (has an id).
"""

from sqlalchemy.orm import Session

from . import models


def is_press_movement(movement: models.OilMovement) -> bool:
    """Single definition of what counts as a press movement."""
    return movement.kind == "press"


def record_pressing(db: Session, harvest: models.Harvest) -> None:
    """Create or update the press movement mirroring this pressing session."""
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


def remove_pressing(db: Session, harvest: models.Harvest) -> None:
    """Delete this session's press movement. The FK cascade is a backstop."""
    db.query(models.OilMovement).filter(
        models.OilMovement.harvest_id == harvest.id
    ).delete()
