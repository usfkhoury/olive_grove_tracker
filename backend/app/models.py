from sqlalchemy import Column, Date, Float, ForeignKey, Integer, String, Table
from sqlalchemy.orm import relationship

from .database import Base

activity_trees = Table(
    "activity_trees",
    Base.metadata,
    Column("activity_id", ForeignKey("activities.id", ondelete="CASCADE"), primary_key=True),
    Column("tree_id", ForeignKey("trees.id", ondelete="CASCADE"), primary_key=True),
)


class Tree(Base):
    __tablename__ = "trees"

    id = Column(Integer, primary_key=True)
    label = Column(String, nullable=False)
    row = Column(Integer, default=0)
    col = Column(Integer, default=0)
    variety = Column(String, default="")
    planted_year = Column(Integer, nullable=True)
    status = Column(String, default="active")  # active | removed
    notes = Column(String, default="")

    activities = relationship(
        "Activity", secondary=activity_trees, back_populates="trees"
    )


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False)
    type = Column(String, nullable=False)
    notes = Column(String, default="")

    # Empty trees list means the activity applies to the whole grove.
    trees = relationship("Tree", secondary=activity_trees, back_populates="activities")


class Harvest(Base):
    __tablename__ = "harvests"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False)
    olives_kg = Column(Float, nullable=False)
    oil_kg = Column(Float, nullable=False)
    tanake = Column(Float, nullable=True)  # 16L tins (~15kg oil each)
    notes = Column(String, default="")

    @property
    def yield_pct(self):
        if not self.olives_kg:
            return None
        return round(self.oil_kg / self.olives_kg * 100, 1)


class OilMovement(Base):
    __tablename__ = "oil_movements"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False)
    kind = Column(String, nullable=False)  # press | gift | home | sale | adjustment
    amount_kg = Column(Float, nullable=False)  # positive = in, negative = out
    notes = Column(String, default="")
    harvest_id = Column(Integer, ForeignKey("harvests.id", ondelete="CASCADE"), nullable=True)


class SeasonalTask(Base):
    __tablename__ = "seasonal_tasks"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    start_month = Column(Integer, nullable=False)  # 1-12
    end_month = Column(Integer, nullable=False)  # 1-12, may wrap past December
    notes = Column(String, default="")
