from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from src.enums.notifications import NotificationKind, NotificationSeverity


class NotificationRead(BaseModel):
    id: UUID
    kind: NotificationKind
    severity: NotificationSeverity
    title: str
    message: str
    action_label: str | None = None
    action_url: str | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationFeedResponse(BaseModel):
    items: list[NotificationRead]
    unread_count: int


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int
