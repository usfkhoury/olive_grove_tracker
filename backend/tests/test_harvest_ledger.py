"""The critical invariant (see AGENTS.md): every harvest write creates or
updates exactly one oil-ledger movement with kind="press" and
amount_kg == oil_kg; deleting the harvest removes it. Press movements can
never be touched directly through the oil API.

Tests run against the seeded test database, so they only assert on the
specific rows they create (matched via harvest_id), never on totals being
absolute values.
"""


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


def test_create_harvest_creates_press_movement(client):
    before = balance(client)
    harvest = make_harvest(client)

    moves = movements_for(client, harvest["id"])
    assert len(moves) == 1
    move = moves[0]
    assert move["kind"] == "press"
    assert move["amount_kg"] == 40
    assert move["date"] == "2026-11-01"
    assert balance(client) == before + 40


def test_update_harvest_updates_same_movement_not_duplicates(client):
    harvest = make_harvest(client)
    first_move_id = movements_for(client, harvest["id"])[0]["id"]

    res = client.put(
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

    moves = movements_for(client, harvest["id"])
    assert len(moves) == 1
    assert moves[0]["id"] == first_move_id
    assert moves[0]["amount_kg"] == 48.5
    assert moves[0]["date"] == "2026-11-08"


def test_delete_harvest_removes_movement_and_restores_balance(client):
    before = balance(client)
    harvest = make_harvest(client, oil_kg=33)

    res = client.delete(f"/api/harvests/{harvest['id']}")
    assert res.status_code == 204
    assert movements_for(client, harvest["id"]) == []
    assert balance(client) == before


def test_press_movement_cannot_be_deleted_directly(client):
    harvest = make_harvest(client)
    move_id = movements_for(client, harvest["id"])[0]["id"]

    res = client.delete(f"/api/oil/movements/{move_id}")
    assert res.status_code == 400
    assert len(movements_for(client, harvest["id"])) == 1

    # cleanup through the proper route still works
    assert client.delete(f"/api/harvests/{harvest['id']}").status_code == 204


def test_press_kind_cannot_be_created_via_oil_api(client):
    res = client.post(
        "/api/oil/movements",
        json={"date": "2026-11-01", "kind": "press", "amount_kg": 10, "notes": ""},
    )
    assert res.status_code == 400


def test_out_kinds_are_stored_negative(client):
    before = balance(client)
    res = client.post(
        "/api/oil/movements",
        json={"date": "2026-11-02", "kind": "gift", "amount_kg": 5, "notes": "to Amto"},
    )
    assert res.status_code == 201
    move = res.json()
    assert move["amount_kg"] == -5
    assert balance(client) == before - 5

    assert client.delete(f"/api/oil/movements/{move['id']}").status_code == 204
    assert balance(client) == before
