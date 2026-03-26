from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from src.enums import EmployerType, EmployerVerificationStatus, UserRole, UserStatus


class ApplicantProfileRead(BaseModel):
    full_name: str | None = None
    university: str | None = None
    graduation_year: int | None = None
    resume_url: str | None = None
    portfolio_url: str | None = None
    model_config = {"from_attributes": True}


class EmployerProfileRead(BaseModel):
    employer_type: EmployerType
    company_name: str
    inn: str
    corporate_email: EmailStr
    website: str | None = None
    verification_status: EmployerVerificationStatus
    moderator_comment: str | None = None
    model_config = {"from_attributes": True}


class CuratorProfileRead(BaseModel):
    full_name: str | None = None
    model_config = {"from_attributes": True}


class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    preferred_city: str | None = None
    role: UserRole
    status: UserStatus
    created_at: datetime
    applicant_profile: ApplicantProfileRead | None = None
    employer_profile: EmployerProfileRead | None = None
    curator_profile: CuratorProfileRead | None = None

    model_config = {"from_attributes": True}


class UserPreferredCityUpdateRequest(BaseModel):
    preferred_city: str


class NotificationPreferenceChannelRead(BaseModel):
    new_verification_requests: bool
    content_complaints: bool
    overdue_reviews: bool
    company_profile_changes: bool
    publication_changes: bool
    daily_digest: bool
    weekly_report: bool


class UserNotificationPreferencesRead(BaseModel):
    email_notifications: NotificationPreferenceChannelRead
    push_notifications: NotificationPreferenceChannelRead


class UserNotificationPreferencesUpdateRequest(UserNotificationPreferencesRead):
    pass


class ModerationSettingsRead(BaseModel):
    vacancy_review_hours: int
    internship_review_hours: int
    event_review_hours: int
    mentorship_review_hours: int


class ModerationSettingsUpdateRequest(ModerationSettingsRead):
    @field_validator(
        "vacancy_review_hours",
        "internship_review_hours",
        "event_review_hours",
        "mentorship_review_hours",
    )
    @classmethod
    def validate_hours(cls, value: int) -> int:
        if value < 1:
            raise ValueError("Срок проверки должен быть не меньше 1 часа")
        if value > 720:
            raise ValueError("Срок проверки должен быть не больше 720 часов")
        return value
