from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class OpportunityPublicRead(BaseModel):
    id: str
    title: str
    company_name: str
    company_verified: bool
    company_rating: float | None = None
    company_reviews_count: int = 0
    salary_label: str
    location_label: str
    format: str
    kind: str
    level_label: str
    employment_label: str
    description: str
    tags: list[str]
    latitude: float
    longitude: float
    accent: str
    business_status: str
    moderation_status: str


class OpportunityFeedResponse(BaseModel):
    items: list[OpportunityPublicRead]


class EmployerOpportunityUpsertRequest(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(min_length=10, max_length=10000)
    opportunity_type: str = Field(pattern="^(vacancy|internship|event|mentorship)$")
    city: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=2, max_length=500)
    salary_label: str = Field(min_length=1, max_length=255)
    tags: list[str] = Field(default_factory=list, max_length=20)
    format: str = Field(pattern="^(offline|hybrid|online)$")
    level_label: str | None = Field(default=None, max_length=120)
    employment_label: str | None = Field(default=None, max_length=120)
    event_type: str | None = Field(default=None, max_length=120)
    mentorship_direction: str | None = Field(default=None, max_length=120)
    mentor_experience: str | None = Field(default=None, max_length=120)
    planned_publish_at: datetime | None = None
    latitude: float
    longitude: float

    @field_validator(
        "title",
        "description",
        "city",
        "address",
        "salary_label",
        "level_label",
        "employment_label",
        "event_type",
        "mentorship_direction",
        "mentor_experience",
    )
    @classmethod
    def validate_trimmed_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        normalized_tags: list[str] = []
        seen_tags: set[str] = set()

        for item in value:
            normalized_item = item.strip()
            if not normalized_item:
                continue
            lowered = normalized_item.lower()
            if lowered in seen_tags:
                continue
            seen_tags.add(lowered)
            normalized_tags.append(normalized_item)

        return normalized_tags


class EmployerOpportunityRead(BaseModel):
    id: str
    title: str
    company_name: str
    author_email: str | None = None
    opportunity_type: str
    kind: str
    salary_label: str
    address: str
    city: str
    location_label: str
    tags: list[str]
    level_label: str
    employment_label: str
    format: str
    format_label: str
    description: str
    status: str
    moderation_comment: str | None = None
    submitted_at: str
    published_at: str | None = None
    active_until: str | None = None
    planned_publish_at: str | None = None
    latitude: float
    longitude: float
    responses_count: int = 0
    event_type: str | None = None
    mentorship_direction: str | None = None
    mentor_experience: str | None = None


class EmployerOpportunityListResponse(BaseModel):
    items: list[EmployerOpportunityRead]
