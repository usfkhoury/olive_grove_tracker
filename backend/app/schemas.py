from datetime import date as Date

from pydantic import BaseModel, ConfigDict


class TreeIn(BaseModel):
    label: str
    row: int = 0
    col: int = 0
    variety: str = ""
    planted_year: int | None = None
    status: str = "active"
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
    type: str
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
    olives_kg: float
    oil_kg: float
    tanake: float | None = None
    notes: str = ""


class HarvestOut(HarvestIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    yield_pct: float | None = None


class OilMovementIn(BaseModel):
    date: Date
    kind: str  # gift | home | sale | adjustment
    amount_kg: float
    notes: str = ""


class OilMovementOut(OilMovementIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    harvest_id: int | None = None


class TaskIn(BaseModel):
    name: str
    start_month: int
    end_month: int
    notes: str = ""


class TaskOut(TaskIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
