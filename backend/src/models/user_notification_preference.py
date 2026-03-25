from sqlalchemy import Boolean, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserNotificationPreference(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_notification_preferences"

    user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    email_new_verification_requests: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_content_complaints: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_overdue_reviews: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_company_profile_changes: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_publication_changes: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_daily_digest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_weekly_report: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    push_new_verification_requests: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    push_content_complaints: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    push_overdue_reviews: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    push_company_profile_changes: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    push_publication_changes: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    push_daily_digest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    push_weekly_report: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="notification_preferences")
