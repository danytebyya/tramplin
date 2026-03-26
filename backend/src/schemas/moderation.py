from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from src.enums.statuses import EmployerVerificationRequestStatus


class EmployerVerificationDocumentRead(BaseModel):
    id: str
    file_name: str
    file_size: int
    mime_type: str
    file_url: str | None = None


class EmployerVerificationRequestRead(BaseModel):
    id: str
    employer_name: str
    inn: str
    corporate_email: str | None = None
    website_url: str | None = None
    phone: str | None = None
    social_link: str | None = None
    employer_type: str
    submitted_at: str
    status: EmployerVerificationRequestStatus
    moderator_comment: str | None = None
    rejection_reason: str | None = None
    documents: list[EmployerVerificationDocumentRead]


class EmployerVerificationRequestListResponse(BaseModel):
    items: list[EmployerVerificationRequestRead]
    total: int
    page: int
    page_size: int


class EmployerVerificationReviewRequest(BaseModel):
    moderator_comment: str | None = Field(default=None, max_length=2000)

    @field_validator("moderator_comment")
    @classmethod
    def validate_moderator_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None


class CuratorManagementMetricsRead(BaseModel):
    total_curators: int
    online_curators: int
    queued_requests: int
    reviewed_today: int


class CuratorManagementItemRead(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    reviewed_today: int
    status: str
    last_activity_at: str | None = None


class CuratorManagementListResponse(BaseModel):
    metrics: CuratorManagementMetricsRead
    items: list[CuratorManagementItemRead]


class CuratorCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=180)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(admin|curator|junior)$")

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        normalized_value = value.strip()
        if len(normalized_value) < 2:
            raise ValueError("Полное имя должно содержать не менее 2 символов")
        return normalized_value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: EmailStr) -> str:
        return str(value).lower().strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        normalized_value = value.strip()
        if len(normalized_value) < 8:
            raise ValueError("Пароль должен содержать не менее 8 символов")
        if normalized_value.lower() == normalized_value or normalized_value.upper() == normalized_value:
            raise ValueError("Пароль должен содержать символы в разном регистре")
        if not any(character.isdigit() for character in normalized_value):
            raise ValueError("Пароль должен содержать хотя бы одну цифру")
        if not any(("a" <= character.lower() <= "z") for character in normalized_value):
            raise ValueError("Пароль должен содержать латинские буквы")
        return normalized_value
