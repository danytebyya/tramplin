from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from src.enums import UserRole


class ApplicantRegistrationPayload(BaseModel):
    full_name: str | None = Field(default=None, max_length=180)
    university: str | None = Field(default=None, max_length=180)
    graduation_year: int | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    verification_code: str = Field()
    role: UserRole
    applicant_profile: ApplicantRegistrationPayload | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        normalized_value = value.strip()
        if len(normalized_value) < 2:
            raise ValueError("Имя профиля должно содержать минимум 2 символа")
        return normalized_value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Пароль должен содержать минимум 8 символов")
        if any(char.isspace() for char in value):
            raise ValueError("Пароль не должен содержать пробелы")
        if not any(char.islower() for char in value):
            raise ValueError("Пароль должен содержать строчные буквы")
        if not any(char.isupper() for char in value):
            raise ValueError("Пароль должен содержать заглавные буквы")
        if not any(char.isdigit() for char in value):
            raise ValueError("Пароль должен содержать цифры")
        return value

    @field_validator("verification_code")
    @classmethod
    def validate_verification_code(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value.isdigit() or len(normalized_value) != 6:
            raise ValueError("Код подтверждения должен содержать 6 цифр")
        return normalized_value

    @model_validator(mode="after")
    def validate_profiles(self) -> "RegisterRequest":
        if self.role == UserRole.APPLICANT and self.applicant_profile is None:
            raise ValueError("Для регистрации соискателя требуется профиль соискателя")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Пароль должен содержать минимум 8 символов")
        if any(char.isspace() for char in value):
            raise ValueError("Пароль не должен содержать пробелы")
        return value


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class EmailCheckRequest(BaseModel):
    email: EmailStr


class EmailCheckResponse(BaseModel):
    exists: bool


class VerificationCodeRequest(BaseModel):
    email: EmailStr
    force_resend: bool = False


class VerificationCodeVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field()

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value.isdigit() or len(normalized_value) != 6:
            raise ValueError("Код подтверждения должен содержать 6 цифр")
        return normalized_value


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict
