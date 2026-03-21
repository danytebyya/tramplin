from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class EmailVerificationState(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "email_verification_states"
    __table_args__ = (
        UniqueConstraint("email", "purpose", name="uq_email_verification_states_email_purpose"),
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    debug_code: Mapped[str | None] = mapped_column(String(6), nullable=True)
    code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    code_attempts_left: Mapped[int | None] = mapped_column(Integer, nullable=True)
    request_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    request_window_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    verify_failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verify_window_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
