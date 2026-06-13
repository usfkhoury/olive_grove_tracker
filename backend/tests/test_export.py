"""Export endpoints: a CSV per entity plus a full JSON backup. Tests run
against the seeded test database, so they assert on structure and on counts
matching the live API rather than on exact seed values."""

import csv
import io


def parse_csv(text):
    return list(csv.reader(io.StringIO(text)))


def test_trees_csv_matches_api_count(client):
    res = client.get("/api/export/trees.csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]
    assert 'filename="trees.csv"' in res.headers["content-disposition"]

    rows = parse_csv(res.text)
    assert rows[0] == ["id", "label", "row", "col", "variety", "planted_year", "status", "notes"]
    data_rows = rows[1:]
    api_trees = client.get("/api/trees").json()
    assert len(data_rows) == len(api_trees)


def test_every_entity_csv_exports(client):
    expected_headers = {
        "trees": "id,label,row,col,variety,planted_year,status,notes",
        "activities": "id,date,type,trees,notes",
        "harvests": "id,date,olives_kg,oil_kg,tanake,yield_pct,notes",
        "oil": "id,date,kind,amount_kg,notes,harvest_id",
        "tasks": "id,name,start_month,end_month,notes",
    }
    for entity, header in expected_headers.items():
        res = client.get(f"/api/export/{entity}.csv")
        assert res.status_code == 200, entity
        assert res.text.splitlines()[0] == header, entity


def test_unknown_entity_is_404(client):
    assert client.get("/api/export/bogus.csv").status_code == 404


def test_all_json_backup_has_every_section(client):
    res = client.get("/api/export/all.json")
    assert res.status_code == 200
    data = res.json()
    for key in ("trees", "activities", "harvests", "oil_movements", "seasonal_tasks"):
        assert key in data, key
        assert isinstance(data[key], list)
    assert "exported_at" in data
    # Counts line up with the live endpoints.
    assert len(data["trees"]) == len(client.get("/api/trees").json())
    assert len(data["oil_movements"]) == len(client.get("/api/oil/movements").json())


def test_csv_reflects_a_new_harvest(client):
    before = len(parse_csv(client.get("/api/export/harvests.csv").text)) - 1
    created = client.post(
        "/api/harvests",
        json={"date": "2026-11-03", "olives_kg": 120, "oil_kg": 24, "notes": "export test"},
    )
    assert created.status_code == 201
    after_rows = parse_csv(client.get("/api/export/harvests.csv").text)[1:]
    assert len(after_rows) == before + 1
    # The new harvest's press movement shows up in the oil export too.
    oil_rows = parse_csv(client.get("/api/export/oil.csv").text)[1:]
    assert any(r[2] == "press" and r[5] == str(created.json()["id"]) for r in oil_rows)

    client.delete(f"/api/harvests/{created.json()['id']}")
