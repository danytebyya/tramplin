import asyncio
from collections import defaultdict
from collections.abc import Iterable
from uuid import UUID

import anyio
from fastapi import WebSocket
from sqlalchemy import event
from sqlalchemy.orm import Session


class NotificationHub:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str | UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[str(user_id)].add(websocket)

    async def disconnect(self, user_id: str | UUID, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(str(user_id))
            if sockets is None:
                return
            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(str(user_id), None)

    async def publish_to_users(self, user_ids: Iterable[str | UUID], payload: dict) -> None:
        for user_id in user_ids:
            await self.publish_to_user(user_id, payload)

    async def publish_to_user(self, user_id: str | UUID, payload: dict) -> None:
        async with self._lock:
            sockets = list(self._connections.get(str(user_id), set()))

        stale_sockets: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                stale_sockets.append(socket)

        for socket in stale_sockets:
            await self.disconnect(user_id, socket)

    def publish_to_users_sync(self, user_ids: Iterable[str | UUID], payload: dict) -> None:
        normalized_user_ids = [str(user_id) for user_id in user_ids]
        try:
            anyio.from_thread.run(self.publish_to_users, normalized_user_ids, payload)
            return
        except RuntimeError:
            pass

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        loop.create_task(self.publish_to_users(normalized_user_ids, payload))


notification_hub = NotificationHub()


@event.listens_for(Session, "after_commit")
def publish_pending_notifications_after_commit(session: Session) -> None:
    pending_notification_user_ids = session.info.pop("pending_notification_user_ids", set())
    if not pending_notification_user_ids:
        return

    notification_hub.publish_to_users_sync(
        pending_notification_user_ids,
        {"type": "notification_created"},
    )


@event.listens_for(Session, "after_rollback")
def clear_pending_notifications_after_rollback(session: Session) -> None:
    session.info.pop("pending_notification_user_ids", None)
