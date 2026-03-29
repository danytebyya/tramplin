from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select

from src.core.security import hash_password
from src.enums import EmployerType, EmployerVerificationRequestStatus, MembershipRole, UserRole, UserStatus
from src.models import (
    ApplicantProfile,
    Employer,
    EmployerMembership,
    EmployerProfile,
    Location,
    Notification,
    Opportunity,
    OpportunityLevel,
    OpportunityStatus,
    OpportunityTag,
    Tag,
    TagType,
    User,
    WorkFormat,
)
from src.models.opportunity import EmploymentType, ModerationStatus, OpportunityType
from src.tests.test_moderation_dashboard import _login


def _create_verified_employer(db_session, *, email: str, inn: str) -> User:
    user = User(
        email=email,
        display_name="Рекомендатель",
        password_hash=hash_password("EmployerPass123"),
        role=UserRole.EMPLOYER,
        status=UserStatus.ACTIVE,
        employer_profile=EmployerProfile(
            employer_type=EmployerType.COMPANY,
            company_name="ООО Рекомендации",
            inn=inn,
            corporate_email=email,
        ),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="ООО Рекомендации",
        legal_name="ООО Рекомендации",
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
    db_session.refresh(user)
    return user


def _create_applicant(
    db_session,
    *,
    email: str,
    display_name: str,
    university: str,
    graduation_year: int,
    city: str,
    desired_salary_from: int,
    work_formats: list[str],
    employment_types: list[str],
    hard_skills: list[str],
) -> User:
    user = User(
        email=email,
        display_name=display_name,
        password_hash=hash_password("ApplicantPass123"),
        role=UserRole.APPLICANT,
        status=UserStatus.ACTIVE,
        preferred_city=city,
        applicant_profile=ApplicantProfile(
            full_name=display_name,
            university=university,
            graduation_year=graduation_year,
            desired_salary_from=desired_salary_from,
            work_formats=work_formats,
            employment_types=employment_types,
            hard_skills=hard_skills,
            level="junior",
        ),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _create_public_opportunity(db_session, *, employer_user: User) -> Opportunity:
    employer = db_session.execute(select(Employer).where(Employer.created_by == employer_user.id)).scalar_one()
    location = Location(
        country_code="RU",
        country_name="Россия",
        city="Чебоксары",
        formatted_address="пр. Ленина, 1",
        latitude=56.13,
        longitude=47.25,
    )
    tag_python = Tag(
        slug="python",
        name="Python",
        tag_type=TagType.TECHNOLOGY,
        moderation_status=ModerationStatus.APPROVED,
        is_system=False,
    )
    tag_django = Tag(
        slug="django",
        name="Django",
        tag_type=TagType.TECHNOLOGY,
        moderation_status=ModerationStatus.APPROVED,
        is_system=False,
    )
    db_session.add(location)
    db_session.add(tag_python)
    db_session.add(tag_django)
    db_session.flush()

    opportunity = Opportunity(
        employer_id=employer.id,
        created_by_user_id=employer_user.id,
        updated_by_user_id=employer_user.id,
        location_id=location.id,
        location=location,
        title="Python Backend Developer",
        short_description="Вакансия для backend-разработчика",
        description="Требуется Python и Django для разработки backend-сервисов.",
        opportunity_type=OpportunityType.VACANCY,
        business_status=OpportunityStatus.ACTIVE,
        moderation_status=ModerationStatus.APPROVED,
        work_format=WorkFormat.OFFICE,
        employment_type=EmploymentType.FULL_TIME,
        level=OpportunityLevel.JUNIOR,
        published_at=datetime.now(UTC),
    )
    db_session.add(opportunity)
    db_session.flush()

    db_session.add(
        OpportunityTag(
            opportunity_id=opportunity.id,
            tag_id=tag_python.id,
            tag=tag_python,
            created_at=datetime.now(UTC),
        )
    )
    db_session.add(
        OpportunityTag(
            opportunity_id=opportunity.id,
            tag_id=tag_django.id,
            tag=tag_django,
            created_at=datetime.now(UTC),
        )
    )
    db_session.commit()
    db_session.refresh(opportunity)
    return opportunity


def test_list_recommendation_candidates_returns_real_applicants(client, db_session):
    employer = _create_verified_employer(
        db_session,
        email="recommend-employer@example.com",
        inn="7707083981",
    )
    _create_applicant(
        db_session,
        email="candidate-1@example.com",
        display_name="Мария Петрова",
        university="ЧГУ",
        graduation_year=2024,
        city="Чебоксары",
        desired_salary_from=80000,
        work_formats=["Офлайн"],
        employment_types=["Full-time"],
        hard_skills=["Python", "Django", "PostgreSQL"],
    )
    _create_applicant(
        db_session,
        email="candidate-2@example.com",
        display_name="Илья Смирнов",
        university="МГУ",
        graduation_year=2025,
        city="Москва",
        desired_salary_from=70000,
        work_formats=["Удаленно"],
        employment_types=["Part-time"],
        hard_skills=["JavaScript"],
    )
    opportunity = _create_public_opportunity(db_session, employer_user=employer)
    access_token = _login(client, email=employer.email, password="EmployerPass123")

    response = client.get(
        f"/api/v1/opportunities/{opportunity.id}/recommendation-candidates",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 2
    assert items[0]["display_name"] == "Мария Петрова"
    assert items[0]["subtitle"] == "ЧГУ, выпуск 2024"
    assert "Python" in items[0]["tags"]
    assert items[0]["salary_label"] == "от 80 000 ₽"


def test_recommend_opportunity_creates_push_notification_and_updates_counter(client, db_session):
    employer = _create_verified_employer(
        db_session,
        email="recommend-employer-push@example.com",
        inn="7707083982",
    )
    applicant = _create_applicant(
        db_session,
        email="recommended-applicant@example.com",
        display_name="Мария Петрова",
        university="ЧГУ",
        graduation_year=2024,
        city="Чебоксары",
        desired_salary_from=80000,
        work_formats=["Офлайн"],
        employment_types=["Full-time"],
        hard_skills=["Python", "Django"],
    )
    opportunity = _create_public_opportunity(db_session, employer_user=employer)

    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    with client.websocket_connect(f"/api/v1/notifications/stream?token={applicant_access_token}") as websocket:
        response = client.post(
            f"/api/v1/opportunities/{opportunity.id}/recommend",
            headers={"Authorization": f"Bearer {employer_access_token}"},
            json={"target_user_id": str(applicant.id)},
        )

        assert response.status_code == 200
        event = websocket.receive_json()
        assert event["type"] == "notification_created"

    notification = db_session.execute(
        select(Notification).where(Notification.user_id == applicant.id)
    ).scalars().all()
    recommendation_notification = next(
        item for item in notification if item.payload and item.payload.get("notification_type") == "opportunity_recommendation"
    )
    assert recommendation_notification.kind.value == "opportunity"
    assert recommendation_notification.title == "Вам порекомендовали вакансию"
    assert recommendation_notification.action_label == "Перейти"
    assert recommendation_notification.action_url == f"/opportunities/{opportunity.id}"
    assert "Рекомендатель" in recommendation_notification.message

    db_session.refresh(applicant)
    assert applicant.applicant_profile is not None
    assert applicant.applicant_profile.recommendations_count == 1


def test_recommend_opportunity_forbids_recommending_to_self(client, db_session):
    applicant = _create_applicant(
        db_session,
        email="self-recommend@example.com",
        display_name="Мария Петрова",
        university="ЧГУ",
        graduation_year=2024,
        city="Чебоксары",
        desired_salary_from=80000,
        work_formats=["Офлайн"],
        employment_types=["Full-time"],
        hard_skills=["Python", "Django"],
    )
    employer = _create_verified_employer(
        db_session,
        email="recommend-owner@example.com",
        inn="7707083983",
    )
    opportunity = _create_public_opportunity(db_session, employer_user=employer)
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    response = client.post(
        f"/api/v1/opportunities/{opportunity.id}/recommend",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"target_user_id": str(applicant.id)},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "RECOMMENDATION_SELF_FORBIDDEN"
