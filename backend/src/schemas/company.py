from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from src.enums import EmployerType, MembershipRole

EMPLOYER_STAFF_PERMISSION_KEYS = {
    "view_responses",
    "manage_opportunities",
    "manage_company_profile",
    "manage_staff",
    "access_chat",
}


class EmployerOnboardingRequest(BaseModel):
    employer_type: EmployerType
    company_name: str = Field(min_length=2, max_length=255)
    inn: str = Field(min_length=10, max_length=12)
    corporate_email: EmailStr
    website: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=32)
    social_link: str | None = Field(default=None, max_length=500)

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

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None

    @field_validator("social_link")
    @classmethod
    def validate_social_link(cls, value: str | None) -> str | None:
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


class EmployerVerificationDraftDocumentRead(BaseModel):
    id: str
    file_name: str
    file_size: int
    mime_type: str
    file_url: str | None = None


class EmployerVerificationDraftRead(BaseModel):
    verification_request_id: str | None = None
    website: str | None = None
    phone: str | None = None
    social_link: str | None = None
    documents: list[EmployerVerificationDraftDocumentRead]


class EmployerStaffMemberRead(BaseModel):
    id: str
    user_id: str
    email: str
    role: MembershipRole
    permissions: list[str]
    invited_at: str
    is_current_user: bool = False
    is_primary: bool = False


class EmployerStaffListRead(BaseModel):
    items: list[EmployerStaffMemberRead]


class EmployerStaffInviteRequest(BaseModel):
    email: EmailStr | None = None
    role: MembershipRole | None = None
    permissions: list[str] | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.lower().strip()

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None

        normalized_permissions: list[str] = []
        for item in value:
            normalized_item = item.strip()
            if normalized_item not in EMPLOYER_STAFF_PERMISSION_KEYS:
                raise ValueError("Указан неизвестный доступ сотрудника")
            if normalized_item not in normalized_permissions:
                normalized_permissions.append(normalized_item)

        if not normalized_permissions:
            raise ValueError("Нужно выбрать хотя бы один доступ сотрудника")
        return normalized_permissions

    @model_validator(mode="after")
    def validate_role_or_permissions(self) -> "EmployerStaffInviteRequest":
        if self.role is None and self.permissions is None:
            raise ValueError("Нужно указать роль или набор доступов сотрудника")
        return self


class EmployerStaffInvitationRead(BaseModel):
    id: str
    email: str | None = None
    role: MembershipRole
    permissions: list[str] = Field(default_factory=list)
    status: str
    invited_at: str
    expires_at: str
    invitation_url: str | None = None
    email_sent: bool = False


class EmployerStaffInvitationListRead(BaseModel):
    items: list[EmployerStaffInvitationRead]


class EmployerStaffInvitationAcceptRequest(BaseModel):
    token: str = Field(min_length=16, max_length=255)
