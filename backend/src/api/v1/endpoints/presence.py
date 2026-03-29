import logging

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from src.api.v1.endpoints.notifications import get_current_user_by_access_token
from src.db import get_db
from src.realtime import presence_hub
from src.utils.errors import AppError

router = APIRouter(prefix="/presence", tags=["presence"])
logger = logging.getLogger(__name__)


@router.websocket("/stream")
async def presence_stream(
    websocket: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db),
) -> None:
    try:
        current_user = get_current_user_by_access_token(token, db)
    except AppError as exc:
        logger.warning("presence.stream.reject code=%s", exc.code)
        await websocket.close(code=1008)
        return
    finally:
        db.close()

    logger.info("presence.stream.connect user_id=%s", current_user.id)
    await presence_hub.connect(current_user.id, websocket)
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
        logger.info("presence.stream.disconnect user_id=%s", current_user.id)
        await presence_hub.disconnect(current_user.id, websocket, db)
        db.close()
