from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from src.enums.notifications import NotificationKind, NotificationSeverity


def enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class Notification(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notifications"

    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    kind: Mapped[NotificationKind] = mapped_column(
        Enum(NotificationKind, name="notification_kind", values_callable=enum_values),
        nullable=False,
    )
    severity: Mapped[NotificationSeverity] = mapped_column(
        Enum(NotificationSeverity, name="notification_severity", values_callable=enum_values),
        default=NotificationSeverity.INFO,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    action_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    user = relationship("User", back_populates="notifications")
