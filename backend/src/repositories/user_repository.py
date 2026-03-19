from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_email(self, email: str) -> User | None:
        stmt = (
            select(User)
            .where(User.email == email)
            .options(
                selectinload(User.applicant_profile),
                selectinload(User.employer_profile),
                selectinload(User.curator_profile),
            )
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def get_by_id(self, user_id: str | UUID) -> User | None:
        normalized_id = UUID(str(user_id))
        stmt = (
            select(User)
            .where(User.id == normalized_id)
            .options(
                selectinload(User.applicant_profile),
                selectinload(User.employer_profile),
                selectinload(User.curator_profile),
            )
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def add(self, user: User) -> User:
        self.db.add(user)
        return user
