from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from src.models import Notification


class NotificationRepository:
    _HIDDEN_SYSTEM_KEY = "welcome_suppressed"

    def __init__(self, db: Session) -> None:
        self.db = db

    def _is_hidden_system_notification(self, notification: Notification) -> bool:
        if not notification.payload:
            return False

        return notification.payload.get("system_key") == self._HIDDEN_SYSTEM_KEY

    def _filter_visible(self, notifications: list[Notification]) -> list[Notification]:
        return [
            notification
            for notification in notifications
            if not self._is_hidden_system_notification(notification)
        ]

    def add(self, notification: Notification) -> Notification:
        self.db.add(notification)
        return notification

    def has_any_for_user(self, user_id: str | UUID) -> bool:
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification.id).where(Notification.user_id == normalized_user_id).limit(1)
        return self.db.execute(stmt).scalar_one_or_none() is not None

    def has_notification_with_title(self, user_id: str | UUID, title: str) -> bool:
        normalized_user_id = UUID(str(user_id))
        stmt = (
            select(Notification.id)
            .where(Notification.user_id == normalized_user_id, Notification.title == title)
            .limit(1)
        )
        return self.db.execute(stmt).scalar_one_or_none() is not None

    def list_for_user(self, user_id: str | UUID, *, limit: int = 20) -> list[Notification]:
        normalized_user_id = UUID(str(user_id))
        stmt = (
            select(Notification)
            .where(Notification.user_id == normalized_user_id)
            .order_by(Notification.is_read.asc(), Notification.created_at.desc())
            .limit(limit + 10)
        )
        notifications = list(self.db.execute(stmt).scalars().all())
        return self._filter_visible(notifications)[:limit]

    def count_unread_for_user(self, user_id: str | UUID) -> int:
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(
            Notification.user_id == normalized_user_id,
            Notification.is_read.is_(False),
        )
        notifications = list(self.db.execute(stmt).scalars().all())
        return len(self._filter_visible(notifications))

    def get_by_id_for_user(self, notification_id: str | UUID, user_id: str | UUID) -> Notification | None:
        normalized_notification_id = UUID(str(notification_id))
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(
            Notification.id == normalized_notification_id,
            Notification.user_id == normalized_user_id,
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def mark_as_read(self, notification_id: str | UUID, user_id: str | UUID) -> None:
        normalized_notification_id = UUID(str(notification_id))
        normalized_user_id = UUID(str(user_id))
        stmt = (
            update(Notification)
            .where(
                Notification.id == normalized_notification_id,
                Notification.user_id == normalized_user_id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True, read_at=datetime.now(UTC))
        )
        self.db.execute(stmt)

    def mark_all_as_read(self, user_id: str | UUID) -> None:
        normalized_user_id = UUID(str(user_id))
        stmt = (
            update(Notification)
            .where(Notification.user_id == normalized_user_id, Notification.is_read.is_(False))
            .values(is_read=True, read_at=datetime.now(UTC))
        )
        self.db.execute(stmt)

    def delete_all_for_user(self, user_id: str | UUID) -> None:
        normalized_user_id = UUID(str(user_id))
        stmt = delete(Notification).where(Notification.user_id == normalized_user_id)
        self.db.execute(stmt)

    def has_welcome_suppressed_marker(self, user_id: str | UUID) -> bool:
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(Notification.user_id == normalized_user_id)
        notifications = list(self.db.execute(stmt).scalars().all())
        return any(self._is_hidden_system_notification(notification) for notification in notifications)
