from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from src.enums import EmployerType, EmployerVerificationStatus, UserRole, UserStatus


class ApplicantProfileRead(BaseModel):
    full_name: str | None = None
    university: str | None = None
    about: str | None = None
    study_course: int | None = None
    graduation_year: int | None = None
    resume_url: str | None = None
    portfolio_url: str | None = None
    level: str | None = None
    desired_salary_from: int | None = None
    preferred_location: str | None = None
    employment_types: list[str] | None = None
    work_formats: list[str] | None = None
    hard_skills: list[str] | None = None
    soft_skills: list[str] | None = None
    languages: list[str] | None = None
    github_url: str | None = None
    gitlab_url: str | None = None
    bitbucket_url: str | None = None
    linkedin_url: str | None = None
    habr_url: str | None = None
    profile_views_count: int = 0
    recommendations_count: int = 0
    model_config = {"from_attributes": True}


class ApplicantDashboardStatsRead(BaseModel):
    profile_views_count: int = 0
    applications_count: int = 0
    responses_count: int = 0
    invitations_count: int = 0
    recommendations_count: int = 0


class ApplicantDashboardLinkSetRead(BaseModel):
    github_url: str | None = None
    gitlab_url: str | None = None
    bitbucket_url: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None
    habr_url: str | None = None
    resume_url: str | None = None


class ApplicantDashboardCareerInterestsRead(BaseModel):
    desired_salary_from: int | None = None
    preferred_city: str | None = None
    preferred_location: str | None = None
    employment_types: list[str] = []
    work_formats: list[str] = []


class ApplicantDashboardProjectRead(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    technologies: str | None = None
    period_label: str | None = None
    role_name: str | None = None
    repository_url: str | None = None
    model_config = {"from_attributes": True}


class ApplicantDashboardAchievementRead(BaseModel):
    id: UUID
    title: str
    event_name: str | None = None
    project_name: str | None = None
    award: str | None = None
    model_config = {"from_attributes": True}


class ApplicantDashboardCertificateRead(BaseModel):
    id: UUID
    title: str
    organization_name: str | None = None
    issued_at: str | None = None
    credential_url: str | None = None
    model_config = {"from_attributes": True}


class ApplicantDashboardRead(BaseModel):
    profile: ApplicantProfileRead
    preferred_city: str | None = None
    stats: ApplicantDashboardStatsRead
    links: ApplicantDashboardLinkSetRead
    career_interests: ApplicantDashboardCareerInterestsRead
    projects: list[ApplicantDashboardProjectRead]
    achievements: list[ApplicantDashboardAchievementRead]
    certificates: list[ApplicantDashboardCertificateRead]


class ApplicantDashboardProjectUpdateItem(BaseModel):
    id: UUID | None = None
    title: str = Field(min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=5000)
    technologies: str | None = Field(default=None, max_length=2000)
    period_label: str | None = Field(default=None, max_length=180)
    role_name: str | None = Field(default=None, max_length=180)
    repository_url: str | None = Field(default=None, max_length=500)


class ApplicantDashboardAchievementUpdateItem(BaseModel):
    id: UUID | None = None
    title: str = Field(min_length=1, max_length=180)
    event_name: str | None = Field(default=None, max_length=255)
    project_name: str | None = Field(default=None, max_length=255)
    award: str | None = Field(default=None, max_length=255)


class ApplicantDashboardCertificateUpdateItem(BaseModel):
    id: UUID | None = None
    title: str = Field(min_length=1, max_length=180)
    organization_name: str | None = Field(default=None, max_length=255)
    issued_at: str | None = None
    credential_url: str | None = Field(default=None, max_length=500)


class ApplicantDashboardLinksUpdateRequest(BaseModel):
    github_url: str | None = Field(default=None, max_length=500)
    gitlab_url: str | None = Field(default=None, max_length=500)
    bitbucket_url: str | None = Field(default=None, max_length=500)
    linkedin_url: str | None = Field(default=None, max_length=500)
    portfolio_url: str | None = Field(default=None, max_length=500)
    habr_url: str | None = Field(default=None, max_length=500)
    resume_url: str | None = Field(default=None, max_length=500)


class ApplicantDashboardCareerInterestsUpdateRequest(BaseModel):
    desired_salary_from: int | None = Field(default=None, ge=0)
    preferred_city: str | None = Field(default=None, max_length=120)
    preferred_location: str | None = Field(default=None, max_length=120)
    employment_types: list[str] = Field(default_factory=list)
    work_formats: list[str] = Field(default_factory=list)


class ApplicantDashboardUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=180)
    university: str | None = Field(default=None, max_length=180)
    about: str | None = Field(default=None, max_length=5000)
    study_course: int | None = Field(default=None, ge=1, le=5)
    graduation_year: int | None = Field(default=None, ge=2000, le=2100)
    level: str | None = Field(default=None, max_length=32)
    hard_skills: list[str] = Field(default_factory=list)
    soft_skills: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    links: ApplicantDashboardLinksUpdateRequest = Field(default_factory=ApplicantDashboardLinksUpdateRequest)
    career_interests: ApplicantDashboardCareerInterestsUpdateRequest = Field(
        default_factory=ApplicantDashboardCareerInterestsUpdateRequest
    )
    projects: list[ApplicantDashboardProjectUpdateItem] = Field(default_factory=list)
    achievements: list[ApplicantDashboardAchievementUpdateItem] = Field(default_factory=list)
    certificates: list[ApplicantDashboardCertificateUpdateItem] = Field(default_factory=list)

    @field_validator(
        "full_name",
        "university",
        "about",
        "level",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value):
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @field_validator("hard_skills", "soft_skills", "languages", mode="before")
    @classmethod
    def normalize_string_lists(cls, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("Ожидается список строк")
        result: list[str] = []
        for item in value:
            normalized = str(item).strip()
            if normalized:
                result.append(normalized)
        return result


class EmployerProfileRead(BaseModel):
    employer_type: EmployerType
    company_name: str
    inn: str
    corporate_email: EmailStr | None = None
    website: str | None = None
    phone: str | None = None
    social_link: str | None = None
    max_link: str | None = None
    rutube_link: str | None = None
    avatar_url: str | None = None
    short_description: str | None = None
    office_addresses: list[str] | None = None
    activity_areas: list[str] | None = None
    organization_size: str | None = None
    foundation_year: int | None = None
    profile_views_count: int = 0
    verification_status: EmployerVerificationStatus
    moderator_comment: str | None = None
    model_config = {"from_attributes": True}


class CuratorProfileRead(BaseModel):
    full_name: str | None = None
    model_config = {"from_attributes": True}


class UserPresenceRead(BaseModel):
    is_online: bool = False
    last_seen_at: datetime | None = None


class UserRead(BaseModel):
    id: UUID
    public_id: str | None = None
    email: EmailStr
    display_name: str
    preferred_city: str | None = None
    role: UserRole
    status: UserStatus
    created_at: datetime
    presence: UserPresenceRead
    applicant_profile: ApplicantProfileRead | None = None
    employer_profile: EmployerProfileRead | None = None
    curator_profile: CuratorProfileRead | None = None

    model_config = {"from_attributes": True}


class UserPreferredCityUpdateRequest(BaseModel):
    preferred_city: str


class UserUpdateRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Имя не может быть пустым")
        return normalized


class NotificationPreferenceChannelRead(BaseModel):
    new_verification_requests: bool
    content_complaints: bool
    overdue_reviews: bool
    company_profile_changes: bool
    publication_changes: bool
    chat_reminders: bool
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
