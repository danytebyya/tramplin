from pydantic import BaseModel


class SuccessEnvelope(BaseModel):
    success: bool = True
    data: dict


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict = {}


class ErrorEnvelope(BaseModel):
    success: bool = False
    error: ErrorBody
