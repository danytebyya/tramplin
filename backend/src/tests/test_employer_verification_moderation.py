from uuid import UUID

from sqlalchemy import select

from src.enums import (
    EmployerVerificationRequestStatus,
    EmployerVerificationStatus,
    UserRole,
)
from src.models import EmployerProfile, EmployerVerificationRequest, User
from src.tests.test_company_verification import _register_and_login_employer


def _register_curator(client, db_session, *, email: str) -> str:
    from src.tests.test_notifications import _register_and_login

    access_token = _register_and_login(client, db_session, email=email, role="applicant")
    user = db_session.execute(select(User).where(User.email == email)).scalar_one()
    user.role = UserRole.CURATOR
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
        },
    )
    assert profile_response.status_code == 200

    upload_response = client.post(
        "/api/v1/companies/verification-documents",
        headers={"Authorization": f"Bearer {access_token}"},
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
    assert body["items"][0]["documents"][0]["file_name"] == "registration.pdf"


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

    assert verification_request.status == EmployerVerificationRequestStatus.APPROVED
    assert verification_request.reviewed_at is not None
    assert employer_profile.verification_status == EmployerVerificationStatus.VERIFIED
    assert employer_profile.moderator_comment == "Проверка завершена"


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
