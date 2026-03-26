from datetime import datetime

from pydantic import BaseModel, Field, field_validator

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
