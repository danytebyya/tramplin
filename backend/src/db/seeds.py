from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from random import Random
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.session import SessionLocal
from src.enums import EmployerType, EmployerVerificationRequestStatus, UserRole, UserStatus
from src.models import (
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
from src.repositories import OpportunityRepository


def seed_demo_opportunities(db: Session | None = None) -> None:
    session_context = nullcontext(db) if db is not None else SessionLocal()
    with session_context as db:
        repo = OpportunityRepository(db)
        target_opportunity_count = 35
        current_count = repo.count()

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
            slug = tag_name.lower().replace("/", "-").replace(" ", "-")
            tag = db.execute(select(Tag).where(Tag.slug == slug)).scalar_one_or_none()
            if tag is None:
                tag = Tag(
                    slug=slug,
                    name=tag_name,
                    tag_type=TagType.TECHNOLOGY,
                    moderation_status=ModerationStatus.APPROVED,
                    is_system=True,
                )
                db.add(tag)
            tags.append(tag)

        location_specs = [
            ("Чебоксары", Decimal("56.143800"), Decimal("47.248900")),
            ("Чебоксары", Decimal("56.142100"), Decimal("47.256400")),
            ("Чебоксары", Decimal("56.140700"), Decimal("47.264100")),
            ("Чебоксары", Decimal("56.138800"), Decimal("47.271800")),
            ("Чебоксары", Decimal("56.136500"), Decimal("47.275400")),
            ("Чебоксары", Decimal("56.133900"), Decimal("47.283500")),
            ("Чебоксары", Decimal("56.131400"), Decimal("47.291200")),
            ("Чебоксары", Decimal("56.129600"), Decimal("47.303100")),
            ("Чебоксары", Decimal("56.127200"), Decimal("47.297400")),
            ("Чебоксары", Decimal("56.124800"), Decimal("47.289500")),
            ("Чебоксары", Decimal("56.121900"), Decimal("47.241300")),
            ("Чебоксары", Decimal("56.119700"), Decimal("47.247900")),
            ("Чебоксары", Decimal("56.117600"), Decimal("47.255800")),
            ("Чебоксары", Decimal("56.115400"), Decimal("47.262700")),
            ("Чебоксары", Decimal("56.115400"), Decimal("47.282000")),
            ("Чебоксары", Decimal("56.118600"), Decimal("47.287600")),
            ("Чебоксары", Decimal("56.121300"), Decimal("47.294900")),
            ("Чебоксары", Decimal("56.124400"), Decimal("47.300800")),
            ("Чебоксары", Decimal("56.128200"), Decimal("47.221500")),
            ("Чебоксары", Decimal("56.132100"), Decimal("47.227800")),
            ("Чебоксары", Decimal("56.136100"), Decimal("47.233900")),
            ("Чебоксары", Decimal("56.139400"), Decimal("47.239600")),
            ("Чебоксары", Decimal("56.144800"), Decimal("47.219100")),
            ("Чебоксары", Decimal("56.147900"), Decimal("47.226700")),
            ("Чебоксары", Decimal("56.150500"), Decimal("47.234200")),
            ("Чебоксары", Decimal("56.152700"), Decimal("47.221500")),
            ("Чебоксары", Decimal("56.154900"), Decimal("47.242800")),
            ("Чебоксары", Decimal("56.151800"), Decimal("47.251600")),
            ("Чебоксары", Decimal("56.148600"), Decimal("47.259700")),
            ("Чебоксары", Decimal("56.145300"), Decimal("47.267900")),
            ("Чебоксары", Decimal("56.142700"), Decimal("47.276100")),
            ("Чебоксары", Decimal("56.140100"), Decimal("47.284400")),
            ("Чебоксары", Decimal("56.137400"), Decimal("47.292100")),
            ("Чебоксары", Decimal("56.134600"), Decimal("47.299300")),
            ("Чебоксары", Decimal("56.131900"), Decimal("47.306400")),
        ]
        locations = []
        for index, (city, latitude, longitude) in enumerate(location_specs, start=1):
            location = db.execute(
                select(Location).where(
                    Location.city == city,
                    Location.country_code == "RU",
                    Location.formatted_address == f"{city}, точка {index}",
                )
            ).scalar_one_or_none()
            if location is None:
                location = Location(
                    country_code="RU",
                    country_name="Russia",
                    region="Чувашская Республика",
                    city=city,
                    formatted_address=f"{city}, точка {index}",
                    latitude=latitude,
                    longitude=longitude,
                    timezone="Europe/Moscow",
                )
                db.add(location)
            else:
                location.region = "Чувашская Республика"
                location.formatted_address = f"{city}, точка {index}"
                location.latitude = latitude
                location.longitude = longitude
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
            corporate_email = f"hr@{company_name.lower().replace(' ', '')}.example"
            employer = db.execute(
                select(Employer).where(Employer.corporate_email == corporate_email)
            ).scalar_one_or_none()
            if employer is None:
                employer = Employer(
                    employer_type=EmployerType.COMPANY,
                    display_name=company_name,
                    legal_name=f"ООО {company_name}",
                    inn=f"{randomizer.randint(1000000000, 9999999999)}",
                    description_short=f"{company_name} нанимает IT-специалистов и стажёров.",
                    description_full=f"{company_name} развивает продуктовые и инфраструктурные команды в IT.",
                    website_url=f"https://{company_name.lower().replace(' ', '')}.example",
                    corporate_email=corporate_email,
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

        opportunity_blueprints = []

        for index in range(20):
            title, short_description, level, work_format = role_templates[index % len(role_templates)]
            opportunity_blueprints.append(
                {
                    "title": f"{title} #{index + 1}",
                    "short_description": short_description,
                    "description": None,
                    "opportunity_type": OpportunityType.VACANCY,
                    "level": level,
                    "work_format": work_format,
                    "employment_type": employment_values[index % len(employment_values)],
                    "is_paid": True,
                    "salary_from": Decimal(randomizer.randrange(70000, 240000, 5000)),
                }
            )

        extra_templates = [
            ("Frontend internship", "Стажировка в web-команде с наставником и учебным треком.", OpportunityType.INTERNSHIP, OpportunityLevel.STUDENT, WorkFormat.HYBRID, EmploymentType.PART_TIME, Decimal("45000")),
            ("Backend internship", "Практика с FastAPI, PostgreSQL и внутренними сервисами.", OpportunityType.INTERNSHIP, OpportunityLevel.STUDENT, WorkFormat.OFFICE, EmploymentType.PART_TIME, Decimal("50000")),
            ("DevOps internship", "Стажировка в команде платформы и инфраструктуры.", OpportunityType.INTERNSHIP, OpportunityLevel.STUDENT, WorkFormat.REMOTE, EmploymentType.PART_TIME, Decimal("40000")),
            ("Data internship", "Старт в аналитике и data engineering на реальных задачах.", OpportunityType.INTERNSHIP, OpportunityLevel.STUDENT, WorkFormat.HYBRID, EmploymentType.PART_TIME, Decimal("45000")),
            ("Mobile internship", "Практика в мобильной команде с code review и наставником.", OpportunityType.INTERNSHIP, OpportunityLevel.STUDENT, WorkFormat.OFFICE, EmploymentType.PART_TIME, Decimal("40000")),
            ("AI meetup", "Открытый IT-митап про AI, карьеру и собеседования.", OpportunityType.CAREER_EVENT, OpportunityLevel.ENTRY, WorkFormat.OFFLINE, None, None),
            ("Backend career day", "Карьерный офлайн-день с компаниями и экспресс-интервью.", OpportunityType.CAREER_EVENT, OpportunityLevel.ENTRY, WorkFormat.OFFLINE, None, None),
            ("Product analytics webinar", "Онлайн-мероприятие про аналитику, рост и продуктовые метрики.", OpportunityType.CAREER_EVENT, OpportunityLevel.ENTRY, WorkFormat.ONLINE, None, None),
            ("DevOps roundtable", "Гибридная встреча о SRE, инфраструктуре и cloud-практиках.", OpportunityType.CAREER_EVENT, OpportunityLevel.ENTRY, WorkFormat.HYBRID, None, None),
            ("Frontend mentoring", "Индивидуальная программа менторства по frontend-направлению.", OpportunityType.MENTORSHIP_PROGRAM, OpportunityLevel.JUNIOR, WorkFormat.ONLINE, EmploymentType.PART_TIME, None),
            ("Backend mentoring", "Менторство по backend-разработке и архитектуре сервисов.", OpportunityType.MENTORSHIP_PROGRAM, OpportunityLevel.JUNIOR, WorkFormat.REMOTE, EmploymentType.PART_TIME, None),
            ("Data mentoring", "Менторская программа по аналитике и data engineering.", OpportunityType.MENTORSHIP_PROGRAM, OpportunityLevel.JUNIOR, WorkFormat.HYBRID, EmploymentType.PART_TIME, None),
            ("QA mentoring", "Менторство для входа в QA automation и тестовую инфраструктуру.", OpportunityType.MENTORSHIP_PROGRAM, OpportunityLevel.JUNIOR, WorkFormat.ONLINE, EmploymentType.PART_TIME, None),
            ("System design mentoring", "Подготовка к growth в middle-level системном дизайне.", OpportunityType.MENTORSHIP_PROGRAM, OpportunityLevel.MIDDLE, WorkFormat.REMOTE, EmploymentType.PART_TIME, None),
            ("Platform community event", "Комьюнити-встреча по платформенной инженерии и DX.", OpportunityType.CAREER_EVENT, OpportunityLevel.ENTRY, WorkFormat.OFFLINE, None, None),
        ]

        for title, short_description, opportunity_type, level, work_format, employment_type, salary_from in extra_templates:
            opportunity_blueprints.append(
                {
                    "title": title,
                    "short_description": short_description,
                    "description": None,
                    "opportunity_type": opportunity_type,
                    "level": level,
                    "work_format": work_format,
                    "employment_type": employment_type,
                    "is_paid": salary_from is not None,
                    "salary_from": salary_from,
                }
            )

        existing_titles = set(db.execute(select(Opportunity.title)).scalars().all())

        if current_count < target_opportunity_count:
            for blueprint_index, blueprint in enumerate(opportunity_blueprints):
                if repo.count() >= target_opportunity_count:
                    break

                if blueprint["title"] in existing_titles:
                    continue

                employer = employers[blueprint_index % len(employers)]
                location = locations[blueprint_index % len(locations)]
                selected_tags = randomizer.sample(tags, k=3)
                created_at = now - timedelta(days=repo.count() + 1)
                title = blueprint["title"]
                opportunity = Opportunity(
                    employer_id=employer.id,
                    location_id=location.id,
                    title=title,
                    short_description=blueprint["short_description"],
                    description=(
                        blueprint["description"]
                        or f"{title} в {employer.display_name}: работа с IT-продуктом, участие в команде, "
                        "практика на реальных задачах и развитие карьерного трека."
                    ),
                    opportunity_type=blueprint["opportunity_type"],
                    business_status=OpportunityStatus.ACTIVE,
                    moderation_status=ModerationStatus.APPROVED,
                    work_format=blueprint["work_format"],
                    employment_type=blueprint["employment_type"],
                    level=blueprint["level"],
                    contact_email=employer.corporate_email,
                    published_at=created_at,
                    application_deadline=created_at + timedelta(days=30),
                    is_paid=blueprint["is_paid"],
                    moderated_at=created_at,
                )
                db.add(opportunity)
                db.flush()

                if blueprint["salary_from"] is not None:
                    db.add(
                        OpportunityCompensation(
                            opportunity_id=opportunity.id,
                            salary_from=blueprint["salary_from"],
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
                existing_titles.add(title)

        existing_opportunities = db.execute(
            select(Opportunity).order_by(Opportunity.created_at.asc(), Opportunity.id.asc())
        ).scalars().all()

        for opportunity_index, opportunity in enumerate(existing_opportunities):
            location = locations[opportunity_index % len(locations)]
            opportunity.location_id = location.id

        db.commit()


if __name__ == "__main__":
    seed_demo_opportunities()
