from urllib.parse import parse_qs, urlparse

from sqlalchemy import select

from src.enums import EmployerType, MembershipRole, UserRole
from src.models import Employer, EmployerMembership, EmployerProfile, Notification, User
from src.tests.test_auth import _request_code


def _register_and_login(client, db_session, *, email: str, role: str) -> str:
    code = _request_code(client, db_session, email)
    payload = {
        "email": email,
        "display_name": "Staff User",
        "password": "StrongPass123",
        "verification_code": code,
        "role": role,
    }
    if role == "applicant":
        payload["applicant_profile"] = {"full_name": "Staff User"}

    register_response = client.post("/api/v1/users", json=payload)
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


def test_existing_user_can_accept_company_invitation_and_switch_context(client, db_session, monkeypatch):
    owner_token = _register_and_login(client, db_session, email="owner-context@example.com", role="employer")
    employer = _create_company_for_owner(
        db_session,
        owner_email="owner-context@example.com",
        company_name="Context Corp",
        inn="7707083811",
    )
    applicant_token = _register_and_login(
        client,
        db_session,
        email="applicant-context@example.com",
        role="applicant",
    )

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_email(recipient: str, subject: str, body: str) -> None:
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("src.services.employer_service.send_email", fake_send_email)

    invite_response = client.post(
        "/api/v1/companies/staff/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"email": "applicant-context@example.com", "role": "recruiter"},
    )
    assert invite_response.status_code == 201
    assert invite_response.json()["data"]["email"] == "applicant-context@example.com"
    assert invite_response.json()["data"]["email_sent"] is True
    assert invite_response.json()["data"]["invitation_url"]
    assert len(sent_messages) == 1
    assert "новый рабочий профиль компании" in sent_messages[0][2]

    invitation_url = sent_messages[0][2].split("Ссылка: ", maxsplit=1)[1].strip()
    invite_token = parse_qs(urlparse(invitation_url).query)["invite_token"][0]

    accept_response = client.post(
        "/api/v1/companies/staff/invitations/accept",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"token": invite_token},
    )
    assert accept_response.status_code == 200
    assert accept_response.json()["data"]["role"] == "recruiter"

    contexts_response = client.get(
        "/api/v1/auth/contexts",
        headers={"Authorization": f"Bearer {applicant_token}"},
    )
    assert contexts_response.status_code == 200
    items = contexts_response.json()["data"]["items"]
    assert len(items) == 2
    assert items[0]["role"] == UserRole.APPLICANT.value
    company_context = next(item for item in items if item["employer_id"] == str(employer.id))

    switch_response = client.post(
        "/api/v1/auth/context",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"context_id": company_context["id"]},
    )
    assert switch_response.status_code == 200
    assert switch_response.json()["data"]["active_context"]["role"] == UserRole.EMPLOYER.value


def test_staff_member_can_leave_company_membership(client, db_session, monkeypatch):
    owner_token = _register_and_login(client, db_session, email="owner-leave@example.com", role="employer")
    _create_company_for_owner(
        db_session,
        owner_email="owner-leave@example.com",
        company_name="Leave Corp",
        inn="7707083812",
    )
    applicant_token = _register_and_login(
        client,
        db_session,
        email="applicant-leave@example.com",
        role="applicant",
    )

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_email(recipient: str, subject: str, body: str) -> None:
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("src.services.employer_service.send_email", fake_send_email)

    client.post(
        "/api/v1/companies/staff/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"email": "applicant-leave@example.com", "role": "viewer"},
    )
    invitation_url = sent_messages[0][2].split("Ссылка: ", maxsplit=1)[1].strip()
    invite_token = parse_qs(urlparse(invitation_url).query)["invite_token"][0]

    accept_response = client.post(
        "/api/v1/companies/staff/invitations/accept",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"token": invite_token},
    )
    membership_id = accept_response.json()["data"]["id"]

    delete_response = client.delete(
        f"/api/v1/companies/staff/memberships/{membership_id}",
        headers={"Authorization": f"Bearer {applicant_token}"},
    )
    assert delete_response.status_code == 200

    contexts_response = client.get(
        "/api/v1/auth/contexts",
        headers={"Authorization": f"Bearer {applicant_token}"},
    )
    assert contexts_response.status_code == 200
    assert len(contexts_response.json()["data"]["items"]) == 1


def test_owner_can_create_link_only_invitation(client, db_session, monkeypatch):
    owner_token = _register_and_login(client, db_session, email="owner-link@example.com", role="employer")
    _create_company_for_owner(
        db_session,
        owner_email="owner-link@example.com",
        company_name="Link Corp",
        inn="7707083813",
    )

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_email(recipient: str, subject: str, body: str) -> None:
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("src.services.employer_service.send_email", fake_send_email)

    response = client.post(
        "/api/v1/companies/staff/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"role": "viewer"},
    )

    assert response.status_code == 201
    assert response.json()["data"]["email"] is None
    assert response.json()["data"]["email_sent"] is False
    assert response.json()["data"]["invitation_url"]
    assert sent_messages == []


def test_link_only_invitation_can_be_accepted_by_registered_applicant(client, db_session, monkeypatch):
    owner_token = _register_and_login(client, db_session, email="owner-link-accept@example.com", role="employer")
    _create_company_for_owner(
        db_session,
        owner_email="owner-link-accept@example.com",
        company_name="Shared Link Corp",
        inn="7707083814",
    )
    applicant_token = _register_and_login(
        client,
        db_session,
        email="candidate-link-accept@example.com",
        role="applicant",
    )

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_email(recipient: str, subject: str, body: str) -> None:
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("src.services.employer_service.send_email", fake_send_email)

    invite_response = client.post(
        "/api/v1/companies/staff/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"role": "manager"},
    )

    assert invite_response.status_code == 201
    invitation_url = invite_response.json()["data"]["invitation_url"]
    invite_token = parse_qs(urlparse(invitation_url).query)["invite_token"][0]

    accept_response = client.post(
        "/api/v1/companies/staff/invitations/accept",
        headers={"Authorization": f"Bearer {applicant_token}"},
        json={"token": invite_token},
    )

    assert accept_response.status_code == 200
    assert accept_response.json()["data"]["role"] == "manager"
    assert sent_messages == []


def test_invited_user_can_register_without_applicant_profile(client, db_session, monkeypatch):
    owner_token = _register_and_login(client, db_session, email="owner-register-invite@example.com", role="employer")
    _create_company_for_owner(
        db_session,
        owner_email="owner-register-invite@example.com",
        company_name="Invite Register Corp",
        inn="7707083815",
    )

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_email(recipient: str, subject: str, body: str) -> None:
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("src.services.employer_service.send_email", fake_send_email)

    invite_response = client.post(
        "/api/v1/companies/staff/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"email": "new-staff@example.com", "role": "recruiter"},
    )
    assert invite_response.status_code == 201
    invite_token = parse_qs(urlparse(invite_response.json()["data"]["invitation_url"]).query)["invite_token"][0]

    code = _request_code(client, db_session, "new-staff@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "new-staff@example.com",
            "display_name": "New Staff",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "company_invite_token": invite_token,
        },
    )

    assert register_response.status_code == 201
    assert register_response.json()["data"]["user"]["role"] == "applicant"
    assert register_response.json()["data"]["user"]["applicant_profile"] is None


def test_owner_can_invite_staff_with_explicit_permissions(client, db_session, monkeypatch):
    owner_token = _register_and_login(client, db_session, email="owner-permissions@example.com", role="employer")
    _create_company_for_owner(
        db_session,
        owner_email="owner-permissions@example.com",
        company_name="Permissions Corp",
        inn="7707083816",
    )

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_email(recipient: str, subject: str, body: str) -> None:
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("src.services.employer_service.send_email", fake_send_email)

    response = client.post(
        "/api/v1/companies/staff/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "email": "permissions-staff@example.com",
            "permissions": [
                "view_responses",
                "manage_opportunities",
                "access_chat",
            ],
        },
    )

    assert response.status_code == 201
    assert response.json()["data"]["role"] == "recruiter"
    assert response.json()["data"]["permissions"] == [
        "view_responses",
        "manage_opportunities",
        "access_chat",
    ]


def test_leave_company_creates_applicant_profile_and_notifies_owner(client, db_session, monkeypatch):
    owner_token = _register_and_login(client, db_session, email="owner-notify@example.com", role="employer")
    _create_company_for_owner(
        db_session,
        owner_email="owner-notify@example.com",
        company_name="Notify Corp",
        inn="7707083817",
    )

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_email(recipient: str, subject: str, body: str) -> None:
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("src.services.employer_service.send_email", fake_send_email)

    invite_response = client.post(
        "/api/v1/companies/staff/invitations",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "email": "leave-notify@example.com",
            "permissions": ["view_responses"],
        },
    )
    invite_token = parse_qs(urlparse(invite_response.json()["data"]["invitation_url"]).query)["invite_token"][0]

    code = _request_code(client, db_session, "leave-notify@example.com")
    client.post(
        "/api/v1/users",
        json={
            "email": "leave-notify@example.com",
            "display_name": "Leave Notify",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "company_invite_token": invite_token,
        },
    )
    staff_token = client.post(
        "/api/v1/auth/sessions",
        json={"email": "leave-notify@example.com", "password": "StrongPass123"},
    ).json()["data"]["access_token"]
    accept_response = client.post(
        "/api/v1/companies/staff/invitations/accept",
        headers={"Authorization": f"Bearer {staff_token}"},
        json={"token": invite_token},
    )

    membership_id = accept_response.json()["data"]["id"]
    leave_response = client.delete(
        f"/api/v1/companies/staff/memberships/{membership_id}",
        headers={"Authorization": f"Bearer {staff_token}"},
    )

    assert leave_response.status_code == 200
    staff_user = db_session.execute(select(User).where(User.email == "leave-notify@example.com")).scalar_one()
    assert staff_user.applicant_profile is not None

    owner_user = db_session.execute(select(User).where(User.email == "owner-notify@example.com")).scalar_one()
    notifications = db_session.execute(select(Notification).where(Notification.user_id == owner_user.id)).scalars().all()
    assert any(item.title == "Сотрудник покинул компанию" for item in notifications)
