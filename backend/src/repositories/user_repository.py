from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models import EmployerProfile, User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_email(self, email: str, *, with_profiles: bool = True) -> User | None:
        stmt = select(User).where(User.email == email)
        if with_profiles:
            stmt = self._with_profiles(stmt)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_by_id(self, user_id: str | UUID, *, with_profiles: bool = True) -> User | None:
        normalized_id = UUID(str(user_id))
        stmt = select(User).where(User.id == normalized_id)
        if with_profiles:
            stmt = self._with_profiles(stmt)
        return self.db.execute(stmt).scalar_one_or_none()

    def add(self, user: User) -> User:
        self.db.add(user)
        return user

    def has_employer_profile(self, user_id: str | UUID) -> bool:
        normalized_id = UUID(str(user_id))
        stmt = select(EmployerProfile.user_id).where(EmployerProfile.user_id == normalized_id)
        return self.db.execute(stmt).scalar_one_or_none() is not None

    @staticmethod
    def _with_profiles(stmt):
        return stmt.options(
            selectinload(User.applicant_profile),
            selectinload(User.employer_profile),
            selectinload(User.curator_profile),
        )
