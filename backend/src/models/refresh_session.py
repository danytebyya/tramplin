from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from src.enums import UserRole


def enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class RefreshSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "refresh_sessions"

    user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    active_role: Mapped[UserRole | None] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=enum_values),
        nullable=True,
    )
    active_employer_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("employers.id"),
        nullable=True,
    )
    active_membership_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("employer_memberships.id"),
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)

    user = relationship("User", back_populates="refresh_sessions")
