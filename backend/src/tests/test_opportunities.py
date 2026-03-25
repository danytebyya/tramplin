from src.db.seeds import seed_demo_opportunities


def test_list_public_opportunities_returns_seeded_it_feed(client, db_session):
    seed_demo_opportunities(db_session)

    response = client.get("/api/v1/opportunities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    items = payload["data"]["items"]
    assert len(items) == 35
    assert {item["kind"] for item in items} == {"vacancy", "internship", "event", "mentorship"}
    assert {item["format"] for item in items}.issubset({"office", "hybrid", "remote"})
    assert any(item["salary_label"].startswith("от ") for item in items)
    assert all(item["location_label"].startswith("Чебоксары") for item in items)
    assert any(item["format"] == "remote" for item in items)
    assert any(item["format"] == "hybrid" for item in items)
    assert any(item["format"] == "office" for item in items)
