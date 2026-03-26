from sqlalchemy import Enum, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from src.enums import UserRole, UserStatus


def enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class User(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    preferred_city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=enum_values),
        nullable=False,
    )
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status", values_callable=enum_values),
        default=UserStatus.ACTIVE,
        nullable=False,
    )
    __table_args__ = (
        Index("uq_users_email_lower", func.lower(email), unique=True),
    )

    applicant_profile = relationship("ApplicantProfile", back_populates="user", uselist=False)
    employer_profile = relationship("EmployerProfile", back_populates="user", uselist=False)
    curator_profile = relationship("CuratorProfile", back_populates="user", uselist=False)
    favorite_opportunities = relationship("FavoriteOpportunity", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    refresh_sessions = relationship("RefreshSession", back_populates="user")
    login_events = relationship("AuthLoginEvent", back_populates="user")
    notification_preferences = relationship(
        "UserNotificationPreference",
        back_populates="user",
        uselist=False,
    )
