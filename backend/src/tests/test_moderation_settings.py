from sqlalchemy import select

from src.enums import UserRole
from src.models import User
from src.tests.test_notifications import _register_and_login


def test_moderation_settings_returns_defaults_for_moderator(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="moderation-settings-defaults@example.com",
        role="applicant",
    )

    user = db_session.execute(
        select(User).where(User.email == "moderation-settings-defaults@example.com")
    ).scalar_one()
    user.role = UserRole.CURATOR
    db_session.add(user)
    db_session.commit()

    response = client.get(
        "/api/v1/moderation/settings",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == {
        "vacancy_review_hours": 24,
        "internship_review_hours": 24,
        "event_review_hours": 24,
        "mentorship_review_hours": 24,
    }


def test_moderation_settings_can_be_updated(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="moderation-settings-update@example.com",
        role="applicant",
    )

    user = db_session.execute(
        select(User).where(User.email == "moderation-settings-update@example.com")
    ).scalar_one()
    user.role = UserRole.ADMIN
    db_session.add(user)
    db_session.commit()

    payload = {
        "vacancy_review_hours": 12,
        "internship_review_hours": 36,
        "event_review_hours": 48,
        "mentorship_review_hours": 72,
    }

    response = client.put(
        "/api/v1/moderation/settings",
        json=payload,
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == payload


def test_moderation_settings_are_available_for_junior(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="moderation-settings-junior@example.com",
        role="applicant",
    )

    user = db_session.execute(
        select(User).where(User.email == "moderation-settings-junior@example.com")
    ).scalar_one()
    user.role = UserRole.JUNIOR
    db_session.add(user)
    db_session.commit()

    response = client.get(
        "/api/v1/moderation/settings",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
