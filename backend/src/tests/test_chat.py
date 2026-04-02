from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from src.core.security import create_access_token
from src.enums import EmployerType, MembershipRole, UserRole, UserStatus
from src.enums.notifications import NotificationKind
from src.models import ApplicantProfile, ChatUserKey, Employer, EmployerMembership, Notification, User
from src.services.chat_reminder_service import ChatReminderService


def build_user(*, email: str, display_name: str, role: UserRole) -> User:
    return User(
        email=email,
        display_name=display_name,
        password_hash="hashed",
        role=role,
        status=UserStatus.ACTIVE,
    )


def _create_chat_participants(
    db_session,
    *,
    applicant_email: str,
    employer_email: str,
    company_name: str,
    inn: str,
):
    applicant = build_user(
        email=applicant_email,
        display_name="Applicant User",
        role=UserRole.APPLICANT,
    )
    applicant.applicant_profile = ApplicantProfile(full_name="Мария Петрова")
    employer_user = build_user(
        email=employer_email,
        display_name="Recruiter User",
        role=UserRole.EMPLOYER,
    )
    db_session.add_all([applicant, employer_user])
    db_session.flush()

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name=company_name,
        legal_name=f"{company_name} LLC",
        inn=inn,
        created_by=employer_user.id,
    )
    db_session.add(employer)
    db_session.flush()
    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=employer_user.id,
            membership_role=MembershipRole.OWNER,
            permissions=["access_chat"],
            is_primary=True,
        )
    )
    db_session.commit()

    applicant_token, _ = create_access_token(
        subject=str(applicant.id),
        role=applicant.role.value,
        active_role=applicant.role.value,
    )
    employer_token, _ = create_access_token(
        subject=str(employer_user.id),
        role=employer_user.role.value,
        active_role=employer_user.role.value,
        active_employer_id=str(employer.id),
        active_permissions=["access_chat"],
    )

    return applicant, employer_user, employer, applicant_token, employer_token


def test_applicant_can_create_conversation_and_exchange_messages(client, db_session):
    applicant = build_user(
        email="chat-applicant@example.com",
        display_name="Applicant User",
        role=UserRole.APPLICANT,
    )
    applicant.applicant_profile = ApplicantProfile(full_name="Мария Петрова")
    employer_user = build_user(
        email="chat-employer@example.com",
        display_name="Recruiter User",
        role=UserRole.EMPLOYER,
    )
    db_session.add_all([applicant, employer_user])
    db_session.flush()

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Tramplin",
        legal_name="Tramplin LLC",
        inn="1234567890",
        created_by=employer_user.id,
    )
    db_session.add(employer)
    db_session.flush()
    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=employer_user.id,
            membership_role=MembershipRole.OWNER,
            permissions=["access_chat"],
            is_primary=True,
        )
    )
    db_session.commit()

    applicant_token, _ = create_access_token(
        subject=str(applicant.id),
        role=applicant.role.value,
        active_role=applicant.role.value,
    )
    employer_token, _ = create_access_token(
        subject=str(employer_user.id),
        role=employer_user.role.value,
        active_role=employer_user.role.value,
        active_employer_id=str(employer.id),
        active_permissions=["access_chat"],
    )

    create_response = client.post(
        "/api/v1/chat/conversations",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"recipient_user_id": str(employer_user.id), "employer_id": str(employer.id)},
    )
    assert create_response.status_code == 200
    conversation_id = create_response.json()["data"]["conversation"]["id"]

    send_response = client.post(
        "/api/v1/chat/messages",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={
            "conversation_id": conversation_id,
            "ciphertext": "ciphertext-payload",
            "iv": "iv-payload-123",
            "salt": "salt-payload-123",
        },
    )
    assert send_response.status_code == 200
    assert send_response.json()["data"]["ciphertext"] == "ciphertext-payload"
    assert send_response.json()["data"]["sender_public_key_jwk"] is None
    assert send_response.json()["data"]["recipient_public_key_jwk"] is None

    list_response = client.get(
        f"/api/v1/chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {employer_token}"},
    )
    assert list_response.status_code == 200
    assert list_response.json()["data"]["items"][0]["ciphertext"] == "ciphertext-payload"


def test_chat_message_snapshots_sender_and_recipient_keys(client, db_session):
    applicant, employer_user, employer, applicant_token, employer_token = _create_chat_participants(
        db_session,
        applicant_email="chat-keys-applicant@example.com",
        employer_email="chat-keys-employer@example.com",
        company_name="Key Snapshot Corp",
        inn="5555555555",
    )
    applicant_key = {"kty": "EC", "crv": "P-256", "x": "applicant-x", "y": "applicant-y"}
    employer_key = {"kty": "EC", "crv": "P-256", "x": "employer-x", "y": "employer-y"}
    db_session.add_all(
        [
          ChatUserKey(user_id=applicant.id, algorithm="ECDH_P256", public_key_jwk=applicant_key, private_key_jwk=None),
          ChatUserKey(user_id=employer_user.id, algorithm="ECDH_P256", public_key_jwk=employer_key, private_key_jwk=None),
        ]
    )
    db_session.commit()

    create_response = client.post(
        "/api/v1/chat/conversations",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"recipient_user_id": str(employer_user.id), "employer_id": str(employer.id)},
    )
    conversation_id = create_response.json()["data"]["conversation"]["id"]

    send_response = client.post(
        "/api/v1/chat/messages",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={
            "conversation_id": conversation_id,
            "ciphertext": "ciphertext-payload",
            "iv": "iv-payload-123",
            "salt": "salt-payload-123",
        },
    )

    assert send_response.status_code == 200
    body = send_response.json()["data"]
    assert body["sender_public_key_jwk"] == applicant_key
    assert body["recipient_public_key_jwk"] == employer_key

    list_response = client.get(
        f"/api/v1/chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {employer_token}"},
    )
    assert list_response.status_code == 200
    assert list_response.json()["data"]["items"][0]["sender_public_key_jwk"] == applicant_key
    assert list_response.json()["data"]["items"][0]["recipient_public_key_jwk"] == employer_key


def test_chat_websocket_receives_new_message_event(client, db_session):
    applicant = build_user(
        email="chat-stream-applicant@example.com",
        display_name="Applicant Stream",
        role=UserRole.APPLICANT,
    )
    employer_user = build_user(
        email="chat-stream-employer@example.com",
        display_name="Employer Stream",
        role=UserRole.EMPLOYER,
    )
    db_session.add_all([applicant, employer_user])
    db_session.flush()

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Stream Corp",
        legal_name="Stream Corp LLC",
        inn="0987654321",
        created_by=employer_user.id,
    )
    db_session.add(employer)
    db_session.flush()
    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=employer_user.id,
            membership_role=MembershipRole.OWNER,
            permissions=["access_chat"],
            is_primary=True,
        )
    )
    db_session.commit()

    applicant_token, _ = create_access_token(
        subject=str(applicant.id),
        role=applicant.role.value,
        active_role=applicant.role.value,
    )
    employer_token, _ = create_access_token(
        subject=str(employer_user.id),
        role=employer_user.role.value,
        active_role=employer_user.role.value,
        active_employer_id=str(employer.id),
        active_permissions=["access_chat"],
    )

    create_response = client.post(
        "/api/v1/chat/conversations",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"recipient_user_id": str(employer_user.id), "employer_id": str(employer.id)},
    )
    conversation_id = create_response.json()["data"]["conversation"]["id"]

    with client.websocket_connect(f"/api/v1/chat/stream?token={employer_token}") as websocket:
        send_response = client.post(
            "/api/v1/chat/messages",
            headers={"Authorization": f"Bearer {applicant_token}"},
            json={
                "conversation_id": conversation_id,
                "ciphertext": "ws-ciphertext",
                "iv": "iv-ws-payload",
                "salt": "salt-ws-payload",
            },
        )
        assert send_response.status_code == 200

        event = websocket.receive_json()
        assert event["type"] == "chat_message_created"
        assert event["message"]["ciphertext"] == "ws-ciphertext"


def test_presence_websocket_updates_me_status_and_last_seen(client, db_session):
    applicant = build_user(
        email="presence-applicant@example.com",
        display_name="Presence Applicant",
        role=UserRole.APPLICANT,
    )
    db_session.add(applicant)
    db_session.commit()

    access_token, _ = create_access_token(
        subject=str(applicant.id),
        role=applicant.role.value,
        active_role=applicant.role.value,
    )

    with client.websocket_connect(f"/api/v1/presence/stream?token={access_token}") as websocket:
        event = websocket.receive_json()
        assert event["type"] == "presence_updated"
        assert event["user_id"] == str(applicant.id)
        assert event["is_online"] is True

        me_response = client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert me_response.status_code == 200
        assert me_response.json()["data"]["user"]["presence"]["is_online"] is True

    me_response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["data"]["user"]["presence"]["is_online"] is False
    assert me_response.json()["data"]["user"]["presence"]["last_seen_at"] is not None


def test_chat_contacts_include_last_seen_status(client, db_session):
    applicant = build_user(
        email="presence-list-applicant@example.com",
        display_name="Applicant Presence",
        role=UserRole.APPLICANT,
    )
    employer_user = build_user(
        email="presence-list-employer@example.com",
        display_name="Employer Presence",
        role=UserRole.EMPLOYER,
    )
    employer_user.last_seen_at = datetime(2026, 3, 28, 18, 0, tzinfo=UTC)
    db_session.add_all([applicant, employer_user])
    db_session.flush()

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Presence Corp",
        legal_name="Presence Corp LLC",
        inn="1029384756",
        created_by=employer_user.id,
    )
    db_session.add(employer)
    db_session.flush()
    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=employer_user.id,
            membership_role=MembershipRole.OWNER,
            permissions=["access_chat"],
            is_primary=True,
        )
    )
    db_session.commit()

    applicant_token, _ = create_access_token(
        subject=str(applicant.id),
        role=applicant.role.value,
        active_role=applicant.role.value,
    )

    contacts_response = client.get(
        "/api/v1/chat/search?employer_id=" + str(employer.id),
        headers={"Authorization": f"Bearer {applicant_token}"},
    )
    assert contacts_response.status_code == 200

    contact = contacts_response.json()["data"]["items"][0]
    assert contact["is_online"] is False
    assert contact["last_seen_at"] == "2026-03-28T18:00:00+00:00"


def test_empty_conversation_is_hidden_from_conversation_list(client, db_session):
    applicant = build_user(
        email="hidden-applicant@example.com",
        display_name="Hidden Applicant",
        role=UserRole.APPLICANT,
    )
    employer_user = build_user(
        email="hidden-employer@example.com",
        display_name="Hidden Employer",
        role=UserRole.EMPLOYER,
    )
    db_session.add_all([applicant, employer_user])
    db_session.flush()

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Hidden Corp",
        legal_name="Hidden Corp LLC",
        inn="1231231231",
        created_by=employer_user.id,
    )
    db_session.add(employer)
    db_session.flush()
    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=employer_user.id,
            membership_role=MembershipRole.OWNER,
            permissions=["access_chat"],
            is_primary=True,
        )
    )
    db_session.commit()

    applicant_token, _ = create_access_token(
        subject=str(applicant.id),
        role=applicant.role.value,
        active_role=applicant.role.value,
    )

    create_response = client.post(
        "/api/v1/chat/conversations",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"recipient_user_id": str(employer_user.id), "employer_id": str(employer.id)},
    )
    assert create_response.status_code == 200

    conversations_response = client.get(
        "/api/v1/chat/conversations",
        headers={"Authorization": f"Bearer {applicant_token}"},
    )
    assert conversations_response.status_code == 200
    assert conversations_response.json()["data"]["items"] == []


def test_applicant_can_search_other_applicants(client, db_session):
    first_applicant = build_user(
        email="search-first@example.com",
        display_name="First Search Applicant",
        role=UserRole.APPLICANT,
    )
    second_applicant = build_user(
        email="search-second@example.com",
        display_name="Second Search Applicant",
        role=UserRole.APPLICANT,
    )
    second_applicant.applicant_profile = ApplicantProfile(full_name="Анна Поиск")
    db_session.add_all([first_applicant, second_applicant])
    db_session.commit()

    first_token, _ = create_access_token(
        subject=str(first_applicant.id),
        role=first_applicant.role.value,
        active_role=first_applicant.role.value,
    )

    search_response = client.get(
        "/api/v1/chat/search?q=second",
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert search_response.status_code == 200
    items = search_response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["user_id"] == str(second_applicant.id)
    assert items[0]["role"] == UserRole.APPLICANT.value


def test_applicant_can_search_other_applicants_by_public_id(client, db_session):
    first_applicant = build_user(
        email="search-id-first@example.com",
        display_name="First Search Applicant",
        role=UserRole.APPLICANT,
    )
    second_applicant = build_user(
        email="search-id-second@example.com",
        display_name="Second Search Applicant",
        role=UserRole.APPLICANT,
    )
    db_session.add_all([first_applicant, second_applicant])
    db_session.commit()

    first_token, _ = create_access_token(
        subject=str(first_applicant.id),
        role=first_applicant.role.value,
        active_role=first_applicant.role.value,
    )

    search_response = client.get(
        f"/api/v1/chat/search?q={second_applicant.public_id}",
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert search_response.status_code == 200
    items = search_response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["user_id"] == str(second_applicant.id)
    assert items[0]["public_id"] == second_applicant.public_id


def test_applicant_can_edit_and_delete_own_message(client, db_session):
    applicant = build_user(
        email="chat-edit-applicant@example.com",
        display_name="Applicant Editor",
        role=UserRole.APPLICANT,
    )
    employer_user = build_user(
        email="chat-edit-employer@example.com",
        display_name="Employer Editor",
        role=UserRole.EMPLOYER,
    )
    db_session.add_all([applicant, employer_user])
    db_session.flush()

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Edit Corp",
        legal_name="Edit Corp LLC",
        inn="1002003004",
        created_by=employer_user.id,
    )
    db_session.add(employer)
    db_session.flush()
    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=employer_user.id,
            membership_role=MembershipRole.OWNER,
            permissions=["access_chat"],
            is_primary=True,
        )
    )
    db_session.commit()

    applicant_token, _ = create_access_token(
        subject=str(applicant.id),
        role=applicant.role.value,
        active_role=applicant.role.value,
    )
    employer_token, _ = create_access_token(
        subject=str(employer_user.id),
        role=employer_user.role.value,
        active_role=employer_user.role.value,
        active_employer_id=str(employer.id),
        active_permissions=["access_chat"],
    )

    create_response = client.post(
        "/api/v1/chat/conversations",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"recipient_user_id": str(employer_user.id), "employer_id": str(employer.id)},
    )
    conversation_id = create_response.json()["data"]["conversation"]["id"]

    send_response = client.post(
        "/api/v1/chat/messages",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={
            "conversation_id": conversation_id,
            "ciphertext": "original-ciphertext",
            "iv": "original-iv-123",
            "salt": "original-salt-123",
        },
    )
    assert send_response.status_code == 200
    message_id = send_response.json()["data"]["id"]

    update_response = client.put(
        f"/api/v1/chat/messages/{message_id}",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={
            "ciphertext": "edited-ciphertext",
            "iv": "edited-iv-12345",
            "salt": "edited-salt-12345",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["ciphertext"] == "edited-ciphertext"

    list_after_update = client.get(
        f"/api/v1/chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {employer_token}"},
    )
    assert list_after_update.status_code == 200
    assert list_after_update.json()["data"]["items"][0]["ciphertext"] == "edited-ciphertext"

    delete_response = client.delete(
        f"/api/v1/chat/messages/{message_id}",
        headers={"Authorization": f"Bearer {applicant_token}"},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["id"] == message_id

    list_after_delete = client.get(
        f"/api/v1/chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {employer_token}"},
    )
    assert list_after_delete.status_code == 200
    assert list_after_delete.json()["data"]["items"] == []


def test_chat_unread_reminder_creates_single_email_and_site_notification(client, db_session, monkeypatch):
    _, employer_user, employer, applicant_token, _ = _create_chat_participants(
        db_session,
        applicant_email="chat-reminder-applicant@example.com",
        employer_email="chat-reminder-employer@example.com",
        company_name="Reminder Corp",
        inn="3213213213",
    )

    sent_emails: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "src.services.chat_reminder_service.send_email",
        lambda recipient, subject, body: sent_emails.append((recipient, subject, body)),
    )

    create_response = client.post(
        "/api/v1/chat/conversations",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"recipient_user_id": str(employer_user.id), "employer_id": str(employer.id)},
    )
    assert create_response.status_code == 200
    conversation_id = create_response.json()["data"]["conversation"]["id"]

    send_response = client.post(
        "/api/v1/chat/messages",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={
            "conversation_id": conversation_id,
            "ciphertext": "reminder-ciphertext",
            "iv": "reminder-iv",
            "salt": "reminder-salt",
        },
    )
    assert send_response.status_code == 200
    created_at = datetime.fromisoformat(send_response.json()["data"]["created_at"])

    service = ChatReminderService(db_session)
    processed_count = service.process_due_reminders(now=created_at + timedelta(minutes=11))
    assert processed_count == 1

    notifications = db_session.execute(
        select(Notification).where(Notification.kind == NotificationKind.CHAT)
    ).scalars().all()
    assert len(notifications) == 1
    assert notifications[0].user_id == employer_user.id
    assert len(sent_emails) == 1
    assert sent_emails[0][0] == "chat-reminder-employer@example.com"

    processed_again = service.process_due_reminders(now=created_at + timedelta(days=2))
    assert processed_again == 0
    notifications = db_session.execute(
        select(Notification).where(Notification.kind == NotificationKind.CHAT)
    ).scalars().all()
    assert len(notifications) == 1
    assert len(sent_emails) == 1

    message_id = send_response.json()["data"]["id"]
    update_response = client.put(
        f"/api/v1/chat/messages/{message_id}",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={
            "ciphertext": "updated-ciphertext",
            "iv": "updated-iv",
            "salt": "updated-salt",
        },
    )
    assert update_response.status_code == 200

    processed_after_update = service.process_due_reminders(now=created_at + timedelta(days=3))
    assert processed_after_update == 0
    assert len(sent_emails) == 1


def test_chat_unread_reminder_repeats_only_after_new_messages_and_one_day_cooldown(client, db_session, monkeypatch):
    _, employer_user, employer, applicant_token, _ = _create_chat_participants(
        db_session,
        applicant_email="chat-reminder-repeat-applicant@example.com",
        employer_email="chat-reminder-repeat-employer@example.com",
        company_name="Repeat Corp",
        inn="4564564564",
    )

    sent_emails: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "src.services.chat_reminder_service.send_email",
        lambda recipient, subject, body: sent_emails.append((recipient, subject, body)),
    )

    create_response = client.post(
        "/api/v1/chat/conversations",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"recipient_user_id": str(employer_user.id), "employer_id": str(employer.id)},
    )
    assert create_response.status_code == 200
    conversation_id = create_response.json()["data"]["conversation"]["id"]

    first_send_response = client.post(
        "/api/v1/chat/messages",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={
            "conversation_id": conversation_id,
            "ciphertext": "first-reminder-ciphertext",
            "iv": "first-reminder-iv",
            "salt": "first-reminder-salt",
        },
    )
    assert first_send_response.status_code == 200
    first_created_at = datetime.fromisoformat(first_send_response.json()["data"]["created_at"])

    service = ChatReminderService(db_session)
    assert service.process_due_reminders(now=first_created_at + timedelta(minutes=11)) == 1

    second_send_response = client.post(
        "/api/v1/chat/messages",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={
            "conversation_id": conversation_id,
            "ciphertext": "second-reminder-ciphertext",
            "iv": "second-reminder-iv",
            "salt": "second-reminder-salt",
        },
    )
    assert second_send_response.status_code == 200
    second_created_at = datetime.fromisoformat(second_send_response.json()["data"]["created_at"])

    assert service.process_due_reminders(now=second_created_at + timedelta(minutes=11)) == 0

    second_processed_at = first_created_at + timedelta(days=1, minutes=12)
    assert service.process_due_reminders(now=second_processed_at) == 1

    notifications = db_session.execute(
        select(Notification).where(Notification.kind == NotificationKind.CHAT)
    ).scalars().all()
    assert len(notifications) == 2
    assert len(sent_emails) == 2
