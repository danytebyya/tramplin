from pydantic import BaseModel, EmailStr, Field, field_validator

from src.enums import EmployerType


class EmployerOnboardingRequest(BaseModel):
    employer_type: EmployerType
    company_name: str = Field(min_length=2, max_length=255)
    inn: str = Field(min_length=10, max_length=12)
    corporate_email: EmailStr
    website: str | None = Field(default=None, max_length=500)

    @field_validator("company_name")
    @classmethod
    def validate_company_name(cls, value: str) -> str:
        normalized_value = value.strip()
        if len(normalized_value) < 2:
            raise ValueError("Название компании должно содержать минимум 2 символа")
        return normalized_value

    @field_validator("inn")
    @classmethod
    def validate_inn(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value.isdigit() or len(normalized_value) not in {10, 12}:
            raise ValueError("ИНН должен содержать 10 или 12 цифр")
        return normalized_value

    @field_validator("website")
    @classmethod
    def validate_website(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None


class EmployerInnVerificationRequest(BaseModel):
    employer_type: EmployerType
    inn: str = Field(min_length=10, max_length=12)

    @field_validator("inn")
    @classmethod
    def validate_inn(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value.isdigit() or len(normalized_value) not in {10, 12}:
            raise ValueError("ИНН должен содержать 10 или 12 цифр")
        return normalized_value

    @field_validator("inn")
    @classmethod
    def validate_inn_length_by_employer_type(cls, value: str, info) -> str:
        employer_type = info.data.get("employer_type")
        if employer_type == EmployerType.SOLE_PROPRIETOR and len(value) != 10:
            raise ValueError("Для ИП ИНН должен содержать 10 цифр")
        if employer_type == EmployerType.COMPANY and len(value) != 12:
            raise ValueError("Для компании ИНН должен содержать 12 цифр")
        return value
