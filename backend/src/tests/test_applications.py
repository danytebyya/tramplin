from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select

from src.core.security import hash_password
from src.enums import EmployerType, EmployerVerificationRequestStatus, MembershipRole, UserRole, UserStatus
from src.models import Application, Employer, EmployerMembership, EmployerProfile, Notification, Opportunity, User, UserNotificationPreference
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

    history_response = client.get(
        "/api/v1/applications/mine",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
    )
    assert history_response.status_code == 200
    assert history_response.json()["data"]["items"][0]["status"] == "withdrawn"

    resubmit_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert resubmit_response.status_code == 201
    assert resubmit_response.json()["data"]["status"] == "submitted"

    history_after_resubmit = client.get(
        "/api/v1/applications/mine",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
    )
    assert history_after_resubmit.status_code == 200
    items = history_after_resubmit.json()["data"]["items"]
    assert items[0]["status"] == "submitted"
    assert any(item["status"] == "withdrawn" for item in items)


def test_applicant_cannot_resubmit_after_employer_rejection(client, db_session):
    employer = _create_employer_user(db_session, email="reject-employer@example.com", inn="7707083920")
    applicant = _create_applicant_user(db_session, email="reject-applicant@example.com")
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    submit_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert submit_response.status_code == 201

    employer_items_response = client.get(
        "/api/v1/applications/employer",
        headers={"Authorization": f"Bearer {employer_access_token}"},
    )
    assert employer_items_response.status_code == 200
    application_id = employer_items_response.json()["data"]["items"][0]["id"]

    reject_response = client.patch(
        f"/api/v1/applications/{application_id}/status",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={"status": "rejected"},
    )
    assert reject_response.status_code == 200

    resubmit_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert resubmit_response.status_code == 409
    assert resubmit_response.json()["error"]["code"] == "APPLICATION_REAPPLY_FORBIDDEN"


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


def test_applicant_can_list_real_application_details(client, db_session):
    employer = _create_employer_user(db_session, email="details-employer@example.com", inn="7707083914")
    applicant = _create_applicant_user(db_session, email="details-applicant@example.com")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    submit_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert submit_response.status_code == 201

    list_response = client.get(
        "/api/v1/applications/mine",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
    )
    assert list_response.status_code == 200

    items = list_response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["opportunity_id"] == employer._test_opportunity_id  # type: ignore[attr-defined]
    assert items[0]["status"] == "submitted"
    assert items[0]["employer_comment"] is None


def test_employer_can_list_and_update_application_status(client, db_session, monkeypatch):
    employer = _create_employer_user(db_session, email="review-employer@example.com", inn="7707083915")
    applicant = _create_applicant_user(db_session, email="review-applicant@example.com")
    db_session.add(
        UserNotificationPreference(
            user_id=applicant.id,
            email_new_verification_requests=True,
            push_new_verification_requests=True,
            push_publication_changes=True,
        )
    )
    db_session.commit()
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    submit_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert submit_response.status_code == 201

    published_events: list[tuple[list[str], dict]] = []

    def fake_publish(user_ids, payload):
        published_events.append((list(user_ids), payload))

    monkeypatch.setattr("src.realtime.notification_hub.publish_to_users_sync", fake_publish)

    employer_list_response = client.get(
        "/api/v1/applications/employer",
        headers={"Authorization": f"Bearer {employer_access_token}"},
    )
    assert employer_list_response.status_code == 200

    items = employer_list_response.json()["data"]["items"]
    assert len(items) == 1
    application_id = items[0]["id"]
    assert items[0]["status"] == "submitted"
    assert items[0]["applicant"]["user_id"] is not None

    update_response = client.patch(
        f"/api/v1/applications/{application_id}/status",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={
            "status": "accepted",
            "employer_comment": "Приглашаем на интервью",
            "interview_date": "2026-04-02T09:00:00+03:00",
            "interview_start_time": "09:00",
            "interview_end_time": "10:00",
            "interview_format": "Онлайн",
            "meeting_link": "https://example.com/meet",
            "contact_email": "hr@example.com",
            "checklist": "Паспорт\nРезюме",
        },
    )
    assert update_response.status_code == 200
    body = update_response.json()["data"]
    assert body["status"] == "interview"
    assert body["employer_comment"] == "Приглашаем на интервью"
    assert body["interview_start_time"] == "09:00"
    assert body["applicant"]["display_name"] == "Applicant"

    applicant_list_response = client.get(
        "/api/v1/applications/mine",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
    )
    assert applicant_list_response.status_code == 200
    applicant_items = applicant_list_response.json()["data"]["items"]
    assert applicant_items[0]["status"] == "interview"
    assert applicant_items[0]["employer_comment"] == "Приглашаем на интервью"
    assert applicant_items[0]["meeting_link"] == "https://example.com/meet"

    persisted_notification = db_session.execute(
        select(Notification).where(Notification.user_id == UUID(str(applicant.id)))
    ).scalars().all()
    assert any(item.kind.value == "application" for item in persisted_notification)
    assert any(str(applicant.id) in user_ids and payload["type"] == "notification_created" for user_ids, payload in published_events)


def test_applicant_cannot_withdraw_after_employer_decision_that_locks_flow(client, db_session):
    employer = _create_employer_user(db_session, email="locked-employer@example.com", inn="7707083916")
    applicant = _create_applicant_user(db_session, email="locked-applicant@example.com")
    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    submit_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert submit_response.status_code == 201

    employer_list_response = client.get(
        "/api/v1/applications/employer",
        headers={"Authorization": f"Bearer {employer_access_token}"},
    )
    application_id = employer_list_response.json()["data"]["items"][0]["id"]

    update_response = client.patch(
        f"/api/v1/applications/{application_id}/status",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={"status": "accepted"},
    )
    assert update_response.status_code == 200

    withdraw_response = client.delete(
        f"/api/v1/applications/{employer._test_opportunity_id}",  # type: ignore[attr-defined]
        headers={"Authorization": f"Bearer {applicant_access_token}"},
    )
    assert withdraw_response.status_code == 200
    assert withdraw_response.json()["data"]["status"] == "withdrawn"


def test_applicant_status_update_respects_publication_notification_preferences(client, db_session, monkeypatch):
    employer = _create_employer_user(db_session, email="prefs-employer@example.com", inn="7707083917")
    applicant = _create_applicant_user(db_session, email="prefs-applicant@example.com")
    db_session.add(
        UserNotificationPreference(
            user_id=applicant.id,
            email_new_verification_requests=True,
            push_new_verification_requests=True,
            email_publication_changes=False,
            push_publication_changes=False,
            email_chat_reminders=True,
            push_chat_reminders=True,
        )
    )
    db_session.commit()

    employer_access_token = _login(client, email=employer.email, password="EmployerPass123")
    applicant_access_token = _login(client, email=applicant.email, password="ApplicantPass123")

    submit_response = client.post(
        "/api/v1/applications",
        headers={"Authorization": f"Bearer {applicant_access_token}"},
        json={"opportunity_id": employer._test_opportunity_id},  # type: ignore[attr-defined]
    )
    assert submit_response.status_code == 201

    sent_emails: list[tuple[str, str, str]] = []
    published_events: list[tuple[list[str], dict]] = []

    def fake_send_email(recipient: str, subject: str, body: str):
        sent_emails.append((recipient, subject, body))

    def fake_publish(user_ids, payload):
        published_events.append((list(user_ids), payload))

    monkeypatch.setattr("src.services.application_service.send_email", fake_send_email)
    monkeypatch.setattr("src.realtime.notification_hub.publish_to_users_sync", fake_publish)

    employer_list_response = client.get(
        "/api/v1/applications/employer",
        headers={"Authorization": f"Bearer {employer_access_token}"},
    )
    application_id = employer_list_response.json()["data"]["items"][0]["id"]

    update_response = client.patch(
        f"/api/v1/applications/{application_id}/status",
        headers={"Authorization": f"Bearer {employer_access_token}"},
        json={"status": "accepted"},
    )
    assert update_response.status_code == 200

    persisted_notification = db_session.execute(
        select(Notification).where(Notification.user_id == UUID(str(applicant.id)))
    ).scalars().all()
    assert persisted_notification == []
    assert sent_emails == []
    assert published_events == []
