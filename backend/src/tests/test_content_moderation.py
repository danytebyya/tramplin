from datetime import UTC, datetime, timedelta

from src.enums import EmployerType, EmployerVerificationRequestStatus
from src.models import Employer, Opportunity
from src.models.opportunity import ModerationStatus, OpportunityStatus, OpportunityType, WorkFormat
from src.tests.test_moderation_dashboard import _create_curator, _login


def _create_content_item(db_session, *, title: str) -> Opportunity:
    slug = title.lower().replace(" ", "-")
    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name=f"Content Company {title}",
        legal_name=f"ООО Content Company {title}",
        inn=f"7707083{abs(hash(title)) % 1000:03d}",
        corporate_email=f"hr@{slug}.example",
        verification_status=EmployerVerificationRequestStatus.APPROVED,
    )
    db_session.add(employer)
    db_session.commit()
    db_session.refresh(employer)

    opportunity = Opportunity(
        employer_id=employer.id,
        title=title,
        short_description="Краткое описание публикации для модерации.",
        description="Подробное описание публикации с достаточным количеством текста для проверки.",
        opportunity_type=OpportunityType.VACANCY,
        business_status=OpportunityStatus.ACTIVE,
        moderation_status=ModerationStatus.PENDING_REVIEW,
        work_format=WorkFormat.REMOTE,
        contact_email="author@example.com",
    )
    db_session.add(opportunity)
    db_session.commit()
    db_session.refresh(opportunity)
    return opportunity


def test_list_content_moderation_items_returns_payload(client, db_session):
    curator = _create_curator(db_session, email="content-moderation@example.com")
    access_token = _login(client, email=curator.email, password="CuratorPass123")
    opportunities = [
        _create_content_item(db_session, title="Pending content"),
        _create_content_item(db_session, title="Unpublished content"),
        _create_content_item(db_session, title="Changes requested content"),
        _create_content_item(db_session, title="Active content"),
    ]
    opportunities[0].moderation_status = ModerationStatus.PENDING_REVIEW
    opportunities[0].moderated_at = None
    opportunities[0].created_at = datetime.now(UTC) - timedelta(days=2)
    opportunities[1].moderation_status = ModerationStatus.BLOCKED
    opportunities[1].moderated_at = datetime.now(UTC) - timedelta(days=1)
    opportunities[2].moderation_status = ModerationStatus.HIDDEN
    opportunities[2].moderated_at = datetime.now(UTC) - timedelta(hours=2)
    opportunities[3].moderation_status = ModerationStatus.APPROVED
    opportunities[3].moderated_at = datetime.now(UTC) - timedelta(hours=1)
    db_session.commit()

    response = client.get(
        "/api/v1/moderation/content-items",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["metrics"]["total_on_moderation"] == 3
    assert payload["metrics"]["in_queue"] >= 1
    assert payload["counts"]["all"] >= 4
    assert payload["items"]
    assert {"pending_review", "unpublished", "changes_requested"} & {
        item["status"] for item in payload["items"]
    }
    assert payload["items"][-1]["status"] == "approved"


def test_content_moderation_actions_update_status(client, db_session):
    curator = _create_curator(db_session, email="content-moderation-actions@example.com")
    access_token = _login(client, email=curator.email, password="CuratorPass123")
    opportunity = _create_content_item(db_session, title="Actionable content")
    opportunity.moderation_status = ModerationStatus.PENDING_REVIEW
    opportunity.moderated_at = None
    db_session.commit()

    request_changes_response = client.post(
        f"/api/v1/moderation/content-items/{opportunity.id}/request-changes",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"moderator_comment": "Нужно уточнить описание"},
    )
    assert request_changes_response.status_code == 200
    assert request_changes_response.json()["data"]["status"] == "changes_requested"

    approve_response = client.post(
        f"/api/v1/moderation/content-items/{opportunity.id}/approve",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"moderator_comment": "Можно публиковать"},
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["data"]["status"] == "approved"

    reject_response = client.post(
        f"/api/v1/moderation/content-items/{opportunity.id}/reject",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"moderator_comment": "Публикация отклонена"},
    )
    assert reject_response.status_code == 200
    assert reject_response.json()["data"]["status"] == "rejected"
