from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr

from src.enums import EmployerVerificationStatus, UserRole, UserStatus


class ApplicantProfileRead(BaseModel):
    full_name: str | None = None
    university: str | None = None
    graduation_year: int | None = None
    resume_url: str | None = None
    portfolio_url: str | None = None
    model_config = {"from_attributes": True}


class EmployerProfileRead(BaseModel):
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
    role: UserRole
    status: UserStatus
    created_at: datetime
    applicant_profile: ApplicantProfileRead | None = None
    employer_profile: EmployerProfileRead | None = None
    curator_profile: CuratorProfileRead | None = None

    model_config = {"from_attributes": True}
