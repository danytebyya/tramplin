from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.db import get_db
from src.models import User
from src.services.notification_service import NotificationService
from src.utils.responses import success_response

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", status_code=status.HTTP_200_OK)
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = NotificationService(db).list_for_user(current_user)
    return success_response(payload.model_dump(mode="json"))


@router.get("/unread-count", status_code=status.HTTP_200_OK)
def get_unread_notifications_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = NotificationService(db).get_unread_count(current_user)
    return success_response(payload.model_dump(mode="json"))


@router.post("/{notification_id}/read", status_code=status.HTTP_200_OK)
def mark_notification_as_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = NotificationService(db).mark_as_read(current_user, notification_id)
    return success_response(payload.model_dump(mode="json"))


@router.post("/read-all", status_code=status.HTTP_200_OK)
def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = NotificationService(db).mark_all_as_read(current_user)
    return success_response(payload.model_dump(mode="json"))
