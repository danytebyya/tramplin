import logging

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.core.security import TokenPayloadError, decode_token, ensure_token_type
from src.db import get_db
from src.enums import TokenType
from src.models import User
from src.realtime import notification_hub
from src.repositories import UserRepository
from src.services.notification_service import NotificationService
from src.utils.errors import AppError
from src.utils.responses import success_response

router = APIRouter(prefix="/notifications", tags=["notifications"])
logger = logging.getLogger(__name__)


def get_current_user_by_access_token(token: str, db: Session) -> User:
    try:
        payload = ensure_token_type(decode_token(token), TokenType.ACCESS)
    except TokenPayloadError as exc:
        logger.warning("notifications.stream.auth.invalid_token reason=%s", str(exc))
        raise AppError(code="AUTH_UNAUTHORIZED", message=str(exc), status_code=401) from exc

    user_id = payload.get("sub")
    if user_id is None:
        logger.warning("notifications.stream.auth.invalid_payload missing_sub=true")
        raise AppError(code="AUTH_UNAUTHORIZED", message="Некорректный токен доступа", status_code=401)

    user = UserRepository(db).get_by_id(user_id)
    if user is None:
        logger.warning("notifications.stream.auth.user_not_found user_id=%s", user_id)
        raise AppError(code="AUTH_UNAUTHORIZED", message="Пользователь не найден", status_code=401)

    return user


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


@router.post("/{notification_id}/hide", status_code=status.HTTP_200_OK)
def hide_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = NotificationService(db).hide(current_user, notification_id)
    return success_response(payload.model_dump(mode="json"))


@router.delete("", status_code=status.HTTP_200_OK)
def clear_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = NotificationService(db).clear_all(current_user)
    return success_response(payload.model_dump(mode="json"))


@router.websocket("/stream")
async def notifications_stream(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db),
) -> None:
    try:
        current_user = get_current_user_by_access_token(token, db)
    except AppError as exc:
        logger.warning("notifications.stream.reject code=%s", exc.code)
        await websocket.close(code=1008)
        return

    logger.info("notifications.stream.connect user_id=%s", current_user.id)
    await notification_hub.connect(current_user.id, websocket)
    try:
        while True:
            try:
                message = await websocket.receive()
            except RuntimeError as exc:
                if "disconnect message has been received" in str(exc):
                    break
                raise

            if message.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
    finally:
        logger.info("notifications.stream.disconnect user_id=%s", current_user.id)
        await notification_hub.disconnect(current_user.id, websocket)
