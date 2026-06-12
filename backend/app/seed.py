"""One-time seed: 32 trees, the 2020-2025 pressing history from the Notion
'Olives' page, the Lebanese olive-grove seasonal calendar, and an oil-ledger
opening adjustment. Runs only when the database is empty."""

from datetime import date

from sqlalchemy.orm import Session

from . import models

# (date, olives_kg, oil_kg, tanake) — imported from Notion.
HARVEST_HISTORY = [
    (date(2020, 11, 1), 155, 31, 2),
    (date(2021, 11, 7), 130, 23.5, 1.5),
    (date(2021, 11, 21), 135, 28, 1.8),
    (date(2021, 11, 28), 180, 38, 2.5),
    (date(2022, 10, 15), 250, 47, 3.2),
    (date(2022, 10, 30), 150, 28.8, 1.9),
    (date(2022, 11, 13), 90, 23.5, 1.6),
    (date(2023, 10, 22), 290, 42.5, 2.8),
    (date(2023, 10, 29), 260, 45, 3.04),
    (date(2023, 11, 3), 250, 46, 3.1),
    (date(2023, 11, 5), 270, 50, 3.4),
    (date(2024, 10, 19), 150, 40, 3),
    (date(2025, 11, 2), 238, 44.5, 3),
    (date(2025, 11, 13), 134, 27, 1.8),
    (date(2025, 11, 22), 265, 50, 3.3),
]

# (name, start_month, end_month, notes)
SEASONAL_TASKS = [
    ("Pruning (taqlim)", 1, 3, "Prune after harvest, before spring growth."),
    ("Fertilizing", 2, 3, "Manure or NPK around the trunk before spring rains."),
    ("Plowing (fla7a)", 3, 4, "Turn the soil to keep moisture and bury weeds."),
    ("Weeding", 4, 6, "Clear weeds around trunks before summer."),
    ("Olive fly traps / spraying", 6, 9, "Watch for olive fruit fly as fruit sets."),
    ("Summer watering (young trees)", 7, 8, "Only young or stressed trees need it."),
    ("Prepare nets, sacks & tanake", 9, 9, "Kis 2ach kbir ~25kg olives; tanake 16L ~15kg oil."),
    ("Harvest & Pressing", 10, 11, "~2 hours per pressing run at the 3aser."),
    ("Collect jefet for 7atab", 11, 12, "Pomace dries and presses into firewood — smoky but burns fast."),
]


def seed_if_empty(db: Session) -> None:
    if db.query(models.Tree).first() or db.query(models.Harvest).first():
        return

    # 32 trees in a default 8x4 grid; fix positions/varieties from the Trees page.
    n = 1
    for row in range(1, 9):
        for col in range(1, 5):
            db.add(models.Tree(label=f"T{n}", row=row, col=col))
            n += 1

    for d, olives, oil, tanake in HARVEST_HISTORY:
        harvest = models.Harvest(date=d, olives_kg=olives, oil_kg=oil, tanake=tanake)
        db.add(harvest)
        db.flush()
        db.add(
            models.OilMovement(
                date=d,
                kind="press",
                amount_kg=oil,
                notes=f"Pressing of {olives:g}kg olives",
                harvest_id=harvest.id,
            )
        )

    # Zero out pre-2025 oil (long since consumed/gifted) so the ledger starts
    # at the 2025 production. Add your own adjustment to set the real stock.
    pre_2025_oil = sum(oil for d, _, oil, _ in HARVEST_HISTORY if d.year < 2025)
    db.add(
        models.OilMovement(
            date=date(2025, 1, 1),
            kind="adjustment",
            amount_kg=-pre_2025_oil,
            notes="Opening adjustment: 2020-2024 oil already consumed/gifted",
        )
    )

    for name, start, end, notes in SEASONAL_TASKS:
        db.add(models.SeasonalTask(name=name, start_month=start, end_month=end, notes=notes))

    db.commit()
