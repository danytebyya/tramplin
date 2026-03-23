from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

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
            raise ValueError("Название организации должно содержать минимум 2 символа")
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

    @model_validator(mode="after")
    def validate_inn_length_by_employer_type(self) -> "EmployerOnboardingRequest":
        expected_length = 12 if self.employer_type == EmployerType.SOLE_PROPRIETOR else 10
        if len(self.inn) != expected_length:
            if self.employer_type == EmployerType.SOLE_PROPRIETOR:
                raise ValueError("ИНН физического лица должен содержать 12 цифр")
            raise ValueError("ИНН организации должен содержать 10 цифр")
        return self


class EmployerInnVerificationRequest(BaseModel):
    employer_type: EmployerType | None = None
    inn: str

    @field_validator("inn")
    @classmethod
    def validate_inn(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value.isdigit() or len(normalized_value) not in {10, 12}:
            raise ValueError("ИНН должен содержать 10 или 12 цифр")
        return normalized_value

    @model_validator(mode="after")
    def validate_inn_length_by_employer_type(self) -> "EmployerInnVerificationRequest":
        if self.employer_type is None:
            return self

        expected_length = 12 if self.employer_type == EmployerType.SOLE_PROPRIETOR else 10
        if len(self.inn) != expected_length:
            if self.employer_type == EmployerType.SOLE_PROPRIETOR:
                raise ValueError("ИНН физического лица должен содержать 12 цифр")
            raise ValueError("ИНН организации должен содержать 10 цифр")
        return self
