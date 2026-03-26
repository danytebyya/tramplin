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


def test_curator_dashboard_latest_activity_excludes_seed_like_records_without_moderator(client, db_session):
    curator = _create_curator(db_session, email="curator-latest-activity@example.com")
    access_token = _login(client, email=curator.email, password="CuratorPass123")

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Seeded Corp",
        legal_name="ООО Seeded Corp",
        inn="7701234568",
        corporate_email="hr@seeded.example",
        verification_status=EmployerVerificationRequestStatus.APPROVED,
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
                status=EmployerVerificationRequestStatus.APPROVED,
                reviewed_at=now - timedelta(minutes=5),
                reviewed_by=curator.id,
            ),
            Opportunity(
                employer_id=employer.id,
                title="Seeded approved vacancy",
                short_description="Seeded approved vacancy short description",
                description="Seeded approved vacancy description",
                opportunity_type=OpportunityType.VACANCY,
                business_status=OpportunityStatus.ACTIVE,
                moderation_status=ModerationStatus.APPROVED,
                work_format=WorkFormat.REMOTE,
                moderated_at=now - timedelta(minutes=1),
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
    latest_activity = response.json()["data"]["latest_activity"]
    assert len(latest_activity) == 1
    assert latest_activity[0]["id"].startswith("verification:")


def test_curator_dashboard_weekly_activity_labels_match_real_weekdays(client, db_session):
    curator = _create_curator(db_session, email="curator-weekdays@example.com")
    access_token = _login(client, email=curator.email, password="CuratorPass123")

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Weekdays Corp",
        legal_name="ООО Weekdays Corp",
        inn="7701234569",
        corporate_email="hr@weekdays.example",
        verification_status=EmployerVerificationRequestStatus.APPROVED,
    )
    db_session.add(employer)
    db_session.commit()
    db_session.refresh(employer)

    reviewed_at = datetime(2026, 3, 26, 12, 0, tzinfo=UTC)
    db_session.add(
        EmployerVerificationRequest(
            employer_id=employer.id,
            legal_name=employer.legal_name,
            employer_type=EmployerType.COMPANY,
            inn=employer.inn,
            corporate_email=employer.corporate_email,
            status=EmployerVerificationRequestStatus.APPROVED,
            reviewed_at=reviewed_at,
            reviewed_by=curator.id,
            submitted_at=reviewed_at - timedelta(days=1),
        )
    )
    db_session.commit()

    from src.services.moderation_service import ModerationService
    from src.repositories import ModerationRepository

    service = ModerationService(ModerationRepository(db_session))
    weekly_activity = service._build_weekly_activity(
        now=reviewed_at,
        verification_requests=db_session.query(EmployerVerificationRequest).all(),
        opportunities=[],
    )

    assert weekly_activity["days"][-1]["label"] == "Чт"
    assert weekly_activity["days"][-1]["count"] == 1


def test_curator_dashboard_changes_group_shows_only_requests_older_than_one_day(client, db_session):
    curator = _create_curator(db_session, email="curator-changes-threshold@example.com")
    access_token = _login(client, email=curator.email, password="CuratorPass123")

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Threshold Corp",
        legal_name="ООО Threshold Corp",
        inn="7701234570",
        corporate_email="hr@threshold.example",
        verification_status=EmployerVerificationRequestStatus.SUSPENDED,
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
                status=EmployerVerificationRequestStatus.SUSPENDED,
                submitted_at=now - timedelta(days=2),
                reviewed_at=now - timedelta(days=2),
                reviewed_by=curator.id,
            ),
            EmployerVerificationRequest(
                employer_id=employer.id,
                legal_name=employer.legal_name,
                employer_type=EmployerType.COMPANY,
                inn=employer.inn,
                corporate_email=employer.corporate_email,
                status=EmployerVerificationRequestStatus.SUSPENDED,
                submitted_at=now - timedelta(hours=4),
                reviewed_at=now - timedelta(hours=4),
                reviewed_by=curator.id,
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/v1/moderation/dashboard",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    changes_group = next(
        group for group in response.json()["data"]["urgent_task_groups"] if group["title"] == "Изменения"
    )
    assert len(changes_group["items"]) == 1
    assert changes_group["items"][0]["age_days"] >= 1
