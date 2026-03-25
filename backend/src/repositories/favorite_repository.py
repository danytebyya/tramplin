from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models import FavoriteOpportunity


class FavoriteRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_opportunity_ids_by_user_id(self, user_id: str) -> list[str]:
        stmt = (
            select(FavoriteOpportunity.opportunity_id)
            .where(FavoriteOpportunity.user_id == UUID(str(user_id)))
            .order_by(FavoriteOpportunity.created_at.desc())
        )
        return [str(opportunity_id) for opportunity_id in self.db.execute(stmt).scalars().all()]

    def get_opportunity(self, user_id: str, opportunity_id: str) -> FavoriteOpportunity | None:
        stmt = select(FavoriteOpportunity).where(
            FavoriteOpportunity.user_id == UUID(str(user_id)),
            FavoriteOpportunity.opportunity_id == UUID(str(opportunity_id)),
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def add_opportunity(self, user_id: str, opportunity_id: str) -> FavoriteOpportunity:
        favorite = FavoriteOpportunity(
            user_id=UUID(str(user_id)),
            opportunity_id=UUID(str(opportunity_id)),
        )
        self.db.add(favorite)
        self.db.commit()
        self.db.refresh(favorite)
        return favorite

    def remove_opportunity(self, favorite: FavoriteOpportunity) -> None:
        self.db.delete(favorite)
        self.db.commit()
