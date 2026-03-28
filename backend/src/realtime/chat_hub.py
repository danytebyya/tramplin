import asyncio
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket


class ChatHub:
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

    def is_user_online(self, user_id: str | UUID) -> bool:
        return bool(self._connections.get(str(user_id)))


chat_hub = ChatHub()
