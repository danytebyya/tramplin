from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.exc import DataError, ProgrammingError
from sqlalchemy.orm import Session, selectinload

from src.enums import UserRole, UserStatus
from src.models import (
    CuratorProfile,
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
from src.models.opportunity import ModerationStatus, OpportunityTag
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
            .where(Opportunity.deleted_at.is_(None))
            .options(
                selectinload(Opportunity.employer),
                selectinload(Opportunity.location),
                selectinload(Opportunity.compensation),
                selectinload(Opportunity.tag_links).selectinload(OpportunityTag.tag),
            )
            .order_by(Opportunity.created_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_opportunity_by_id(self, opportunity_id: str) -> Opportunity | None:
        stmt = (
            select(Opportunity)
            .options(
                selectinload(Opportunity.employer),
                selectinload(Opportunity.location),
                selectinload(Opportunity.compensation),
                selectinload(Opportunity.tag_links).selectinload(OpportunityTag.tag),
            )
            .where(
                Opportunity.id == UUID(opportunity_id),
                Opportunity.deleted_at.is_(None),
            )
        )
        return self.db.execute(stmt).scalar_one_or_none()

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
        try:
            stmt = (
                select(User.id)
                .join(RefreshSession, RefreshSession.user_id == User.id)
                .where(
                    User.role.in_([UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN]),
                    User.status == UserStatus.ACTIVE,
                    RefreshSession.revoked_at.is_(None),
                    RefreshSession.expires_at > now,
                )
                .distinct()
            )
            return len(self.db.execute(stmt).scalars().all())
        except (ProgrammingError, DataError):
            self.db.rollback()
            stmt = (
                select(User.id)
                .join(RefreshSession, RefreshSession.user_id == User.id)
                .where(
                    User.role.in_([UserRole.CURATOR, UserRole.ADMIN]),
                    User.status == UserStatus.ACTIVE,
                    RefreshSession.revoked_at.is_(None),
                    RefreshSession.expires_at > now,
                )
                .distinct()
            )
            return len(self.db.execute(stmt).scalars().all())

    def list_curators(self) -> list[User]:
        try:
            stmt = (
                select(User)
                .options(selectinload(User.curator_profile))
                .where(
                    User.role.in_([UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN]),
                    User.status == UserStatus.ACTIVE,
                )
                .order_by(User.created_at.asc())
            )
            return list(self.db.execute(stmt).scalars().all())
        except (ProgrammingError, DataError):
            self.db.rollback()
            stmt = (
                select(User)
                .options(selectinload(User.curator_profile))
                .where(
                    User.role.in_([UserRole.CURATOR, UserRole.ADMIN]),
                    User.status == UserStatus.ACTIVE,
                )
                .order_by(User.created_at.asc())
            )
            return list(self.db.execute(stmt).scalars().all())

    def list_active_curator_session_rows(self, now: datetime) -> list[tuple[str, datetime]]:
        try:
            stmt = (
                select(RefreshSession.user_id, func.max(RefreshSession.created_at))
                .join(User, User.id == RefreshSession.user_id)
                .where(
                    User.role.in_([UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN]),
                    User.status == UserStatus.ACTIVE,
                    RefreshSession.revoked_at.is_(None),
                    RefreshSession.expires_at > now,
                )
                .group_by(RefreshSession.user_id)
            )
            return list(self.db.execute(stmt).all())
        except (ProgrammingError, DataError):
            self.db.rollback()
            stmt = (
                select(RefreshSession.user_id, func.max(RefreshSession.created_at))
                .join(User, User.id == RefreshSession.user_id)
                .where(
                    User.role.in_([UserRole.CURATOR, UserRole.ADMIN]),
                    User.status == UserStatus.ACTIVE,
                    RefreshSession.revoked_at.is_(None),
                    RefreshSession.expires_at > now,
                )
                .group_by(RefreshSession.user_id)
            )
            return list(self.db.execute(stmt).all())

    def get_user_by_email(self, email: str) -> User | None:
        stmt = select(User).where(func.lower(User.email) == email.lower())
        return self.db.execute(stmt).scalar_one_or_none()

    def get_curator_by_id(self, curator_id: str) -> User | None:
        stmt = (
            select(User)
            .options(selectinload(User.curator_profile))
            .where(User.id == UUID(curator_id))
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def create_curator(
        self,
        *,
        full_name: str,
        email: str,
        password_hash: str,
        role: UserRole,
    ) -> User:
        curator = User(
            email=email,
            display_name=full_name,
            password_hash=password_hash,
            role=role,
            status=UserStatus.ACTIVE,
            curator_profile=CuratorProfile(full_name=full_name),
        )
        self.db.add(curator)
        return curator

    def list_curators_by_ids(self, curator_ids: list[str]) -> list[User]:
        parsed_ids = [UUID(curator_id) for curator_id in curator_ids]
        stmt = (
            select(User)
            .options(selectinload(User.curator_profile))
            .where(User.id.in_(parsed_ids))
        )
        return list(self.db.execute(stmt).scalars().all())
