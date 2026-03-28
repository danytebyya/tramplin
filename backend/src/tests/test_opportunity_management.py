from datetime import UTC, datetime, timedelta
from uuid import UUID

from src.core.security import hash_password
from src.enums import EmployerType, EmployerVerificationRequestStatus, MembershipRole, UserRole, UserStatus
from src.models import Employer, EmployerMembership, EmployerProfile, Opportunity, User
from src.models.opportunity import OpportunityStatus
from src.tests.test_moderation_dashboard import _create_curator, _login


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
    db_session.refresh(user)
    return user


def test_employer_can_create_opportunity_and_moderation_receives_it(client, db_session):
    employer = _create_employer_user(db_session, email="opportunity-employer@example.com", inn="7707083893")
    curator = _create_curator(db_session, email="opportunity-curator@example.com")
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    curator_access_token = _login(client, email=curator.email, password="CuratorPass123")

    response = client.post(
        "/api/v1/opportunities",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={
            "title": "Хакатон по аналитике",
            "description": "Подробное описание мероприятия для проверки и публикации в каталоге платформы.",
            "opportunity_type": "event",
            "city": "Казань",
            "address": "ул. Баумана, 1",
            "salary_label": "Бесплатно",
            "tags": ["Python", "Data Science"],
            "format": "offline",
            "event_type": "Хакатон",
            "planned_publish_at": None,
            "latitude": 55.796127,
            "longitude": 49.106414,
        },
    )

    assert response.status_code == 201
    body = response.json()["data"]
    assert body["status"] == "pending_review"
    assert body["event_type"] == "Хакатон"
    assert body["salary_label"] == "Бесплатно"
    assert body["address"] == "ул. Баумана, 1"

    moderation_response = client.get(
        "/api/v1/moderation/content-items",
        headers={"Authorization": f"Bearer {curator_access_token}"},
    )

    assert moderation_response.status_code == 200
    items = moderation_response.json()["data"]["items"]
    created_item = next(item for item in items if item["id"] == body["id"])
    assert created_item["kind"] == "event"
    assert created_item["status"] == "pending_review"
    assert "Хакатон" in created_item["tags"]


def test_approved_future_publication_stays_scheduled_until_date(client, db_session):
    employer = _create_employer_user(db_session, email="scheduled-employer@example.com", inn="7707083894")
    curator = _create_curator(db_session, email="scheduled-curator@example.com")
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    curator_access_token = _login(client, email=curator.email, password="CuratorPass123")

    create_response = client.post(
        "/api/v1/opportunities",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={
            "title": "Junior Python Developer",
            "description": "Полное описание вакансии с обязанностями, требованиями и условиями работы для кандидата.",
            "opportunity_type": "vacancy",
            "city": "Москва",
            "address": "ул. Тверская, 7",
            "salary_label": "120 000 ₽",
            "tags": ["Python", "FastAPI"],
            "format": "hybrid",
            "level_label": "junior",
            "employment_label": "full-time",
            "planned_publish_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
            "latitude": 55.755864,
            "longitude": 37.617698,
        },
    )

    opportunity_id = create_response.json()["data"]["id"]

    approve_response = client.post(
        f"/api/v1/moderation/content-items/{opportunity_id}/approve",
        headers={"Authorization": f"Bearer {curator_access_token}"},
        json={"moderator_comment": "Можно публиковать"},
    )

    assert approve_response.status_code == 200

    opportunity = db_session.query(Opportunity).filter(Opportunity.id == UUID(opportunity_id)).one()
    assert opportunity.business_status == OpportunityStatus.SCHEDULED


def test_create_opportunity_still_returns_success_when_notifications_fail(client, db_session, monkeypatch):
    employer = _create_employer_user(db_session, email="notify-employer@example.com", inn="7707083895")
    _create_curator(db_session, email="notify-curator@example.com")
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")

    def fail_notifications(*args, **kwargs):
        raise RuntimeError("notification failure")

    monkeypatch.setattr(
        "src.services.opportunity_service.OpportunityService._notify_moderators_about_submission",
        fail_notifications,
    )

    response = client.post(
        "/api/v1/opportunities",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={
            "title": "Python backend vacancy",
            "description": "Подробное описание вакансии с понятными требованиями и условиями для проверки модератором.",
            "opportunity_type": "vacancy",
            "city": "Чебоксары",
            "address": "ул. Калинина, 15",
            "salary_label": "100 000 ₽",
            "tags": ["Python", "FastAPI"],
            "format": "offline",
            "level_label": "junior",
            "employment_label": "full-time",
            "latitude": 56.1282,
            "longitude": 47.2519,
        },
    )

    assert response.status_code == 201
    body = response.json()["data"]
    assert body["title"] == "Python backend vacancy"
    assert db_session.query(Opportunity).filter(Opportunity.id == UUID(body["id"])).one_or_none() is not None


def test_deleted_pending_opportunity_disappears_from_content_moderation(client, db_session):
    employer = _create_employer_user(db_session, email="delete-employer@example.com", inn="7707083896")
    curator = _create_curator(db_session, email="delete-curator@example.com")
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    curator_access_token = _login(client, email=curator.email, password="CuratorPass123")

    create_response = client.post(
        "/api/v1/opportunities",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={
            "title": "Удаляемая публикация",
            "description": "Полное описание публикации, которая будет удалена до проверки куратором.",
            "opportunity_type": "vacancy",
            "city": "Москва",
            "address": "ул. Калинина, 7",
            "salary_label": "90 000 ₽",
            "tags": ["Python"],
            "format": "offline",
            "level_label": "junior",
            "employment_label": "full-time",
            "latitude": 55.755864,
            "longitude": 37.617698,
        },
    )
    opportunity_id = create_response.json()["data"]["id"]

    delete_response = client.delete(
        f"/api/v1/opportunities/{opportunity_id}",
        headers={"Authorization": f"Bearer {employer_access_token}"},
    )
    assert delete_response.status_code == 200

    moderation_response = client.get(
        "/api/v1/moderation/content-items",
        headers={"Authorization": f"Bearer {curator_access_token}"},
    )
    assert moderation_response.status_code == 200
    assert all(item["id"] != opportunity_id for item in moderation_response.json()["data"]["items"])


def test_delete_opportunity_preflight_returns_cors_headers(client, db_session):
    employer = _create_employer_user(db_session, email="delete-preflight-employer@example.com", inn="7707083900")
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")

    create_response = client.post(
        "/api/v1/opportunities",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={
            "title": "Публикация для preflight",
            "description": "Описание публикации для проверки preflight запроса на удаление.",
            "opportunity_type": "vacancy",
            "city": "Москва",
            "address": "ул. Тверская, 10",
            "salary_label": "100 000 ₽",
            "tags": ["Python"],
            "format": "offline",
            "level_label": "junior",
            "employment_label": "full-time",
            "latitude": 55.755864,
            "longitude": 37.617698,
        },
    )
    opportunity_id = create_response.json()["data"]["id"]

    response = client.options(
        f"/api/v1/opportunities/{opportunity_id}",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "DELETE" in response.headers["access-control-allow-methods"]


def test_employer_can_resubmit_rejected_opportunity_after_edit(client, db_session):
    employer = _create_employer_user(db_session, email="resubmit-employer@example.com", inn="7707083901")
    curator = _create_curator(db_session, email="resubmit-curator@example.com")
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    curator_access_token = _login(client, email=curator.email, password="CuratorPass123")

    create_response = client.post(
        "/api/v1/opportunities",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={
            "title": "Первая версия публикации",
            "description": "Первичная версия публикации для проверки редактирования и повторной отправки после отклонения.",
            "opportunity_type": "vacancy",
            "city": "Москва",
            "address": "ул. Тверская, 12",
            "salary_label": "100 000 ₽",
            "tags": ["Python", "FastAPI"],
            "format": "offline",
            "level_label": "junior",
            "employment_label": "full-time",
            "latitude": 55.755864,
            "longitude": 37.617698,
        },
    )
    opportunity_id = create_response.json()["data"]["id"]

    reject_response = client.post(
        f"/api/v1/moderation/content-items/{opportunity_id}/reject",
        headers={"Authorization": f"Bearer {curator_access_token}"},
        json={"moderator_comment": "Нужно уточнить стек и описание"},
    )
    assert reject_response.status_code == 200

    update_response = client.put(
        f"/api/v1/opportunities/{opportunity_id}",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={
            "title": "Обновлённая публикация",
            "description": "Обновлённое описание публикации после замечаний модератора с уточнённым стеком и условиями.",
            "opportunity_type": "vacancy",
            "city": "Москва",
            "address": "ул. Тверская, 12",
            "salary_label": "120 000 ₽",
            "tags": ["TypeScript", "React"],
            "format": "hybrid",
            "level_label": "middle",
            "employment_label": "full-time",
            "latitude": 55.755864,
            "longitude": 37.617698,
        },
    )

    assert update_response.status_code == 200
    body = update_response.json()["data"]
    assert body["status"] == "pending_review"
    assert body["title"] == "Обновлённая публикация"
    assert set(body["tags"]) == {"TypeScript", "React"}
