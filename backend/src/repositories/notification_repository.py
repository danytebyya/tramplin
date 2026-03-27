from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from src.models import Notification


class NotificationRepository:
    _HIDDEN_SYSTEM_KEY = "welcome_suppressed"
    _DISMISSED_NOTIFICATION_KEY = "dismissed_notification"

    def __init__(self, db: Session) -> None:
        self.db = db

    def _is_hidden_system_notification(self, notification: Notification) -> bool:
        if not notification.payload:
            return False

        return notification.payload.get("system_key") == self._HIDDEN_SYSTEM_KEY

    def _is_dismissed_notification_marker(self, notification: Notification) -> bool:
        if not notification.payload:
            return False

        return notification.payload.get("system_key") == self._DISMISSED_NOTIFICATION_KEY

    @staticmethod
    def _normalize_profile_scope(profile_scope: dict | None) -> dict | None:
        if not profile_scope:
            return None

        return {
            key: value
            for key, value in profile_scope.items()
            if value is not None
        } or None

    def _matches_profile_scope(self, notification: Notification, profile_scope: dict | None) -> bool:
        normalized_scope = self._normalize_profile_scope(profile_scope)
        notification_scope = self._normalize_profile_scope((notification.payload or {}).get("profile_scope"))

        if notification_scope is None:
            return True

        if normalized_scope is None:
            return False

        if notification_scope.get("profile_role") != normalized_scope.get("profile_role"):
            return False

        if notification_scope.get("membership_id") is not None:
            return notification_scope.get("membership_id") == normalized_scope.get("membership_id")

        if notification_scope.get("employer_id") is not None:
            return notification_scope.get("employer_id") == normalized_scope.get("employer_id")

        return True

    def _filter_visible(self, notifications: list[Notification]) -> list[Notification]:
        return [
            notification
            for notification in notifications
            if not self._is_hidden_system_notification(notification)
            and not self._is_dismissed_notification_marker(notification)
            and not notification.is_hidden
        ]

    def add(self, notification: Notification) -> Notification:
        self.db.add(notification)
        return notification

    def has_any_for_user(self, user_id: str | UUID, *, profile_scope: dict | None = None) -> bool:
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(Notification.user_id == normalized_user_id)
        notifications = list(self.db.execute(stmt).scalars().all())
        return any(
            self._matches_profile_scope(notification, profile_scope)
            and not self._is_hidden_system_notification(notification)
            and not self._is_dismissed_notification_marker(notification)
            for notification in notifications
        )

    def has_notification_with_title(self, user_id: str | UUID, title: str, *, profile_scope: dict | None = None) -> bool:
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(Notification.user_id == normalized_user_id, Notification.title == title)
        notifications = list(self.db.execute(stmt).scalars().all())
        return any(
            not notification.is_hidden and self._matches_profile_scope(notification, profile_scope)
            for notification in notifications
        )

    def list_for_user(self, user_id: str | UUID, *, profile_scope: dict | None = None, limit: int = 20) -> list[Notification]:
        normalized_user_id = UUID(str(user_id))
        stmt = (
            select(Notification)
            .where(Notification.user_id == normalized_user_id)
            .order_by(Notification.is_read.asc(), Notification.created_at.desc())
            .limit(limit + 10)
        )
        notifications = list(self.db.execute(stmt).scalars().all())
        return [
            notification
            for notification in self._filter_visible(notifications)
            if self._matches_profile_scope(notification, profile_scope)
        ][:limit]

    def count_unread_for_user(self, user_id: str | UUID, *, profile_scope: dict | None = None) -> int:
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(
            Notification.user_id == normalized_user_id,
            Notification.is_read.is_(False),
        )
        notifications = list(self.db.execute(stmt).scalars().all())
        return len(
            [
                notification
                for notification in self._filter_visible(notifications)
                if self._matches_profile_scope(notification, profile_scope)
            ]
        )

    def get_by_id_for_user(
        self,
        notification_id: str | UUID,
        user_id: str | UUID,
        *,
        profile_scope: dict | None = None,
    ) -> Notification | None:
        normalized_notification_id = UUID(str(notification_id))
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(
            Notification.id == normalized_notification_id,
            Notification.user_id == normalized_user_id,
        )
        notification = self.db.execute(stmt).scalar_one_or_none()
        if notification is None or not self._matches_profile_scope(notification, profile_scope):
            return None
        return notification

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

    def hide(self, notification_id: str | UUID, user_id: str | UUID, *, profile_scope: dict | None = None) -> None:
        notification = self.get_by_id_for_user(notification_id, user_id, profile_scope=profile_scope)
        if notification is None:
            return

        signature = self.build_notification_signature(notification)
        self.db.delete(notification)
        self.add(
            Notification(
                user_id=notification.user_id,
                kind=notification.kind,
                severity=notification.severity,
                title="__dismissed_notification__",
                message="Dismissed notification marker.",
                is_read=True,
                read_at=datetime.now(UTC),
                is_hidden=True,
                hidden_at=datetime.now(UTC),
                payload={
                    "system_key": self._DISMISSED_NOTIFICATION_KEY,
                    "notification_signature": signature,
                    "profile_scope": self._normalize_profile_scope(profile_scope),
                },
            )
        )

    def delete_all_for_user(self, user_id: str | UUID, *, profile_scope: dict | None = None) -> None:
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(Notification.user_id == normalized_user_id)
        notifications = list(self.db.execute(stmt).scalars().all())
        for notification in notifications:
            if self._matches_profile_scope(notification, profile_scope):
                self.db.delete(notification)

    def has_welcome_suppressed_marker(self, user_id: str | UUID, *, profile_scope: dict | None = None) -> bool:
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(Notification.user_id == normalized_user_id)
        notifications = list(self.db.execute(stmt).scalars().all())
        return any(
            self._is_hidden_system_notification(notification)
            and self._matches_profile_scope(notification, profile_scope)
            for notification in notifications
        )

    def has_dismissed_signature(self, user_id: str | UUID, signature: str, *, profile_scope: dict | None = None) -> bool:
        normalized_user_id = UUID(str(user_id))
        stmt = select(Notification).where(Notification.user_id == normalized_user_id)
        notifications = list(self.db.execute(stmt).scalars().all())
        return any(
            notification.payload
            and notification.payload.get("system_key") == self._DISMISSED_NOTIFICATION_KEY
            and notification.payload.get("notification_signature") == signature
            and self._matches_profile_scope(notification, profile_scope)
            for notification in notifications
        )

    @staticmethod
    def build_notification_signature(notification: Notification) -> str:
        payload = notification.payload or {}
        relevant_payload = {
            key: value
            for key, value in payload.items()
            if key not in {"created_at", "updated_at"}
        }
        return (
            f"{notification.kind.value}|{notification.title}|{notification.action_url or ''}|"
            f"{sorted(relevant_payload.items(), key=lambda item: item[0])}"
        )
