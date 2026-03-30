from pydantic import BaseModel, Field, field_validator


class ApplicationSubmitRequest(BaseModel):
    opportunity_id: str = Field(min_length=1)


class ApplicationSubmitRead(BaseModel):
    id: str
    opportunity_id: str
    applicant_user_id: str
    status: str
    submitted_at: str


class MyApplicationIdsResponse(BaseModel):
    opportunity_ids: list[str]


class EmployerApplicationStatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(new|accepted|reserve|rejected)$")
    employer_comment: str | None = Field(default=None, max_length=5000)
    interview_date: str | None = None
    interview_start_time: str | None = Field(default=None, max_length=16)
    interview_end_time: str | None = Field(default=None, max_length=16)
    interview_format: str | None = Field(default=None, max_length=255)
    meeting_link: str | None = Field(default=None, max_length=500)
    contact_email: str | None = Field(default=None, max_length=320)
    checklist: str | None = Field(default=None, max_length=5000)

    @field_validator(
        "employer_comment",
        "interview_date",
        "interview_start_time",
        "interview_end_time",
        "interview_format",
        "meeting_link",
        "contact_email",
        "checklist",
    )
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        return normalized or None


class ApplicationApplicantRead(BaseModel):
    user_id: str
    public_id: str | None = None
    display_name: str
    subtitle: str
    is_online: bool = False
    city: str
    salary_label: str
    format_label: str
    employment_label: str
    tags: list[str]


class ApplicationOpportunityRead(BaseModel):
    id: str
    title: str
    kind: str
    published_at: str | None = None


class ApplicationDetailsRead(BaseModel):
    id: str
    opportunity_id: str
    applicant_user_id: str
    status: str
    submitted_at: str
    status_changed_at: str
    employer_comment: str | None = None
    interview_date: str | None = None
    interview_start_time: str | None = None
    interview_end_time: str | None = None
    interview_format: str | None = None
    meeting_link: str | None = None
    contact_email: str | None = None
    checklist: str | None = None
    applicant: ApplicationApplicantRead | None = None
    opportunity: ApplicationOpportunityRead | None = None


class EmployerApplicationListResponse(BaseModel):
    items: list[ApplicationDetailsRead]


class MyApplicationsResponse(BaseModel):
    items: list[ApplicationDetailsRead]
