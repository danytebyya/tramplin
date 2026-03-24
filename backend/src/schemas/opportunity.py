from pydantic import BaseModel


class OpportunityPublicRead(BaseModel):
    id: str
    title: str
    company_name: str
    company_verified: bool
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


class OpportunityFeedResponse(BaseModel):
    items: list[OpportunityPublicRead]
