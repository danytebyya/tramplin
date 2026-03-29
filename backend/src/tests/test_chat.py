from datetime import UTC, datetime

from src.core.security import create_access_token
from src.enums import EmployerType, MembershipRole, UserRole, UserStatus
from src.models import ApplicantProfile, Employer, EmployerMembership, User


def build_user(*, email: str, display_name: str, role: UserRole) -> User:
    return User(
        email=email,
        display_name=display_name,
        password_hash="hashed",
        role=role,
        status=UserStatus.ACTIVE,
    )


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

    list_response = client.get(
        f"/api/v1/chat/conversations/{conversation_id}/messages",
        headers={"Authorization": f"Bearer {employer_token}"},
    )
    assert list_response.status_code == 200
    assert list_response.json()["data"]["items"][0]["ciphertext"] == "ciphertext-payload"


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

    db_session.refresh(applicant)
    assert applicant.last_seen_at is not None

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
