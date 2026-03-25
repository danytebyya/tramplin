from src.models import User
from src.repositories.user_repository import UserRepository
from src.schemas.user import UserNotificationPreferencesRead, UserNotificationPreferencesUpdateRequest


class UserService:
    def __init__(self, db) -> None:
        self.db = db
        self.user_repo = UserRepository(db)

    def update_preferred_city(self, current_user: User, preferred_city: str) -> User:
        normalized_city = preferred_city.strip()
        updated_user = self.user_repo.update_preferred_city(current_user, normalized_city)
        self.db.commit()
        self.db.refresh(updated_user)
        return updated_user

    def get_notification_preferences(self, current_user: User) -> UserNotificationPreferencesRead:
        preferences = self.user_repo.get_notification_preferences(current_user.id)
        if preferences is None:
            preferences = self.user_repo.create_notification_preferences(current_user.id)
            self.db.commit()
            self.db.refresh(preferences)
        return self._serialize_notification_preferences(preferences)

    def update_notification_preferences(
        self,
        current_user: User,
        payload: UserNotificationPreferencesUpdateRequest,
    ) -> UserNotificationPreferencesRead:
        preferences = self.user_repo.get_notification_preferences(current_user.id)
        if preferences is None:
            preferences = self.user_repo.create_notification_preferences(current_user.id)
        updated_preferences = self.user_repo.update_notification_preferences(
            preferences,
            email_notifications=payload.email_notifications.model_dump(),
            push_notifications=payload.push_notifications.model_dump(),
        )
        self.db.commit()
        self.db.refresh(updated_preferences)
        return self._serialize_notification_preferences(updated_preferences)

    @staticmethod
    def _serialize_notification_preferences(preferences) -> UserNotificationPreferencesRead:
        return UserNotificationPreferencesRead.model_validate(
            {
                "email_notifications": {
                    "new_verification_requests": preferences.email_new_verification_requests,
                    "content_complaints": preferences.email_content_complaints,
                    "overdue_reviews": preferences.email_overdue_reviews,
                    "company_profile_changes": preferences.email_company_profile_changes,
                    "publication_changes": preferences.email_publication_changes,
                    "daily_digest": preferences.email_daily_digest,
                    "weekly_report": preferences.email_weekly_report,
                },
                "push_notifications": {
                    "new_verification_requests": preferences.push_new_verification_requests,
                    "content_complaints": preferences.push_content_complaints,
                    "overdue_reviews": preferences.push_overdue_reviews,
                    "company_profile_changes": preferences.push_company_profile_changes,
                    "publication_changes": preferences.push_publication_changes,
                    "daily_digest": preferences.push_daily_digest,
                    "weekly_report": preferences.push_weekly_report,
                },
            }
        )
