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
    assert body["data"]["unread_count"] == 4
    assert len(body["data"]["items"]) == 4
    assert body["data"]["items"][0]["is_read"] is False
    assert body["data"]["items"][-1]["title"] == "Добро пожаловать в Трамплин!"


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
    assert response.json()["data"]["unread_count"] == 2

    persisted_notification = db_session.execute(
        select(Notification).where(Notification.id == UUID(notification_id))
    ).scalar_one()
    assert persisted_notification.is_read is True
    assert persisted_notification.read_at is not None


def test_clear_all_notifications(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notifications-all@example.com",
        role="employer",
    )

    response = client.request(
        "DELETE",
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["unread_count"] == 0

    notifications = db_session.execute(select(Notification)).scalars().all()
    assert len(notifications) == 1
    assert notifications[0].title == "__welcome_suppressed__"

    feed_response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert feed_response.status_code == 200
    assert feed_response.json()["data"]["unread_count"] == 0
    assert feed_response.json()["data"]["items"] == []


def test_list_notifications_backfills_welcome_for_existing_feed(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notifications-legacy@example.com",
        role="employer",
    )

    user_id = UUID(
        client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
        ).json()["data"]["user"]["id"]
    )
    db_session.query(Notification).filter(Notification.user_id == user_id).delete()
    db_session.commit()

    db_session.add(
        Notification(
            user_id=user_id,
            kind="system",
            severity="info",
            title="Легаси уведомление",
            message="Старое уведомление без welcome.",
        )
    )
    db_session.commit()

    response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200

    titles = [item["title"] for item in response.json()["data"]["items"]]
    assert "Добро пожаловать в Трамплин!" in titles
    assert "Легаси уведомление" in titles


def test_notifications_websocket_receives_push_event_on_new_notification(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notifications-websocket@example.com",
        role="employer",
    )

    with client.websocket_connect(f"/api/v1/notifications/stream?token={access_token}") as websocket:
        response = client.get(
            "/api/v1/notifications",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert response.status_code == 200

        event = websocket.receive_json()
        assert event["type"] == "notification_created"
