from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models import ModerationStatus, Opportunity, OpportunityStatus, OpportunityTag


class OpportunityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_public_feed(self) -> list[Opportunity]:
        stmt = (
            select(Opportunity)
            .where(
                Opportunity.deleted_at.is_(None),
                Opportunity.business_status == OpportunityStatus.ACTIVE,
                Opportunity.moderation_status == ModerationStatus.APPROVED,
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
