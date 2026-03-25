from uuid import UUID

from sqlalchemy import select

from src.models import Notification
from src.tests.test_auth import _request_code


def _register_and_login(client, db_session, *, email: str, role: str):
    code = _request_code(client, db_session, email)
    register_payload = {
        "email": email,
        "display_name": "Notifications User",
        "password": "StrongPass123",
        "verification_code": code,
        "role": role,
    }
    if role == "applicant":
        register_payload["applicant_profile"] = {"full_name": "Notifications User"}

    register_response = client.post("/api/v1/users", json=register_payload)
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": email, "password": "StrongPass123"},
    )
    assert login_response.status_code == 201
    return login_response.json()["data"]["access_token"]


def test_list_notifications_bootstraps_employer_feed(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notifications-employer@example.com",
        role="employer",
    )

    response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["unread_count"] == 3
    assert len(body["data"]["items"]) == 3
    assert body["data"]["items"][0]["is_read"] is False


def test_mark_notification_as_read_updates_unread_count(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notifications-applicant@example.com",
        role="applicant",
    )

    feed_response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    notification_id = feed_response.json()["data"]["items"][0]["id"]

    response = client.post(
        f"/api/v1/notifications/{notification_id}/read",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["unread_count"] == 1

    persisted_notification = db_session.execute(
        select(Notification).where(Notification.id == UUID(notification_id))
    ).scalar_one()
    assert persisted_notification.is_read is True
    assert persisted_notification.read_at is not None


def test_mark_all_notifications_as_read(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notifications-all@example.com",
        role="employer",
    )

    response = client.post(
        "/api/v1/notifications/read-all",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["unread_count"] == 0

    unread_notifications = db_session.execute(
        select(Notification).where(Notification.is_read.is_(False))
    ).scalars().all()
    assert unread_notifications == []
