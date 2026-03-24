from src.db.seeds import seed_demo_opportunities


def test_list_public_opportunities_returns_seeded_it_vacancies(client, db_session):
    seed_demo_opportunities(db_session)

    response = client.get("/api/v1/opportunities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    items = payload["data"]["items"]
    assert len(items) == 20
    assert items[0]["kind"] == "vacancy"
    assert items[0]["format"] in {"office", "hybrid", "remote"}
    assert items[0]["salary_label"].startswith("от ")
    assert len(items[0]["tags"]) == 3
