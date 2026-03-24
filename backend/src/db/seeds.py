from __future__ import annotations

from contextlib import nullcontext
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from random import Random
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.security import hash_password
from src.db.session import SessionLocal
from src.enums import EmployerType, EmployerVerificationRequestStatus, UserRole, UserStatus
from src.models import (
    CuratorProfile,
    Employer,
    EmploymentType,
    Location,
    ModerationStatus,
    Opportunity,
    OpportunityCompensation,
    OpportunityLevel,
    OpportunityStatus,
    OpportunityTag,
    OpportunityType,
    Tag,
    TagType,
    User,
    WorkFormat,
)
from src.repositories import OpportunityRepository, UserRepository


def seed_initial_admin(db: Session | None = None) -> None:
    session_context = nullcontext(db) if db is not None else SessionLocal()
    with session_context as db:
        repo = UserRepository(db)
        admin = repo.get_by_email(settings.initial_admin_email.lower())
        if admin is not None:
            return

        admin_user = User(
            email=settings.initial_admin_email.lower(),
            display_name=settings.initial_admin_display_name,
            password_hash=hash_password(settings.initial_admin_password),
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            curator_profile=CuratorProfile(full_name=settings.initial_admin_display_name),
        )
        repo.add(admin_user)
        db.commit()


def seed_demo_opportunities(db: Session | None = None) -> None:
    session_context = nullcontext(db) if db is not None else SessionLocal()
    with session_context as db:
        repo = OpportunityRepository(db)
        if repo.count() >= 20:
            return

        now = datetime.now(UTC)
        randomizer = Random(42)

        tag_names = [
            "Python",
            "FastAPI",
            "React",
            "TypeScript",
            "PostgreSQL",
            "Docker",
            "Kubernetes",
            "CI/CD",
            "Data Engineering",
            "Machine Learning",
            "DevOps",
            "QA Automation",
        ]
        tags = []
        for tag_name in tag_names:
            tag = Tag(
                slug=tag_name.lower().replace("/", "-").replace(" ", "-"),
                name=tag_name,
                tag_type=TagType.TECHNOLOGY,
                moderation_status=ModerationStatus.APPROVED,
                is_system=True,
            )
            db.add(tag)
            tags.append(tag)

        location_specs = [
            ("Москва", Decimal("55.755826"), Decimal("37.617300")),
            ("Санкт-Петербург", Decimal("59.934280"), Decimal("30.335099")),
            ("Казань", Decimal("55.796127"), Decimal("49.106414")),
            ("Иннополис", Decimal("55.752220"), Decimal("48.744130")),
            ("Новосибирск", Decimal("55.030199"), Decimal("82.920430")),
            ("Екатеринбург", Decimal("56.838011"), Decimal("60.597465")),
        ]
        locations = []
        for city, latitude, longitude in location_specs:
            location = Location(
                country_code="RU",
                country_name="Russia",
                region=city,
                city=city,
                formatted_address=f"{city}, Россия",
                latitude=latitude,
                longitude=longitude,
                timezone="Europe/Moscow",
            )
            db.add(location)
            locations.append(location)

        company_names = [
            "Volga Stack",
            "Neva Cloud",
            "Siberia Data",
            "InnoCore",
            "Orbit Systems",
        ]
        employers = []
        for company_name, location in zip(company_names, locations, strict=False):
            employer = Employer(
                employer_type=EmployerType.COMPANY,
                display_name=company_name,
                legal_name=f"ООО {company_name}",
                inn=f"{randomizer.randint(1000000000, 9999999999)}",
                description_short=f"{company_name} нанимает IT-специалистов и стажёров.",
                description_full=f"{company_name} развивает продуктовые и инфраструктурные команды в IT.",
                website_url=f"https://{company_name.lower().replace(' ', '')}.example",
                corporate_email=f"hr@{company_name.lower().replace(' ', '')}.example",
                headquarters_location_id=location.id,
                verification_status=EmployerVerificationRequestStatus.APPROVED,
            )
            db.add(employer)
            employers.append(employer)

        db.flush()

        role_templates = [
            ("Frontend разработчик", "React, TypeScript, продуктовые интерфейсы и дизайн-системы.", OpportunityLevel.MIDDLE, WorkFormat.OFFICE),
            ("Backend Python engineer", "FastAPI, интеграции, PostgreSQL и надёжные backend-сервисы.", OpportunityLevel.MIDDLE, WorkFormat.HYBRID),
            ("DevOps engineer", "CI/CD, контейнеризация, observability и поддержка облачной платформы.", OpportunityLevel.SENIOR, WorkFormat.REMOTE),
            ("Data engineer", "ETL, витрины данных и data platform для аналитических команд.", OpportunityLevel.MIDDLE, WorkFormat.HYBRID),
            ("QA automation engineer", "Автотесты, regression pipeline и качество релизов.", OpportunityLevel.JUNIOR, WorkFormat.OFFICE),
            ("ML engineer", "ML-сервисы, inference pipelines и прикладной AI.", OpportunityLevel.MIDDLE, WorkFormat.REMOTE),
            ("Product analyst", "Продуктовая аналитика, эксперименты и growth-метрики.", OpportunityLevel.JUNIOR, WorkFormat.HYBRID),
            ("Mobile developer", "React Native/Flutter, мобильный клиент и релизный цикл.", OpportunityLevel.MIDDLE, WorkFormat.OFFICE),
            ("System analyst", "Сбор требований, интеграционные схемы и API-контракты.", OpportunityLevel.MIDDLE, WorkFormat.HYBRID),
            ("Platform engineer", "Внутренние платформы разработки и developer experience.", OpportunityLevel.SENIOR, WorkFormat.REMOTE),
        ]

        employment_values = [
            EmploymentType.FULL_TIME,
            EmploymentType.FULL_TIME,
            EmploymentType.FULL_TIME,
            EmploymentType.PART_TIME,
        ]

        for index in range(20):
            title, short_description, level, work_format = role_templates[index % len(role_templates)]
            employer = employers[index % len(employers)]
            location = locations[index % len(locations)]
            salary_from = Decimal(randomizer.randrange(70000, 240000, 5000))
            selected_tags = randomizer.sample(tags, k=3)
            created_at = now - timedelta(days=index + 1)
            opportunity = Opportunity(
                employer_id=employer.id,
                location_id=location.id,
                title=f"{title} #{index + 1}",
                short_description=short_description,
                description=(
                    f"{title} в {employer.display_name}: разработка IT-продукта, работа в кросс-функциональной "
                    "команде, участие в релизах и технических улучшениях."
                ),
                opportunity_type=OpportunityType.VACANCY,
                business_status=OpportunityStatus.ACTIVE,
                moderation_status=ModerationStatus.APPROVED,
                work_format=work_format,
                employment_type=employment_values[index % len(employment_values)],
                level=level,
                contact_email=employer.corporate_email,
                published_at=created_at,
                application_deadline=created_at + timedelta(days=30),
                is_paid=True,
                moderated_at=created_at,
            )
            db.add(opportunity)
            db.flush()

            db.add(
                OpportunityCompensation(
                    opportunity_id=opportunity.id,
                    salary_from=salary_from,
                    currency_code="RUB",
                )
            )

            for tag in selected_tags:
                db.add(
                    OpportunityTag(
                        opportunity_id=opportunity.id,
                        tag_id=tag.id,
                        created_at=created_at,
                    )
                )

        db.commit()


if __name__ == "__main__":
    seed_initial_admin()
    seed_demo_opportunities()
