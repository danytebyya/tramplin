import logging

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_access_payload, get_current_user
from src.api.v1.endpoints.notifications import get_current_user_by_access_token
from src.db import get_db
from src.models import User
from src.realtime.chat_hub import chat_hub
from src.schemas.chat import (
    ChatConversationCreateRequest,
    ChatMessageCreateRequest,
    ChatMessageUpdateRequest,
    ChatUserKeyUpsertRequest,
)
from src.services.chat_service import ChatService
from src.utils.errors import AppError
from src.utils.responses import success_response

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


@router.get("/keys/me", status_code=status.HTTP_200_OK)
def get_my_chat_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).get_my_key(current_user)
    return success_response(payload.model_dump(mode="json") if payload else None)


@router.put("/keys/me", status_code=status.HTTP_200_OK)
def upsert_my_chat_key(
    body: ChatUserKeyUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).upsert_my_key(current_user, body)
    return success_response(payload.model_dump(mode="json"))


@router.get("/contacts", status_code=status.HTTP_200_OK)
def list_chat_contacts(
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).list_contacts(current_user, access_payload=access_payload)
    return success_response(payload.model_dump(mode="json"))


@router.get("/search", status_code=status.HTTP_200_OK)
def search_chat_contacts(
    q: str = Query(default=""),
    employer_id: str | None = Query(default=None),
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).search_contacts(
        current_user,
        q,
        employer_id=employer_id,
        access_payload=access_payload,
    )
    return success_response(payload.model_dump(mode="json"))


@router.get("/conversations", status_code=status.HTTP_200_OK)
def list_chat_conversations(
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).list_conversations(current_user, access_payload=access_payload)
    return success_response(payload.model_dump(mode="json"))


@router.post("/conversations", status_code=status.HTTP_200_OK)
def create_chat_conversation(
    body: ChatConversationCreateRequest,
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).create_conversation(current_user, body, access_payload=access_payload)
    return success_response(payload.model_dump(mode="json"))


@router.get("/conversations/{conversation_id}/messages", status_code=status.HTTP_200_OK)
def list_chat_messages(
    conversation_id: str,
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).list_messages(current_user, conversation_id, access_payload=access_payload)
    return success_response(payload.model_dump(mode="json"))


@router.post("/messages", status_code=status.HTTP_200_OK)
def send_chat_message(
    body: ChatMessageCreateRequest,
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).send_message(current_user, body, access_payload=access_payload)
    return success_response(payload.model_dump(mode="json"))


@router.put("/messages/{message_id}", status_code=status.HTTP_200_OK)
def update_chat_message(
    message_id: str,
    body: ChatMessageUpdateRequest,
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).update_message(current_user, message_id, body, access_payload=access_payload)
    return success_response(payload.model_dump(mode="json"))


@router.delete("/messages/{message_id}", status_code=status.HTTP_200_OK)
def delete_chat_message(
    message_id: str,
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).delete_message(current_user, message_id, access_payload=access_payload)
    return success_response(payload.model_dump(mode="json"))


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_200_OK)
def mark_chat_conversation_read(
    conversation_id: str,
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = ChatService(db).mark_conversation_read(current_user, conversation_id, access_payload=access_payload)
    return success_response(payload.model_dump(mode="json"))


@router.websocket("/stream")
async def chat_stream(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db),
) -> None:
    try:
        current_user = get_current_user_by_access_token(token, db)
    except AppError as exc:
        logger.warning("chat.stream.reject code=%s", exc.code)
        await websocket.close(code=1008)
        return

    logger.info("chat.stream.connect user_id=%s", current_user.id)
    await chat_hub.connect(current_user.id, websocket)
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
        logger.info("chat.stream.disconnect user_id=%s", current_user.id)
        await chat_hub.disconnect(current_user.id, websocket)
