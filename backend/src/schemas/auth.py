from pydantic import BaseModel, EmailStr, Field, field_validator

from src.enums import UserRole


class ApplicantRegistrationPayload(BaseModel):
    full_name: str | None = Field(default=None, max_length=180)
    university: str | None = Field(default=None, max_length=180)
    graduation_year: int | None = None


class EmployerRegistrationPayload(BaseModel):
    company_name: str = Field(min_length=2, max_length=255)
    inn: str = Field(min_length=10, max_length=12)
    corporate_email: EmailStr
    website: str | None = Field(default=None, max_length=500)

    @field_validator("inn")
    @classmethod
    def validate_inn(cls, value: str) -> str:
        if not value.isdigit() or len(value) not in {10, 12}:
            raise ValueError("INN must contain 10 or 12 digits")
        return value


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole
    applicant_profile: ApplicantRegistrationPayload | None = None
    employer_profile: EmployerRegistrationPayload | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict
