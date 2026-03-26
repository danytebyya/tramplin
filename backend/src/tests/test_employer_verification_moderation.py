from uuid import UUID

import pytest
from sqlalchemy import select

from src.enums import (
    EmployerVerificationRequestStatus,
    EmployerVerificationStatus,
    UserRole,
)
from src.models import EmployerProfile, EmployerVerificationRequest, Notification, User
from src.tests.test_company_verification import _register_and_login_employer


def _register_curator(client, db_session, *, email: str) -> str:
    from src.tests.test_notifications import _register_and_login

    access_token = _register_and_login(client, db_session, email=email, role="applicant")
    user = db_session.execute(select(User).where(User.email == email)).scalar_one()
    user.role = UserRole.CURATOR
    db_session.add(user)
    db_session.commit()
    return access_token


def _register_moderator(client, db_session, *, email: str, role: UserRole) -> str:
    from src.tests.test_notifications import _register_and_login

    access_token = _register_and_login(client, db_session, email=email, role="applicant")
    user = db_session.execute(select(User).where(User.email == email)).scalar_one()
    user.role = role
    db_session.add(user)
    db_session.commit()
    return access_token


def _create_verification_request(client, db_session, *, email: str, company_name: str, inn: str) -> str:
    access_token = _register_and_login_employer(client, db_session, email=email)

    profile_response = client.put(
        "/api/v1/companies/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "employer_type": "company",
            "company_name": company_name,
            "inn": inn,
            "corporate_email": f"hr@{company_name.lower().replace(' ', '-')}.example",
            "website": f"https://{company_name.lower().replace(' ', '-')}.example",
            "phone": "+7 (999) 111-22-33",
            "social_link": f"https://t.me/{company_name.lower().replace(' ', '-')}",
        },
    )
    assert profile_response.status_code == 200

    upload_response = client.post(
        "/api/v1/companies/verification-documents",
        headers={"Authorization": f"Bearer {access_token}"},
        data={
            "phone": "+7 (999) 111-22-33",
            "social_link": f"https://t.me/{company_name.lower().replace(' ', '-')}",
        },
        files=[
            ("files", ("registration.pdf", b"registration-document", "application/pdf")),
        ],
    )
    assert upload_response.status_code == 200

    verification_request = db_session.execute(
        select(EmployerVerificationRequest).where(EmployerVerificationRequest.inn == inn)
    ).scalar_one()
    return str(verification_request.id)


def test_list_employer_verification_requests_returns_pending_requests(client, db_session):
    curator_token = _register_curator(
        client,
        db_session,
        email="curator-verification-list@example.com",
    )
    _create_verification_request(
        client,
        db_session,
        email="employer-verification-list@example.com",
        company_name="Acme Labs",
        inn="7707083893",
    )

    response = client.get(
        "/api/v1/moderation/employer-verification-requests",
        headers={"Authorization": f"Bearer {curator_token}"},
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["total"] == 1
    assert body["items"][0]["employer_name"] == "Acme Labs"
    assert body["items"][0]["status"] == EmployerVerificationRequestStatus.PENDING.value
    assert body["items"][0]["phone"] == "+7 (999) 111-22-33"
    assert body["items"][0]["social_link"] == "https://t.me/acme-labs"
    assert body["items"][0]["documents"][0]["file_name"] == "registration.pdf"


def test_list_employer_verification_requests_is_available_for_junior(client, db_session):
    junior_token = _register_moderator(
        client,
        db_session,
        email="junior-verification-list@example.com",
        role=UserRole.JUNIOR,
    )
    _create_verification_request(
        client,
        db_session,
        email="employer-verification-junior@example.com",
        company_name="Junior Labs",
        inn="7707083894",
    )

    response = client.get(
        "/api/v1/moderation/employer-verification-requests",
        headers={"Authorization": f"Bearer {junior_token}"},
    )

    assert response.status_code == 200


def test_new_verification_request_creates_curator_notification(client, db_session):
    curator_email = "curator-verification-notify@example.com"
    curator_token = _register_curator(
        client,
        db_session,
        email=curator_email,
    )
    curator = db_session.execute(select(User).where(User.email == curator_email)).scalar_one()
    response = client.put(
        "/api/v1/users/me/notification-preferences",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={
            "email_notifications": {
                "new_verification_requests": False,
                "content_complaints": False,
                "overdue_reviews": False,
                "company_profile_changes": False,
                "publication_changes": False,
                "daily_digest": False,
                "weekly_report": False,
            },
            "push_notifications": {
                "new_verification_requests": True,
                "content_complaints": False,
                "overdue_reviews": False,
                "company_profile_changes": False,
                "publication_changes": False,
                "daily_digest": False,
                "weekly_report": False,
            },
        },
    )
    assert response.status_code == 200

    _create_verification_request(
        client,
        db_session,
        email="employer-verification-notify@example.com",
        company_name="Notify Corp",
        inn="7707083892",
    )

    notification = db_session.execute(
        select(Notification)
        .where(Notification.user_id == curator.id)
        .order_by(Notification.created_at.desc())
    ).scalars().first()

    assert notification is not None
    assert notification.title == "Новая заявка на верификацию"
    assert notification.action_url == "/moderation/employers"


def test_new_verification_request_sends_curator_email_when_enabled(client, db_session, monkeypatch):
    curator_email = "curator-verification-email@example.com"
    curator_token = _register_curator(
        client,
        db_session,
        email=curator_email,
    )
    response = client.put(
        "/api/v1/users/me/notification-preferences",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={
            "email_notifications": {
                "new_verification_requests": True,
                "content_complaints": False,
                "overdue_reviews": False,
                "company_profile_changes": False,
                "publication_changes": False,
                "daily_digest": False,
                "weekly_report": False,
            },
            "push_notifications": {
                "new_verification_requests": False,
                "content_complaints": False,
                "overdue_reviews": False,
                "company_profile_changes": False,
                "publication_changes": False,
                "daily_digest": False,
                "weekly_report": False,
            },
        },
    )
    assert response.status_code == 200

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_email(recipient: str, subject: str, body: str) -> None:
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("src.services.employer_service.send_email", fake_send_email)

    _create_verification_request(
        client,
        db_session,
        email="employer-verification-email-notify@example.com",
        company_name="Email Notify Corp",
        inn="7707083899",
    )

    assert len(sent_messages) == 1
    assert sent_messages[0][0] == curator_email
    assert sent_messages[0][1] == "Новая заявка на верификацию"
    assert "Email Notify Corp" in sent_messages[0][2]


def test_new_verification_request_does_not_notify_curator_when_pref_disabled(client, db_session):
    curator_email = "curator-verification-notify-disabled@example.com"
    curator_token = _register_curator(
        client,
        db_session,
        email=curator_email,
    )
    curator = db_session.execute(select(User).where(User.email == curator_email)).scalar_one()
    response = client.put(
        "/api/v1/users/me/notification-preferences",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={
            "email_notifications": {
                "new_verification_requests": False,
                "content_complaints": False,
                "overdue_reviews": False,
                "company_profile_changes": False,
                "publication_changes": False,
                "daily_digest": False,
                "weekly_report": False,
            },
            "push_notifications": {
                "new_verification_requests": False,
                "content_complaints": False,
                "overdue_reviews": False,
                "company_profile_changes": False,
                "publication_changes": False,
                "daily_digest": False,
                "weekly_report": False,
            },
        },
    )
    assert response.status_code == 200

    _create_verification_request(
        client,
        db_session,
        email="employer-verification-notify-disabled@example.com",
        company_name="Muted Notify Corp",
        inn="7707083890",
    )

    notification = db_session.execute(
        select(Notification)
        .where(
            Notification.user_id == curator.id,
            Notification.title == "Новая заявка на верификацию",
        )
        .order_by(Notification.created_at.desc())
    ).scalars().first()

    assert notification is None


def test_approve_employer_verification_request_updates_statuses(client, db_session):
    curator_token = _register_curator(
        client,
        db_session,
        email="curator-verification-approve@example.com",
    )
    request_id = _create_verification_request(
        client,
        db_session,
        email="employer-verification-approve@example.com",
        company_name="Approve Corp",
        inn="7707083894",
    )

    response = client.post(
        f"/api/v1/moderation/employer-verification-requests/{request_id}/approve",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={"moderator_comment": "Проверка завершена"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == EmployerVerificationRequestStatus.APPROVED.value

    verification_request = db_session.execute(
        select(EmployerVerificationRequest).where(EmployerVerificationRequest.id == UUID(request_id))
    ).scalar_one()
    employer_profile = db_session.execute(
        select(EmployerProfile).where(EmployerProfile.inn == "7707083894")
    ).scalar_one()
    notification = db_session.execute(
        select(Notification)
        .where(Notification.user_id == employer_profile.user_id)
        .order_by(Notification.created_at.desc())
    ).scalars().first()

    assert verification_request.status == EmployerVerificationRequestStatus.APPROVED
    assert verification_request.reviewed_at is not None
    assert employer_profile.verification_status == EmployerVerificationStatus.VERIFIED
    assert employer_profile.moderator_comment == "Проверка завершена"
    assert notification is not None
    assert notification.title == "Верификация одобрена"
    assert notification.action_url == "/dashboard/employer"
    assert notification.action_label == "Открыть дашборд"


def test_request_employer_verification_changes_marks_profile(client, db_session):
    curator_token = _register_curator(
        client,
        db_session,
        email="curator-verification-changes@example.com",
    )
    request_id = _create_verification_request(
        client,
        db_session,
        email="employer-verification-changes@example.com",
        company_name="Changes Corp",
        inn="7707083895",
    )

    response = client.post(
        f"/api/v1/moderation/employer-verification-requests/{request_id}/request-changes",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={"moderator_comment": "Нужен актуальный документ"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == EmployerVerificationRequestStatus.SUSPENDED.value

    employer_profile = db_session.execute(
        select(EmployerProfile).where(EmployerProfile.inn == "7707083895")
    ).scalar_one()
    assert employer_profile.verification_status == EmployerVerificationStatus.CHANGES_REQUESTED
    assert employer_profile.moderator_comment == "Нужен актуальный документ"

    notification = db_session.execute(
        select(Notification)
        .where(Notification.user_id == employer_profile.user_id)
        .order_by(Notification.created_at.desc())
    ).scalars().first()
    assert notification is not None
    assert notification.title == "Запрос дополнительной информации"
    assert notification.action_url == "/onboarding/employer?mode=changes-requested"
    assert notification.action_label == "Открыть заявку"


def test_reject_employer_verification_request_keeps_profile_unverified_and_notifies_employer(
    client,
    db_session,
):
    curator_token = _register_curator(
        client,
        db_session,
        email="curator-verification-reject@example.com",
    )
    request_id = _create_verification_request(
        client,
        db_session,
        email="employer-verification-reject@example.com",
        company_name="Reject Corp",
        inn="7707083897",
    )

    response = client.post(
        f"/api/v1/moderation/employer-verification-requests/{request_id}/reject",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={"moderator_comment": "Не совпадают реквизиты в документах"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == EmployerVerificationRequestStatus.REJECTED.value

    verification_request = db_session.execute(
        select(EmployerVerificationRequest).where(EmployerVerificationRequest.id == UUID(request_id))
    ).scalar_one()
    employer_profile = db_session.execute(
        select(EmployerProfile).where(EmployerProfile.inn == "7707083897")
    ).scalar_one()
    notification = db_session.execute(
        select(Notification)
        .where(Notification.user_id == employer_profile.user_id)
        .order_by(Notification.created_at.desc())
    ).scalars().first()

    assert verification_request.status == EmployerVerificationRequestStatus.REJECTED
    assert employer_profile.verification_status == EmployerVerificationStatus.UNVERIFIED
    assert employer_profile.moderator_comment == "Не совпадают реквизиты в документах"
    assert notification is not None
    assert notification.title == "Верификация отклонена"
    assert notification.action_url == "/onboarding/employer?mode=rejected"
    assert notification.action_label == "Исправить данные"


def test_reject_employer_verification_request_sends_email_to_employer(client, db_session, monkeypatch):
    curator_token = _register_curator(
        client,
        db_session,
        email="curator-verification-reject-email@example.com",
    )
    request_id = _create_verification_request(
        client,
        db_session,
        email="employer-verification-reject-email@example.com",
        company_name="Reject Email Corp",
        inn="7707083888",
    )

    sent_messages: list[tuple[str, str, str]] = []

    def fake_send_email(recipient: str, subject: str, body: str) -> None:
        sent_messages.append((recipient, subject, body))

    monkeypatch.setattr("src.services.moderation_service.send_email", fake_send_email)

    response = client.post(
        f"/api/v1/moderation/employer-verification-requests/{request_id}/reject",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={"moderator_comment": "Заявка отклонена"},
    )

    assert response.status_code == 200
    assert len(sent_messages) == 1
    assert sent_messages[0][0] == "employer-verification-reject-email@example.com"
    assert sent_messages[0][1] == "Трамплин: заявка на верификацию отклонена"
    assert "Reject Email Corp" in sent_messages[0][2]


def test_request_employer_verification_changes_uses_default_comment_when_empty(client, db_session):
    curator_token = _register_curator(
        client,
        db_session,
        email="curator-verification-default-comment@example.com",
    )
    request_id = _create_verification_request(
        client,
        db_session,
        email="employer-verification-default-comment@example.com",
        company_name="Default Comment Corp",
        inn="7707083891",
    )

    response = client.post(
        f"/api/v1/moderation/employer-verification-requests/{request_id}/request-changes",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={"moderator_comment": ""},
    )

    assert response.status_code == 200

    employer_profile = db_session.execute(
        select(EmployerProfile).where(EmployerProfile.inn == "7707083891")
    ).scalar_one()
    notification = db_session.execute(
        select(Notification)
        .where(Notification.user_id == employer_profile.user_id)
        .order_by(Notification.created_at.desc())
    ).scalars().first()

    expected_message = (
        "Требуется дополнить заявку: проверьте полноту заполнения данных, "
        "контактную информацию и приложенные документы."
    )
    assert employer_profile.moderator_comment == expected_message
    assert notification is not None
    assert notification.message == expected_message


def test_reject_employer_verification_request_uses_default_comment_when_empty(client, db_session):
    curator_token = _register_curator(
        client,
        db_session,
        email="curator-verification-reject-default@example.com",
    )
    request_id = _create_verification_request(
        client,
        db_session,
        email="employer-verification-reject-default@example.com",
        company_name="Reject Default Corp",
        inn="7707083892",
    )

    response = client.post(
        f"/api/v1/moderation/employer-verification-requests/{request_id}/reject",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={"moderator_comment": ""},
    )

    assert response.status_code == 200

    employer_profile = db_session.execute(
        select(EmployerProfile).where(EmployerProfile.inn == "7707083892")
    ).scalar_one()
    verification_request = db_session.execute(
        select(EmployerVerificationRequest).where(EmployerVerificationRequest.id == UUID(request_id))
    ).scalar_one()
    notification = db_session.execute(
        select(Notification)
        .where(Notification.user_id == employer_profile.user_id)
        .order_by(Notification.created_at.desc())
    ).scalars().first()

    expected_message = "Верификация отклонена. При необходимости вы можете отправить заявку повторно."
    assert employer_profile.moderator_comment == expected_message
    assert verification_request.rejection_reason == expected_message
    assert verification_request.moderator_comment == expected_message
    assert notification is not None
    assert notification.message == expected_message


def test_request_employer_verification_changes_keeps_status_when_email_delivery_fails(
    client,
    db_session,
    monkeypatch,
):
    curator_token = _register_curator(
        client,
        db_session,
        email="curator-verification-email-failure@example.com",
    )
    request_id = _create_verification_request(
        client,
        db_session,
        email="employer-verification-email-failure@example.com",
        company_name="Failure Corp",
        inn="7707083896",
    )

    attempts: list[int] = []

    def failing_send_email(*args, **kwargs):
        attempts.append(1)
        raise RuntimeError("smtp unavailable")

    monkeypatch.setattr("src.services.moderation_service.send_email", failing_send_email)

    response = client.post(
        f"/api/v1/moderation/employer-verification-requests/{request_id}/request-changes",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={"moderator_comment": "Нужен ещё один документ"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == EmployerVerificationRequestStatus.SUSPENDED.value
    assert len(attempts) == 5

    verification_request = db_session.execute(
        select(EmployerVerificationRequest).where(EmployerVerificationRequest.id == UUID(request_id))
    ).scalar_one()
    employer_profile = db_session.execute(
        select(EmployerProfile).where(EmployerProfile.inn == "7707083896")
    ).scalar_one()
    notification = db_session.execute(
        select(Notification)
        .where(Notification.user_id == employer_profile.user_id)
        .order_by(Notification.created_at.desc())
    ).scalars().first()

    assert verification_request.status == EmployerVerificationRequestStatus.SUSPENDED
    assert verification_request.reviewed_at is not None
    assert verification_request.moderator_comment == "Нужен ещё один документ"
    assert employer_profile.verification_status == EmployerVerificationStatus.CHANGES_REQUESTED
    assert notification is not None
    assert notification.title == "Запрос дополнительной информации"


def test_resubmitting_changed_employer_verification_returns_request_to_pending(client, db_session):
    curator_email = "curator-verification-resubmit@example.com"
    curator_token = _register_curator(
        client,
        db_session,
        email=curator_email,
    )
    curator = db_session.execute(select(User).where(User.email == curator_email)).scalar_one()
    response = client.put(
        "/api/v1/users/me/notification-preferences",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={
            "email_notifications": {
                "new_verification_requests": False,
                "content_complaints": False,
                "overdue_reviews": False,
                "company_profile_changes": False,
                "publication_changes": False,
                "daily_digest": False,
                "weekly_report": False,
            },
            "push_notifications": {
                "new_verification_requests": False,
                "content_complaints": False,
                "overdue_reviews": False,
                "company_profile_changes": True,
                "publication_changes": False,
                "daily_digest": False,
                "weekly_report": False,
            },
        },
    )
    assert response.status_code == 200

    employer_email = "employer-verification-resubmit@example.com"
    request_id = _create_verification_request(
        client,
        db_session,
        email=employer_email,
        company_name="Resubmit Corp",
        inn="7707083898",
    )

    request_changes_response = client.post(
        f"/api/v1/moderation/employer-verification-requests/{request_id}/request-changes",
        headers={"Authorization": f"Bearer {curator_token}"},
        json={"moderator_comment": "Добавьте недостающий документ"},
    )
    assert request_changes_response.status_code == 200

    employer_token = client.post(
        "/api/v1/auth/sessions",
        json={"email": employer_email, "password": "StrongPass123"},
    ).json()["data"]["access_token"]

    verification_request_before_resubmit = db_session.execute(
        select(EmployerVerificationRequest).where(EmployerVerificationRequest.id == UUID(request_id))
    ).scalar_one()
    initial_reviewed_at = verification_request_before_resubmit.reviewed_at
    assert initial_reviewed_at is not None

    resubmit_response = client.post(
        "/api/v1/companies/verification-documents",
        headers={"Authorization": f"Bearer {employer_token}"},
        files=[
            ("files", ("updated-registration.pdf", b"updated-registration-document", "application/pdf")),
        ],
        data={"verification_request_id": request_id},
    )

    assert resubmit_response.status_code == 200

    verification_request = db_session.execute(
        select(EmployerVerificationRequest).where(EmployerVerificationRequest.id == UUID(request_id))
    ).scalar_one()
    employer_profile = db_session.execute(
        select(EmployerProfile).where(EmployerProfile.inn == "7707083898")
    ).scalar_one()
    notification = db_session.execute(
        select(Notification)
        .where(
            Notification.user_id == curator.id,
            Notification.title == "Работодатель прислал обновлённые данные",
        )
        .order_by(Notification.created_at.desc())
    ).scalars().first()

    assert verification_request.status == EmployerVerificationRequestStatus.PENDING
    assert verification_request.reviewed_by is None
    assert verification_request.reviewed_at is None
    assert verification_request.rejection_reason is None
    assert verification_request.moderator_comment is None
    assert verification_request.submitted_at >= initial_reviewed_at
    assert employer_profile.verification_status == EmployerVerificationStatus.PENDING_REVIEW
    assert employer_profile.moderator_comment is None
    assert notification is not None
    assert notification.action_url == "/moderation/employers"
