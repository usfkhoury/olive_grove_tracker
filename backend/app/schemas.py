from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TreeIn(BaseModel):
    label: str = Field(min_length=1)
    row: int = Field(default=0, ge=0)
    col: int = Field(default=0, ge=0)
    variety: str = ""
    planted_year: int | None = None
    status: Literal["active", "removed"] = "active"
    notes: str = ""


class TreeOut(TreeIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class TreeRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    label: str


class ActivityIn(BaseModel):
    date: Date
    type: str = Field(min_length=1)
    notes: str = ""
    tree_ids: list[int] = []


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: Date
    type: str
    notes: str
    trees: list[TreeRef]


class HarvestIn(BaseModel):
    date: Date
    olives_kg: float = Field(gt=0)
    oil_kg: float = Field(ge=0)
    tanake: float | None = Field(default=None, ge=0)
    notes: str = ""


class HarvestOut(HarvestIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    yield_pct: float | None = None


class OilMovementIn(BaseModel):
    date: Date
    # "press" is deliberately absent — press movements only exist via harvests.
    kind: Literal["gift", "home", "sale", "adjustment"]
    amount_kg: float
    notes: str = ""


class OilMovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: Date
    kind: str  # includes "press" on output
    amount_kg: float
    notes: str
    harvest_id: int | None = None


class TaskIn(BaseModel):
    name: str = Field(min_length=1)
    start_month: int = Field(ge=1, le=12)
    end_month: int = Field(ge=1, le=12)  # may be < start_month (wraps past Dec)
    notes: str = ""


class TaskOut(TaskIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
