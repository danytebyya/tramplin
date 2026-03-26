from datetime import datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from src.enums import UserRole, UserStatus
from src.models import (
    Employer,
    EmployerProfile,
    EmployerVerificationDocument,
    EmployerVerificationRequest,
    ModerationSettings,
    Notification,
    Opportunity,
    RefreshSession,
    User,
)
from src.enums.notifications import NotificationKind
from src.models.opportunity import ModerationStatus
class ModerationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_verification_requests(self) -> list[EmployerVerificationRequest]:
        stmt = (
            select(EmployerVerificationRequest)
            .options(
                selectinload(EmployerVerificationRequest.employer),
                selectinload(EmployerVerificationRequest.documents).selectinload(
                    EmployerVerificationDocument.media_file
                ),
            )
            .order_by(EmployerVerificationRequest.submitted_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def list_employer_profiles(self) -> list[EmployerProfile]:
        stmt = select(EmployerProfile)
        return list(self.db.execute(stmt).scalars().all())

    def get_verification_request_by_id(self, request_id: str) -> EmployerVerificationRequest | None:
        stmt = (
            select(EmployerVerificationRequest)
            .options(
                selectinload(EmployerVerificationRequest.employer),
                selectinload(EmployerVerificationRequest.documents).selectinload(
                    EmployerVerificationDocument.media_file
                ),
            )
            .where(EmployerVerificationRequest.id == UUID(request_id))
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def list_opportunities(self) -> list[Opportunity]:
        stmt = (
            select(Opportunity)
            .options(selectinload(Opportunity.employer))
            .order_by(Opportunity.created_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def list_employers(self) -> list[Employer]:
        stmt = select(Employer)
        return list(self.db.execute(stmt).scalars().all())

    def list_notifications_by_kind(self, kind: NotificationKind) -> list[Notification]:
        stmt = (
            select(Notification)
            .where(Notification.kind == kind)
            .order_by(Notification.created_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_settings(self) -> ModerationSettings | None:
        stmt = select(ModerationSettings).limit(1)
        return self.db.execute(stmt).scalar_one_or_none()

    def create_settings(self) -> ModerationSettings:
        settings = ModerationSettings()
        self.db.add(settings)
        return settings

    def update_settings(
        self,
        settings: ModerationSettings,
        *,
        vacancy_review_hours: int,
        internship_review_hours: int,
        event_review_hours: int,
        mentorship_review_hours: int,
        updated_by_user_id: str | None,
    ) -> ModerationSettings:
        settings.vacancy_review_hours = vacancy_review_hours
        settings.internship_review_hours = internship_review_hours
        settings.event_review_hours = event_review_hours
        settings.mentorship_review_hours = mentorship_review_hours
        settings.updated_by_user_id = updated_by_user_id
        self.db.add(settings)
        return settings

    def count_online_curators(self, now: datetime) -> int:
        stmt = (
            select(User.id)
            .join(RefreshSession, RefreshSession.user_id == User.id)
            .where(
                User.role == UserRole.CURATOR,
                User.status == UserStatus.ACTIVE,
                RefreshSession.revoked_at.is_(None),
                RefreshSession.expires_at > now,
            )
            .distinct()
        )
        return len(self.db.execute(stmt).scalars().all())
