from datetime import UTC, datetime

from src.core.security import hash_password
from src.enums import EmployerType, EmployerVerificationRequestStatus, MembershipRole, UserRole, UserStatus
from src.models import Application, Employer, EmployerMembership, EmployerProfile, Opportunity, User
from src.models.opportunity import ModerationStatus, OpportunityStatus, OpportunityType, WorkFormat
from src.tests.test_moderation_dashboard import _login


def _create_applicant_user(db_session, *, email: str) -> User:
    user = User(
        email=email,
        display_name="Applicant",
        password_hash=hash_password("ApplicantPass123"),
        role=UserRole.APPLICANT,
        status=UserStatus.ACTIVE,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _create_employer_user(db_session, *, email: str, inn: str) -> User:
    user = User(
        email=email,
        display_name="Employer",
        password_hash=hash_password("EmployerPass123"),
        role=UserRole.EMPLOYER,
        status=UserStatus.ACTIVE,
        employer_profile=EmployerProfile(
            employer_type=EmployerType.COMPANY,
            company_name="ООО Тестовая компания",
            inn=inn,
            corporate_email=email,
        ),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="ООО Тестовая компания",
        legal_name="ООО Тестовая компания",
        inn=inn,
        corporate_email=email,
        verification_status=EmployerVerificationRequestStatus.APPROVED,
        verified_at=datetime.now(UTC),
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(employer)
    db_session.commit()
    db_session.refresh(employer)

    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=user.id,
            membership_role=MembershipRole.OWNER,
            permissions=[
                "view_responses",
                "manage_opportunities",
                "manage_company_profile",
                "manage_staff",
                "access_chat",
            ],
            is_primary=True,
        )
    )
    db_session.commit()

    opportunity = Opportunity(
        employer_id=employer.id,
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
        title="Backend Internship",
        short_description="Backend internship short description",
        description="Backend internship full description for applicants.",
        opportunity_type=OpportunityType.INTERNSHIP,
        business_status=OpportunityStatus.ACTIVE,
        moderation_status=ModerationStatus.APPROVED,
        work_format=WorkFormat.REMOTE,
        contact_email=user.email,
        published_at=datetime.now(UTC),
    )
    db_session.add(opportunity)
    db_session.commit()
    db_session.refresh(opportunity)
    user._test_opportunity_id = str(opportunity.id)  # type: ignore[attr-defined]
    return user


def test_applicant_can_submit_application(client, db_session):
    employer = _create_employer_user(db_session, email="applications-employer@example.com", inn="7707083910")
    applicant = _create_applicant_user(db_session, email="applications-applicant@example.com")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )

    assert response.status_code == 201
    body = response.json()["data"]
    assert body["opportunity_id"] == employer._test_opportunity_id  # type: ignore[attr-defined]
    assert body["status"] == "submitted"
    assert db_session.query(Application).count() == 1


def test_applicant_cannot_submit_duplicate_application(client, db_session):
    employer = _create_employer_user(db_session, email="duplicate-employer@example.com", inn="7707083911")
    applicant = _create_applicant_user(db_session, email="duplicate-applicant@example.com")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    first_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert first_response.status_code == 201

    second_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )

    assert second_response.status_code == 409
    assert second_response.json()["error"]["code"] == "APPLICATION_ALREADY_EXISTS"


def test_applicant_can_withdraw_application(client, db_session):
    employer = _create_employer_user(db_session, email="withdraw-employer@example.com", inn="7707083913")
    applicant = _create_applicant_user(db_session, email="withdraw-applicant@example.com")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    submit_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert submit_response.status_code == 201

    withdraw_response = client.delete(
        f"/api/v1/applications/{employer._test_opportunity_id}",  # type: ignore[attr-defined]
        headers={"Authorization": f"Bearer {applicant_access_token}"},
    )

    assert withdraw_response.status_code == 200
    body = withdraw_response.json()["data"]
    assert body["opportunity_id"] == employer._test_opportunity_id  # type: ignore[attr-defined]
    assert body["status"] == "withdrawn"

    list_response = client.get(
        "/api/v1/applications/mine/opportunity-ids",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
    )
    assert list_response.status_code == 200
    assert list_response.json()["data"]["opportunity_ids"] == []


def test_employer_opportunity_stats_show_real_application_count(client, db_session):
    employer = _create_employer_user(db_session, email="stats-employer@example.com", inn="7707083912")
    applicant = _create_applicant_user(db_session, email="stats-applicant@example.com")
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    submit_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert submit_response.status_code == 201

    list_response = client.get(
        "/api/v1/opportunities/mine",
        headers={"Authorization": f"Bearer {employer_access_token}"},
    )

    assert list_response.status_code == 200
    items = list_response.json()["data"]["items"]
    target = next(item for item in items if item["id"] == employer._test_opportunity_id)  # type: ignore[attr-defined]
    assert target["responses_count"] == 1
