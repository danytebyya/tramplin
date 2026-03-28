from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from src.models import Application, ApplicationStatus, ModerationStatus, Opportunity, OpportunityStatus, OpportunityTag


class OpportunityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_public_feed(self) -> list[Opportunity]:
        now = datetime.now(UTC)
        stmt = (
            select(Opportunity)
            .where(
                Opportunity.deleted_at.is_(None),
                Opportunity.moderation_status == ModerationStatus.APPROVED,
                or_(
                    Opportunity.business_status == OpportunityStatus.ACTIVE,
                    and_(
                        Opportunity.business_status == OpportunityStatus.SCHEDULED,
                        Opportunity.starts_at.is_not(None),
                        Opportunity.starts_at <= now,
                    ),
                ),
            )
            .options(
                selectinload(Opportunity.employer),
                selectinload(Opportunity.location),
                selectinload(Opportunity.compensation),
                selectinload(Opportunity.tag_links).selectinload(OpportunityTag.tag),
            )
            .order_by(Opportunity.published_at.desc().nullslast(), Opportunity.created_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def list_by_employer_id(self, employer_id: str) -> list[Opportunity]:
        stmt = (
            select(Opportunity)
            .where(
                Opportunity.deleted_at.is_(None),
                Opportunity.employer_id == UUID(str(employer_id)),
            )
            .options(
                selectinload(Opportunity.employer),
                selectinload(Opportunity.location),
                selectinload(Opportunity.compensation),
                selectinload(Opportunity.tag_links).selectinload(OpportunityTag.tag),
            )
            .order_by(Opportunity.created_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_by_id(self, opportunity_id: str) -> Opportunity | None:
        stmt = (
            select(Opportunity)
            .where(
                Opportunity.deleted_at.is_(None),
                Opportunity.id == UUID(str(opportunity_id)),
            )
            .options(
                selectinload(Opportunity.employer),
                selectinload(Opportunity.location),
                selectinload(Opportunity.compensation),
                selectinload(Opportunity.tag_links).selectinload(OpportunityTag.tag),
            )
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def count(self) -> int:
        stmt = select(Opportunity.id)
        return len(self.db.execute(stmt).scalars().all())

    def exists_public_by_id(self, opportunity_id: str) -> bool:
        stmt = select(Opportunity.id).where(
            Opportunity.id == UUID(str(opportunity_id)),
            Opportunity.deleted_at.is_(None),
            Opportunity.business_status == OpportunityStatus.ACTIVE,
            Opportunity.moderation_status == ModerationStatus.APPROVED,
        )
        return self.db.execute(stmt).scalar_one_or_none() is not None

    def count_active_applications_by_opportunity_ids(self, opportunity_ids: list[str]) -> dict[str, int]:
        if not opportunity_ids:
            return {}

        stmt = (
            select(Application.opportunity_id, func.count(Application.id))
            .where(
                Application.deleted_at.is_(None),
                Application.opportunity_id.in_([UUID(str(item)) for item in opportunity_ids]),
                Application.status.not_in(
                    [
                        ApplicationStatus.WITHDRAWN,
                        ApplicationStatus.REJECTED,
                        ApplicationStatus.CANCELED,
                    ]
                ),
            )
            .group_by(Application.opportunity_id)
        )
        return {str(opportunity_id): count for opportunity_id, count in self.db.execute(stmt).all()}
