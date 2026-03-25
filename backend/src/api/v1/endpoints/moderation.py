from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.api.deps.auth import get_current_user
from src.db import get_db
from src.models import User
from src.repositories import ModerationRepository
from src.schemas.moderation import EmployerVerificationReviewRequest
from src.schemas.user import ModerationSettingsUpdateRequest
from src.services import ModerationService
from src.utils.responses import success_response

router = APIRouter(prefix="/moderation", tags=["moderation"])


@router.get("/dashboard", status_code=status.HTTP_200_OK)
def get_moderation_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    dashboard = ModerationService(ModerationRepository(db)).get_dashboard(current_user)
    return success_response(dashboard)


@router.get("/settings", status_code=status.HTTP_200_OK)
def get_moderation_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ModerationService(ModerationRepository(db)).get_settings(current_user)
    return success_response(payload.model_dump(mode="json"))


@router.get("/employer-verification-requests", status_code=status.HTTP_200_OK)
def list_employer_verification_requests(
    search: str | None = Query(default=None),
    statuses: list[str] | None = Query(default=None),
    period: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ModerationService(ModerationRepository(db)).list_employer_verification_requests(
        current_user,
        search=search,
        statuses=statuses,
        period=period,
        page=page,
        page_size=page_size,
    )
    return success_response(payload.model_dump(mode="json"))


@router.post("/employer-verification-requests/{request_id}/approve", status_code=status.HTTP_200_OK)
def approve_employer_verification_request(
    request_id: str,
    payload: EmployerVerificationReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response = ModerationService(ModerationRepository(db)).approve_employer_verification_request(
        current_user,
        request_id,
        payload,
    )
    return success_response(response.model_dump(mode="json"))


@router.post("/employer-verification-requests/{request_id}/reject", status_code=status.HTTP_200_OK)
def reject_employer_verification_request(
    request_id: str,
    payload: EmployerVerificationReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response = ModerationService(ModerationRepository(db)).reject_employer_verification_request(
        current_user,
        request_id,
        payload,
    )
    return success_response(response.model_dump(mode="json"))


@router.post("/employer-verification-requests/{request_id}/request-changes", status_code=status.HTTP_200_OK)
def request_employer_verification_changes(
    request_id: str,
    payload: EmployerVerificationReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response = ModerationService(ModerationRepository(db)).request_employer_verification_changes(
        current_user,
        request_id,
        payload,
    )
    return success_response(response.model_dump(mode="json"))


@router.put("/settings", status_code=status.HTTP_200_OK)
def update_moderation_settings(
    payload: ModerationSettingsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    settings = ModerationService(ModerationRepository(db)).update_settings(current_user, payload)
    return success_response(settings.model_dump(mode="json"))
