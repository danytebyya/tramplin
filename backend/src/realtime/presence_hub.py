import asyncio
from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID

from fastapi import WebSocket
from sqlalchemy.orm import Session

from src.models import User


class PresenceHub:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str | UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[str(user_id)].add(websocket)

        await self.publish_to_all(
            {
                "type": "presence_updated",
                "user_id": str(user_id),
                "is_online": True,
                "last_seen_at": None,
            }
        )

    async def disconnect(self, user_id: str | UUID, websocket: WebSocket, db: Session) -> None:
        is_now_offline = False

        async with self._lock:
            sockets = self._connections.get(str(user_id))
            if sockets is None:
                return

            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(str(user_id), None)
                is_now_offline = True

        if not is_now_offline:
            return

        last_seen_at = datetime.now(UTC)
        user = db.get(User, UUID(str(user_id)))
        if user is not None:
            user.last_seen_at = last_seen_at
            db.add(user)
            db.commit()

        await self.publish_to_all(
            {
                "type": "presence_updated",
                "user_id": str(user_id),
                "is_online": False,
                "last_seen_at": last_seen_at.isoformat(),
            }
        )

    async def publish_to_all(self, payload: dict) -> None:
        async with self._lock:
            connection_items = [
                (user_id, list(sockets))
                for user_id, sockets in self._connections.items()
            ]

        stale_sockets: list[tuple[str, WebSocket]] = []
        for owner_user_id, sockets in connection_items:
            for socket in sockets:
                try:
                    await socket.send_json(payload)
                except Exception:
                    stale_sockets.append((owner_user_id, socket))

        for owner_user_id, socket in stale_sockets:
            await self._cleanup_stale_socket(owner_user_id, socket)

    async def _cleanup_stale_socket(self, owner_user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(owner_user_id)
            if sockets is None:
                return

            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(owner_user_id, None)

    def is_user_online(self, user_id: str | UUID) -> bool:
        return bool(self._connections.get(str(user_id)))


presence_hub = PresenceHub()
