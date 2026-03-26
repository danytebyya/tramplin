from uuid import UUID

from sqlalchemy import select

from src.core.security import decode_token
from src.models import Notification
from src.realtime.notification_hub import notification_hub
from src.tests.test_auth import _request_code
from src.tests.test_employer_verification_moderation import _create_verification_request, _register_curator


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


def test_hide_notification_removes_it_from_feed(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notifications-hide@example.com",
        role="employer",
    )

    feed_response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    notification_id = feed_response.json()["data"]["items"][0]["id"]

    response = client.post(
        f"/api/v1/notifications/{notification_id}/hide",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200

    persisted_notification = db_session.execute(
        select(Notification).where(Notification.id == UUID(notification_id))
    ).scalar_one_or_none()
    assert persisted_notification is None

    updated_feed_response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    updated_ids = [item["id"] for item in updated_feed_response.json()["data"]["items"]]
    assert notification_id not in updated_ids


def test_hidden_notification_signature_prevents_recreation(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notifications-dismissed-marker@example.com",
        role="employer",
    )
    user_id = UUID(
        client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
        ).json()["data"]["user"]["id"]
    )

    feed_response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    notification = feed_response.json()["data"]["items"][0]

    hide_response = client.post(
        f"/api/v1/notifications/{notification['id']}/hide",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert hide_response.status_code == 200

    from src.enums.notifications import NotificationKind, NotificationSeverity
    from src.services.notification_service import NotificationService

    created = NotificationService(db_session).create_notification(
        user_id=user_id,
        kind=NotificationKind(notification["kind"]),
        severity=NotificationSeverity(notification["severity"]),
        title=notification["title"],
        message=notification["message"],
        action_label=notification.get("action_label"),
        action_url=notification.get("action_url"),
        payload=None,
    )
    db_session.commit()

    assert created is None


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


def test_notifications_websocket_disconnect_removes_connection(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notifications-websocket-disconnect@example.com",
        role="employer",
    )
    user_id = decode_token(access_token)["sub"]

    with client.websocket_connect(f"/api/v1/notifications/stream?token={access_token}") as websocket:
        assert len(notification_hub._connections[user_id]) == 1
        websocket.close()

    assert user_id not in notification_hub._connections


def test_notifications_websocket_receives_employer_verification_status_update_for_curator(client, db_session):
    curator_token = _register_curator(
        client,
        db_session,
        email="notifications-curator-verification-update@example.com",
    )
    request_id = _create_verification_request(
        client,
        db_session,
        email="notifications-employer-verification-update@example.com",
        company_name="Realtime Corp",
        inn="7707083898",
    )

    with client.websocket_connect(f"/api/v1/notifications/stream?token={curator_token}") as websocket:
        response = client.post(
            f"/api/v1/moderation/employer-verification-requests/{request_id}/approve",
            headers={"Authorization": f"Bearer {curator_token}"},
            json={"moderator_comment": "Одобрено для realtime"},
        )
        assert response.status_code == 200

        received_types: list[str] = []
        received_payloads: list[dict] = []
        while "moderation_employer_verification_updated" not in received_types:
            event = websocket.receive_json()
            received_types.append(event["type"])
            received_payloads.append(event)

        moderation_event = next(
            payload
            for payload in received_payloads
            if payload["type"] == "moderation_employer_verification_updated"
        )
        assert moderation_event["verification_request_id"] == request_id
        assert moderation_event["status"] == "approved"
