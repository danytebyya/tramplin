from sqlalchemy import ForeignKey, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ModerationSettings(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "moderation_settings"

    updated_by_user_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    vacancy_review_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    internship_review_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    event_review_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    mentorship_review_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)

    updated_by_user = relationship("User")
