from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.models import EmployerProfile, User, UserNotificationPreference


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

    def update_preferred_city(self, user: User, preferred_city: str) -> User:
        user.preferred_city = preferred_city
        self.db.add(user)
        return user

    def has_employer_profile(self, user_id: str | UUID) -> bool:
        normalized_id = UUID(str(user_id))
        stmt = select(EmployerProfile.user_id).where(EmployerProfile.user_id == normalized_id)
        return self.db.execute(stmt).scalar_one_or_none() is not None

    def get_notification_preferences(
        self, user_id: str | UUID
    ) -> UserNotificationPreference | None:
        normalized_id = UUID(str(user_id))
        stmt = select(UserNotificationPreference).where(UserNotificationPreference.user_id == normalized_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def create_notification_preferences(self, user_id: str | UUID) -> UserNotificationPreference:
        preferences = UserNotificationPreference(user_id=UUID(str(user_id)))
        self.db.add(preferences)
        return preferences

    def update_notification_preferences(
        self,
        preferences: UserNotificationPreference,
        *,
        email_notifications: dict[str, bool],
        push_notifications: dict[str, bool],
    ) -> UserNotificationPreference:
        preferences.email_new_verification_requests = email_notifications["new_verification_requests"]
        preferences.email_content_complaints = email_notifications["content_complaints"]
        preferences.email_overdue_reviews = email_notifications["overdue_reviews"]
        preferences.email_company_profile_changes = email_notifications["company_profile_changes"]
        preferences.email_publication_changes = email_notifications["publication_changes"]
        preferences.email_daily_digest = email_notifications["daily_digest"]
        preferences.email_weekly_report = email_notifications["weekly_report"]
        preferences.push_new_verification_requests = push_notifications["new_verification_requests"]
        preferences.push_content_complaints = push_notifications["content_complaints"]
        preferences.push_overdue_reviews = push_notifications["overdue_reviews"]
        preferences.push_company_profile_changes = push_notifications["company_profile_changes"]
        preferences.push_publication_changes = push_notifications["publication_changes"]
        preferences.push_daily_digest = push_notifications["daily_digest"]
        preferences.push_weekly_report = push_notifications["weekly_report"]
        self.db.add(preferences)
        return preferences

    @staticmethod
    def _with_profiles(stmt):
        return stmt.options(
            selectinload(User.applicant_profile),
            selectinload(User.employer_profile),
            selectinload(User.curator_profile),
        )
