"""The critical invariant (see AGENTS.md): every harvest write creates or
updates exactly one oil-ledger movement with kind="press" and
amount_kg == oil_kg; deleting the harvest removes it. Press movements can
never be touched directly through the oil API.

Tests run against the seeded test database, so they only assert on the
specific rows they create (matched via harvest_id), never on totals being
absolute values.
"""

from datetime import date

from app import ledger, models
from app.database import SessionLocal


def movements_for(client, harvest_id):
    res = client.get("/api/oil/movements")
    assert res.status_code == 200
    return [m for m in res.json() if m["harvest_id"] == harvest_id]


def balance(client):
    res = client.get("/api/oil/summary")
    assert res.status_code == 200
    return res.json()["balance_kg"]


def make_harvest(client, **overrides):
    payload = {
        "date": "2026-11-01",
        "olives_kg": 200,
        "oil_kg": 40,
        "tanake": 2.7,
        "notes": "test session",
        **overrides,
    }
    res = client.post("/api/harvests", json=payload)
    assert res.status_code == 201
    return res.json()


def test_create_harvest_creates_press_movement(authed_client):
    before = balance(authed_client)
    harvest = make_harvest(authed_client)

    moves = movements_for(authed_client, harvest["id"])
    assert len(moves) == 1
    move = moves[0]
    assert move["kind"] == "press"
    assert move["amount_kg"] == 40
    assert move["date"] == "2026-11-01"
    assert balance(authed_client) == before + 40


def test_update_harvest_updates_same_movement_not_duplicates(authed_client):
    harvest = make_harvest(authed_client)
    first_move_id = movements_for(authed_client, harvest["id"])[0]["id"]

    res = authed_client.put(
        f"/api/harvests/{harvest['id']}",
        json={
            "date": "2026-11-08",
            "olives_kg": 250,
            "oil_kg": 48.5,
            "tanake": 3.2,
            "notes": "corrected weights",
        },
    )
    assert res.status_code == 200

    moves = movements_for(authed_client, harvest["id"])
    assert len(moves) == 1
    assert moves[0]["id"] == first_move_id
    assert moves[0]["amount_kg"] == 48.5
    assert moves[0]["date"] == "2026-11-08"


def test_delete_harvest_removes_movement_and_restores_balance(authed_client):
    before = balance(authed_client)
    harvest = make_harvest(authed_client, oil_kg=33)

    res = authed_client.delete(f"/api/harvests/{harvest['id']}")
    assert res.status_code == 204
    assert movements_for(authed_client, harvest["id"]) == []
    assert balance(authed_client) == before


def test_press_movement_cannot_be_deleted_directly(authed_client):
    harvest = make_harvest(authed_client)
    move_id = movements_for(authed_client, harvest["id"])[0]["id"]

    res = authed_client.delete(f"/api/oil/movements/{move_id}")
    assert res.status_code == 400
    assert len(movements_for(authed_client, harvest["id"])) == 1

    # cleanup through the proper route still works
    assert authed_client.delete(f"/api/harvests/{harvest['id']}").status_code == 204


# Authenticated: these probe schema validation, which only runs after the
# require_admin auth check — an unauthenticated client would get 401 first.
def test_press_kind_cannot_be_created_via_oil_api(authed_client):
    res = authed_client.post(
        "/api/oil/movements",
        json={"date": "2026-11-01", "kind": "press", "amount_kg": 10, "notes": ""},
    )
    # rejected by schema validation — "press" is not an accepted input kind
    assert res.status_code == 422


def test_invalid_harvest_payloads_are_rejected(authed_client):
    bad = [
        {"date": "2026-11-01", "olives_kg": -5, "oil_kg": 1},
        {"date": "2026-11-01", "olives_kg": 0, "oil_kg": 1},
        {"date": "2026-11-01", "olives_kg": 100, "oil_kg": -1},
        {"date": "2026-11-01", "olives_kg": 100, "oil_kg": 20, "tanake": -2},
    ]
    for payload in bad:
        assert authed_client.post("/api/harvests", json=payload).status_code == 422, payload


def test_seasons_endpoint_matches_dashboard(client):
    seasons = client.get("/api/harvests/seasons").json()
    dashboard = client.get("/api/dashboard").json()
    assert seasons == dashboard["seasons"]
    assert seasons == sorted(seasons, key=lambda s: s["year"])


# Direct unit test of the ledger seam — no HTTP layer. Depends on `client` only
# to ensure the lifespan ran init_db so the tables exist; rolls back so nothing
# persists. flush() between calls mirrors the request boundary (each route
# commits), so the second record_pressing sees the first movement instead of
# creating a duplicate — the session is autoflush=False.
def test_record_pressing_keeps_one_movement_per_session(client):
    db = SessionLocal()
    try:
        harvest = models.Harvest(date=date(2027, 11, 1), olives_kg=200, oil_kg=40)
        db.add(harvest)
        db.flush()

        ledger.record_pressing(db, harvest)
        db.flush()
        harvest.oil_kg = 45  # a correction to the same session
        ledger.record_pressing(db, harvest)
        db.flush()

        moves = (
            db.query(models.OilMovement)
            .filter(models.OilMovement.harvest_id == harvest.id)
            .all()
        )
        assert len(moves) == 1
        assert moves[0].amount_kg == 45
        assert ledger.is_press_movement(moves[0])
    finally:
        db.rollback()
        db.close()


def test_out_kinds_are_stored_negative(authed_client):
    before = balance(authed_client)
    res = authed_client.post(
        "/api/oil/movements",
        json={"date": "2026-11-02", "kind": "gift", "amount_kg": 5, "notes": "to Amto"},
    )
    assert res.status_code == 201
    move = res.json()
    assert move["amount_kg"] == -5
    assert balance(authed_client) == before - 5

    assert authed_client.delete(f"/api/oil/movements/{move['id']}").status_code == 204
    assert balance(authed_client) == before
