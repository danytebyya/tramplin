from sqlalchemy import select

from src.db.seeds import seed_demo_opportunities
from src.models import FavoriteOpportunity, Opportunity
from src.tests.test_notifications import _register_and_login


def test_favorite_opportunity_flow(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="favorites-applicant@example.com",
        role="applicant",
    )
    seed_demo_opportunities(db_session)
    opportunity = db_session.execute(select(Opportunity).limit(1)).scalar_one()

    add_response = client.post(
        f"/api/v1/favorites/opportunities/{opportunity.id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert add_response.status_code == 200
    assert add_response.json()["data"]["items"] == [str(opportunity.id)]

    list_response = client.get(
        "/api/v1/favorites/opportunities",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert list_response.status_code == 200
    assert list_response.json()["data"]["items"] == [str(opportunity.id)]

    persisted_favorite = db_session.execute(select(FavoriteOpportunity)).scalar_one_or_none()
    assert persisted_favorite is not None

    remove_response = client.request(
        "DELETE",
        f"/api/v1/favorites/opportunities/{opportunity.id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert remove_response.status_code == 200
    assert remove_response.json()["data"]["items"] == []

    persisted_favorites = db_session.execute(select(FavoriteOpportunity)).scalars().all()
    assert persisted_favorites == []


def test_add_favorite_requires_existing_public_opportunity(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="favorites-missing@example.com",
        role="applicant",
    )

    response = client.post(
        "/api/v1/favorites/opportunities/00000000-0000-0000-0000-000000000999",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "FAVORITE_OPPORTUNITY_NOT_FOUND"


def test_favorites_endpoint_requires_authentication(client):
    response = client.get("/api/v1/favorites/opportunities")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_UNAUTHORIZED"
