from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models import ModerationStatus, Tag


class TagRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_catalog(self) -> list[Tag]:
        stmt = (
            select(Tag)
            .where(
                Tag.deleted_at.is_(None),
                Tag.parent_id.is_(None),
                Tag.moderation_status == ModerationStatus.APPROVED,
            )
            .options(selectinload(Tag.children))
            .order_by(Tag.created_at.asc(), Tag.name.asc())
        )
        return list(self.db.execute(stmt).scalars().all())
