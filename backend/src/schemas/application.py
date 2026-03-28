from pydantic import BaseModel, Field


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
