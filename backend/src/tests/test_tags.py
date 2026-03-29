from src.db.seeds import seed_demo_opportunities


def test_list_tag_catalog_returns_categories_and_children(client, db_session):
    seed_demo_opportunities(db_session)

    response = client.get("/api/v1/tags/catalog")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    items = payload["data"]["items"]
    assert len(items) >= 10
    assert any(item["name"] == "Языки программирования" for item in items)
    assert any(item["name"] == "Специализация" for item in items)
    assert any(item["name"] == "Soft skills" for item in items)
    assert any(item["name"] == "Языки" for item in items)
    assert all(item["items"] for item in items)
    assert any(tag["name"] == "Python" for item in items for tag in item["items"])
    assert any(tag["name"] == "React" for item in items for tag in item["items"])
    assert any(tag["name"] == "Коммуникабельность" for item in items for tag in item["items"])
    assert any(tag["name"] == "Английский B2" for item in items for tag in item["items"])
