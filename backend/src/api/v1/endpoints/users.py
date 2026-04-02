import logging

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from src.api.serializers.user import serialize_user
from src.api.deps import get_current_user
from src.db import get_db
from src.models import User
from src.schemas.auth import RegisterRequest
from src.schemas.user import (
    ApplicantDashboardUpdateRequest,
    UserNotificationPreferencesUpdateRequest,
    UserPreferredCityUpdateRequest,
    UserUpdateRequest,
)
from src.services import AuthService, UserService
from src.utils.responses import success_response

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    logger.info(
        "auth.register.request email=%s role=%s",
        payload.email.lower(),
        payload.role.value,
    )
    user = AuthService(db).register(payload)
    logger.info(
        "auth.register.success email=%s user_id=%s role=%s",
        user.email,
        user.id,
        user.role.value,
    )
    return success_response({"user": serialize_user(user)})


@router.get("/me", status_code=status.HTTP_200_OK)
def read_me(current_user: User = Depends(get_current_user)) -> dict:
    return success_response({"user": serialize_user(current_user)})


@router.get("/public/{public_id}", status_code=status.HTTP_200_OK)
def read_public_profile(public_id: str, db: Session = Depends(get_db)) -> dict:
    payload = UserService(db).get_public_profile(public_id)
    return success_response(payload.model_dump(mode="json"))


@router.put("/me", status_code=status.HTTP_200_OK)
def update_me(
    payload: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user = UserService(db).update_profile(current_user, payload)
    return success_response({"user": serialize_user(user)})


@router.put("/me/preferred-city", status_code=status.HTTP_200_OK)
def update_preferred_city(
    payload: UserPreferredCityUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user = UserService(db).update_preferred_city(current_user, payload.preferred_city)
    return success_response({"user": serialize_user(user)})


@router.get("/me/applicant-dashboard", status_code=status.HTTP_200_OK)
def read_applicant_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = UserService(db).get_applicant_dashboard(current_user)
    return success_response(payload.model_dump(mode="json"))


@router.put("/me/applicant-dashboard", status_code=status.HTTP_200_OK)
def update_applicant_dashboard(
    payload: ApplicantDashboardUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response = UserService(db).update_applicant_dashboard(current_user, payload)
    return success_response(response.model_dump(mode="json"))


@router.post("/me/applicant-avatar", status_code=status.HTTP_200_OK)
async def upload_applicant_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    content = await file.read()
    user = UserService(db).upload_applicant_avatar(
        current_user=current_user,
        original_filename=file.filename or "avatar",
        mime_type=file.content_type or "application/octet-stream",
        content=content,
    )
    return success_response({"user": serialize_user(user)})


@router.delete("/me/applicant-avatar", status_code=status.HTTP_200_OK)
def delete_applicant_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user = UserService(db).delete_applicant_avatar(current_user=current_user)
    return success_response({"user": serialize_user(user)})


@router.get("/me/notification-preferences", status_code=status.HTTP_200_OK)
def read_notification_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = UserService(db).get_notification_preferences(current_user)
    return success_response(payload.model_dump(mode="json"))


@router.put("/me/notification-preferences", status_code=status.HTTP_200_OK)
def update_notification_preferences(
    payload: UserNotificationPreferencesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    preferences = UserService(db).update_notification_preferences(current_user, payload)
    return success_response(preferences.model_dump(mode="json"))


@router.delete("/me", status_code=status.HTTP_200_OK)
def delete_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    UserService(db).delete_account(current_user)
    return success_response({"deleted": True})
