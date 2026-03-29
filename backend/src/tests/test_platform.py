from datetime import UTC, datetime, timedelta

from src.enums import UserRole, UserStatus
from src.models import Employer, Opportunity, OpportunityStatus, OpportunityType, User, WorkFormat
from src.models.opportunity import ModerationStatus


def test_read_platform_stats_returns_current_database_counts(client, db_session):
    active_applicant = User(
        email="applicant-active@example.com",
        display_name="Active Applicant",
        password_hash="hashed-password",
        role=UserRole.APPLICANT,
        status=UserStatus.ACTIVE,
    )
    archived_applicant = User(
        email="applicant-archived@example.com",
        display_name="Archived Applicant",
        password_hash="hashed-password",
        role=UserRole.APPLICANT,
        status=UserStatus.ARCHIVED,
    )
    employer_user = User(
        email="employer-owner@example.com",
        display_name="Employer Owner",
        password_hash="hashed-password",
        role=UserRole.EMPLOYER,
        status=UserStatus.ACTIVE,
    )
    db_session.add_all([active_applicant, archived_applicant, employer_user])
    db_session.flush()

    active_company = Employer(
        employer_type="company",
        display_name="Alpha",
        legal_name="Alpha LLC",
        inn="7707083001",
        created_by=employer_user.id,
    )
    deleted_company = Employer(
        employer_type="company",
        display_name="Beta",
        legal_name="Beta LLC",
        inn="7707083002",
        created_by=employer_user.id,
        deleted_at=datetime.now(UTC),
    )
    db_session.add_all([active_company, deleted_company])
    db_session.flush()

    now = datetime.now(UTC)
    db_session.add_all(
        [
            Opportunity(
                employer_id=active_company.id,
                title="Vacancy",
                short_description="Vacancy",
                description="Vacancy",
                opportunity_type=OpportunityType.VACANCY,
                business_status=OpportunityStatus.ACTIVE,
                moderation_status=ModerationStatus.APPROVED,
                work_format=WorkFormat.REMOTE,
                published_at=now,
            ),
            Opportunity(
                employer_id=active_company.id,
                title="Internship",
                short_description="Internship",
                description="Internship",
                opportunity_type=OpportunityType.INTERNSHIP,
                business_status=OpportunityStatus.ACTIVE,
                moderation_status=ModerationStatus.APPROVED,
                work_format=WorkFormat.REMOTE,
                published_at=now,
            ),
            Opportunity(
                employer_id=active_company.id,
                title="Event",
                short_description="Event",
                description="Event",
                opportunity_type=OpportunityType.CAREER_EVENT,
                business_status=OpportunityStatus.ACTIVE,
                moderation_status=ModerationStatus.APPROVED,
                work_format=WorkFormat.ONLINE,
                published_at=now,
            ),
            Opportunity(
                employer_id=active_company.id,
                title="Mentorship",
                short_description="Mentorship",
                description="Mentorship",
                opportunity_type=OpportunityType.MENTORSHIP_PROGRAM,
                business_status=OpportunityStatus.SCHEDULED,
                moderation_status=ModerationStatus.APPROVED,
                work_format=WorkFormat.ONLINE,
                starts_at=now - timedelta(hours=1),
            ),
            Opportunity(
                employer_id=active_company.id,
                title="Draft vacancy",
                short_description="Draft vacancy",
                description="Draft vacancy",
                opportunity_type=OpportunityType.VACANCY,
                business_status=OpportunityStatus.DRAFT,
                moderation_status=ModerationStatus.APPROVED,
                work_format=WorkFormat.REMOTE,
            ),
        ]
    )
    db_session.commit()

    response = client.get("/api/v1/platform/stats")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"] == {
        "companies_count": 1,
        "applicants_count": 1,
        "vacancies_count": 1,
        "internships_count": 1,
        "events_count": 1,
        "mentorships_count": 1,
    }
