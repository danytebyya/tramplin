from urllib.parse import parse_qs, urlparse
from uuid import UUID

from sqlalchemy import select

from src.core.security import decode_token
from src.enums import EmployerType, MembershipRole, UserRole
from src.models import Notification
from src.realtime.notification_hub import notification_hub
from src.tests.test_auth import _request_code
from src.tests.test_employer_verification_moderation import _create_verification_request, _register_curator
from src.models import Employer, EmployerMembership, EmployerProfile, User


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


def _create_company_for_owner(db_session, *, owner_email: str, company_name: str, inn: str) -> Employer:
    owner = db_session.execute(select(User).where(User.email == owner_email)).scalar_one()
    employer_profile = EmployerProfile(
        user_id=owner.id,
        employer_type=EmployerType.COMPANY,
        company_name=company_name,
        inn=inn,
        corporate_email=owner.email,
    )
    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name=company_name,
        legal_name=company_name,
        inn=inn,
        corporate_email=owner.email,
        created_by=owner.id,
        updated_by=owner.id,
    )
    db_session.add(employer_profile)
    db_session.add(employer)
    db_session.flush()
    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=owner.id,
            membership_role=MembershipRole.OWNER,
            is_primary=True,
        )
    )
    db_session.commit()
    return employer


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


def test_staff_employer_context_has_permission_specific_welcome_and_no_applicant_notifications(
    client,
    db_session,
    monkeypatch,
):
    owner_token = _register_and_login(client, db_session, email="notifications-owner@example.com", role="employer")
    _create_company_for_owner(
        db_session,
        owner_email="notifications-owner@example.com",
        company_name="Notifications Staff Corp",
        inn="7707083821",
    )
    staff_token = _register_and_login(client, db_session, email="notifications-staff@example.com", role="applicant")

    monkeypatch.setattr("src.services.employer_service.send_email", lambda recipient, subject, body: None)

    invite_response = client.post(
        "/api/v1/companies/staff/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"email": "notifications-staff@example.com", "permissions": ["view_responses", "access_chat"]},
    )
    invite_token = parse_qs(urlparse(invite_response.json()["data"]["invitation_url"]).query)["invite_token"][0]

    accept_response = client.post(
        "/api/v1/companies/staff/invitations/accept",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={"token": invite_token},
    )
    membership_id = accept_response.json()["data"]["id"]

    contexts_response = client.get(
        "/api/v1/auth/contexts",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    company_context = next(
        item
        for item in contexts_response.json()["data"]["items"]
        if item["role"] == UserRole.EMPLOYER.value and item["membership_id"] == membership_id
    )
    switch_response = client.post(
        "/api/v1/auth/context",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={"context_id": company_context["id"]},
    )
    employer_access_token = switch_response.json()["data"]["access_token"]

    employer_feed_response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {employer_access_token}"},
    )
    assert employer_feed_response.status_code == 200
    employer_titles = [item["title"] for item in employer_feed_response.json()["data"]["items"]]
    employer_messages = [item["message"] for item in employer_feed_response.json()["data"]["items"]]
    assert "Профиль создан" not in employer_titles
    assert any("Просмотр откликов" in message and "Общение в чате" in message for message in employer_messages)

    leave_response = client.delete(
        f"/api/v1/companies/staff/memberships/{membership_id}",
        headers={"Authorization": f"Bearer {employer_access_token}"},
    )
    assert leave_response.status_code == 200

    applicant_feed_response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert applicant_feed_response.status_code == 200
    applicant_titles = [item["title"] for item in applicant_feed_response.json()["data"]["items"]]
    assert "Профиль создан" in applicant_titles


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
        profile_scope={"profile_role": UserRole.EMPLOYER.value},
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
