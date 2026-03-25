from datetime import UTC, datetime, timedelta

from src.core.security import hash_password
from src.models import CuratorProfile, Employer, EmployerVerificationRequest, Opportunity, User
from src.models.opportunity import ModerationStatus, OpportunityStatus, OpportunityType, WorkFormat
from src.enums import EmployerType, EmployerVerificationRequestStatus, UserRole, UserStatus


def _create_curator(db_session, *, email: str, password: str = "CuratorPass123") -> User:
    curator = User(
        email=email,
        display_name="Curator",
        password_hash=hash_password(password),
        role=UserRole.CURATOR,
        status=UserStatus.ACTIVE,
        curator_profile=CuratorProfile(full_name="Curator"),
    )
    db_session.add(curator)
    db_session.commit()
    db_session.refresh(curator)
    return curator


def _login(client, *, email: str, password: str) -> str:
    response = client.post("/api/v1/auth/sessions", json={"email": email, "password": password})
    assert response.status_code == 201
    return response.json()["data"]["access_token"]


def test_curator_dashboard_returns_real_metrics(client, db_session):
    curator = _create_curator(db_session, email="curator-dashboard@example.com")
    second_curator = _create_curator(db_session, email="curator-online@example.com")
    access_token = _login(client, email=curator.email, password="CuratorPass123")
    _login(client, email=second_curator.email, password="CuratorPass123")

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Acme",
        legal_name="ООО Acme",
        inn="7701234567",
        corporate_email="hr@acme.example",
        verification_status=EmployerVerificationRequestStatus.PENDING,
    )
    db_session.add(employer)
    db_session.commit()
    db_session.refresh(employer)

    now = datetime.now(UTC)

    db_session.add_all(
        [
            EmployerVerificationRequest(
                employer_id=employer.id,
                legal_name=employer.legal_name,
                employer_type=EmployerType.COMPANY,
                inn=employer.inn,
                corporate_email=employer.corporate_email,
                status=EmployerVerificationRequestStatus.PENDING,
                submitted_at=now - timedelta(days=4),
            ),
            EmployerVerificationRequest(
                employer_id=employer.id,
                legal_name=employer.legal_name,
                employer_type=EmployerType.COMPANY,
                inn=employer.inn,
                corporate_email=employer.corporate_email,
                status=EmployerVerificationRequestStatus.APPROVED,
                submitted_at=now - timedelta(days=2),
                reviewed_by=curator.id,
                reviewed_at=now,
            ),
            Opportunity(
                employer_id=employer.id,
                title="Pending vacancy",
                short_description="Pending vacancy short description",
                description="Pending vacancy description",
                opportunity_type=OpportunityType.VACANCY,
                business_status=OpportunityStatus.ACTIVE,
                moderation_status=ModerationStatus.PENDING_REVIEW,
                work_format=WorkFormat.REMOTE,
                created_at=now - timedelta(days=4),
            ),
            Opportunity(
                employer_id=employer.id,
                title="Approved event",
                short_description="Approved event short description",
                description="Approved event description",
                opportunity_type=OpportunityType.CAREER_EVENT,
                business_status=OpportunityStatus.ACTIVE,
                moderation_status=ModerationStatus.APPROVED,
                work_format=WorkFormat.ONLINE,
                moderated_by_user_id=curator.id,
                moderated_at=now,
                created_at=now - timedelta(days=1),
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/v1/moderation/dashboard",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["metrics"]["total_on_moderation"] == 2
    assert payload["metrics"]["in_queue"] == 2
    assert payload["metrics"]["reviewed_today"] == 2
    assert payload["metrics"]["curators_online"] == 2
    assert payload["weekly_activity"]["total_reviewed"] == 2
    assert any(item["status_variant"] == "verified" for item in payload["latest_activity"])
    urgent_titles = {group["title"] for group in payload["urgent_task_groups"]}
    assert urgent_titles == {"Жалобы", "Просрочено", "Изменения"}
    overdue_group = next(group for group in payload["urgent_task_groups"] if group["title"] == "Просрочено")
    assert len(overdue_group["items"]) == 2


def test_curator_dashboard_requires_curator_or_admin(client, db_session):
    applicant = User(
        email="applicant-dashboard@example.com",
        display_name="Applicant",
        password_hash=hash_password("ApplicantPass123"),
        role=UserRole.APPLICANT,
        status=UserStatus.ACTIVE,
    )
    db_session.add(applicant)
    db_session.commit()

    access_token = _login(client, email=applicant.email, password="ApplicantPass123")
    response = client.get(
        "/api/v1/moderation/dashboard",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "MODERATION_FORBIDDEN"
