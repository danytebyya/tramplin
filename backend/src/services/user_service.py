from datetime import UTC, datetime

from sqlalchemy import delete, select

from src.utils.errors import AppError
from src.models import User
from src.models import (
    AuthLoginEvent,
    Employer,
    EmployerMembership,
    EmployerStaffInvitation,
    FavoriteOpportunity,
    Notification,
    Opportunity,
    RefreshSession,
    UserNotificationPreference,
)
from src.repositories.user_repository import UserRepository
from src.schemas.user import (
    UserNotificationPreferencesRead,
    UserNotificationPreferencesUpdateRequest,
    UserUpdateRequest,
)
from src.enums import MembershipRole, UserRole, UserStatus


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

    def update_profile(self, current_user: User, payload: UserUpdateRequest) -> User:
        normalized_email = payload.email.lower().strip()
        normalized_display_name = payload.display_name.strip()

        existing_user = self.user_repo.get_by_email(normalized_email, with_profiles=False)
        if existing_user is not None and str(existing_user.id) != str(current_user.id):
            raise AppError(
                code="USER_EMAIL_ALREADY_EXISTS",
                message="Пользователь с таким email уже существует.",
                status_code=409,
            )

        updated_user = self.user_repo.update_profile(
            current_user,
            email=normalized_email,
            display_name=normalized_display_name,
        )
        self.db.commit()
        self.db.refresh(updated_user)
        return updated_user

    def delete_account(self, current_user: User) -> None:
        now = datetime.now(UTC)
        current_user_with_profiles = self.user_repo.get_by_id(current_user.id, with_profiles=True)
        if current_user_with_profiles is None:
            raise AppError(
                code="USER_NOT_FOUND",
                message="Пользователь не найден.",
                status_code=404,
            )

        primary_owned_employer_ids = list(
            self.db.execute(
                select(EmployerMembership.employer_id).where(
                    EmployerMembership.user_id == current_user.id,
                    EmployerMembership.is_primary.is_(True),
                    EmployerMembership.membership_role == MembershipRole.OWNER,
                )
            ).scalars().all()
        )

        if primary_owned_employer_ids:
            has_other_staff = self.db.execute(
                select(EmployerMembership.id).where(
                    EmployerMembership.employer_id.in_(primary_owned_employer_ids),
                    EmployerMembership.user_id != current_user.id,
                )
            ).scalar_one_or_none()
            if has_other_staff is not None:
                raise AppError(
                    code="USER_DELETE_HAS_EMPLOYEES",
                    message="Удаление невозможно, пока в компании есть сотрудники.",
                    status_code=409,
                )

            self.db.execute(
                delete(EmployerStaffInvitation).where(
                    EmployerStaffInvitation.employer_id.in_(primary_owned_employer_ids)
                )
            )
            self.db.execute(
                delete(EmployerMembership).where(
                    EmployerMembership.employer_id.in_(primary_owned_employer_ids)
                )
            )

            owned_employers = list(
                self.db.execute(
                    select(Employer).where(Employer.id.in_(primary_owned_employer_ids))
                ).scalars().all()
            )
            for employer in owned_employers:
                employer.deleted_at = now
                self.db.add(employer)

            owned_opportunities = list(
                self.db.execute(
                    select(Opportunity).where(
                        Opportunity.employer_id.in_(primary_owned_employer_ids),
                        Opportunity.deleted_at.is_(None),
                    )
                ).scalars().all()
            )
            for opportunity in owned_opportunities:
                opportunity.deleted_at = now
                self.db.add(opportunity)

        self.db.execute(
            delete(EmployerStaffInvitation).where(
                EmployerStaffInvitation.invited_email == current_user.email,
                EmployerStaffInvitation.accepted_at.is_(None),
            )
        )
        self.db.execute(delete(EmployerMembership).where(EmployerMembership.user_id == current_user.id))
        self.db.execute(delete(Notification).where(Notification.user_id == current_user.id))
        self.db.execute(delete(FavoriteOpportunity).where(FavoriteOpportunity.user_id == current_user.id))
        self.db.execute(delete(UserNotificationPreference).where(UserNotificationPreference.user_id == current_user.id))
        self.db.execute(delete(RefreshSession).where(RefreshSession.user_id == current_user.id))
        self.db.execute(delete(AuthLoginEvent).where(AuthLoginEvent.user_id == current_user.id))

        if current_user_with_profiles.applicant_profile is not None:
            self.db.delete(current_user_with_profiles.applicant_profile)
        if current_user_with_profiles.employer_profile is not None:
            self.db.delete(current_user_with_profiles.employer_profile)
        if current_user_with_profiles.curator_profile is not None:
            self.db.delete(current_user_with_profiles.curator_profile)

        current_user_with_profiles.email = f"deleted-{current_user.id}@deleted.local"
        current_user_with_profiles.display_name = "Удаленный аккаунт"
        current_user_with_profiles.password_hash = "deleted"
        current_user_with_profiles.preferred_city = None
        current_user_with_profiles.status = UserStatus.ARCHIVED
        current_user_with_profiles.deleted_at = now
        self.db.add(current_user_with_profiles)

        self.db.commit()

    def get_notification_preferences(self, current_user: User) -> UserNotificationPreferencesRead:
        preferences = self.user_repo.get_notification_preferences(current_user.id)
        if preferences is None:
            preferences = self.user_repo.create_notification_preferences(current_user.id)
            self._apply_default_notification_preferences(preferences, current_user.role)
            self.db.commit()
            self.db.refresh(preferences)
        elif self._upgrade_legacy_notification_preferences(preferences, current_user.role):
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
            self._apply_default_notification_preferences(preferences, current_user.role)
        updated_preferences = self.user_repo.update_notification_preferences(
            preferences,
            email_notifications=payload.email_notifications.model_dump(),
            push_notifications=payload.push_notifications.model_dump(),
        )
        self.db.commit()
        self.db.refresh(updated_preferences)
        return self._serialize_notification_preferences(updated_preferences)

    @staticmethod
    def _apply_default_notification_preferences(preferences, role: UserRole) -> None:
        if role == UserRole.EMPLOYER:
            preferences.email_new_verification_requests = True
            preferences.email_content_complaints = False
            preferences.email_overdue_reviews = False
            preferences.email_company_profile_changes = True
            preferences.email_publication_changes = False
            preferences.email_daily_digest = False
            preferences.email_weekly_report = False
            preferences.push_new_verification_requests = True
            preferences.push_content_complaints = False
            preferences.push_overdue_reviews = False
            preferences.push_company_profile_changes = True
            preferences.push_publication_changes = False
            preferences.push_daily_digest = False
            preferences.push_weekly_report = False
            return

        if role not in {UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN}:
            return

        preferences.email_new_verification_requests = False
        preferences.email_content_complaints = False
        preferences.email_overdue_reviews = False
        preferences.email_company_profile_changes = False
        preferences.email_publication_changes = False
        preferences.email_daily_digest = False
        preferences.email_weekly_report = False
        preferences.push_new_verification_requests = False
        preferences.push_content_complaints = False
        preferences.push_overdue_reviews = False
        preferences.push_company_profile_changes = False
        preferences.push_publication_changes = False
        preferences.push_daily_digest = False
        preferences.push_weekly_report = False

    @classmethod
    def _upgrade_legacy_notification_preferences(cls, preferences, role: UserRole) -> bool:
        if role != UserRole.EMPLOYER:
            return False

        if not cls._matches_legacy_employer_defaults(preferences):
            return False

        cls._apply_default_notification_preferences(preferences, role)
        return True

    @staticmethod
    def _matches_legacy_employer_defaults(preferences) -> bool:
        return (
            preferences.email_new_verification_requests is True
            and preferences.email_content_complaints is False
            and preferences.email_overdue_reviews is False
            and preferences.email_company_profile_changes is False
            and preferences.email_publication_changes is False
            and preferences.email_daily_digest is False
            and preferences.email_weekly_report is False
            and preferences.push_new_verification_requests is True
            and preferences.push_content_complaints is False
            and preferences.push_overdue_reviews is False
            and preferences.push_company_profile_changes is False
            and preferences.push_publication_changes is False
            and preferences.push_daily_digest is False
            and preferences.push_weekly_report is False
        )

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
