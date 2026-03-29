import secrets
from datetime import datetime

from sqlalchemy import DateTime, Enum, Index, String, event, func, select
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from src.enums import UserRole, UserStatus


def enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class User(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "users"

    public_id: Mapped[str | None] = mapped_column(String(8), unique=True, index=True, nullable=True)
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
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (
        Index("uq_users_email_lower", func.lower(email), unique=True),
    )

    applicant_profile = relationship("ApplicantProfile", back_populates="user", uselist=False)
    applicant_projects = relationship("ApplicantProject", back_populates="applicant")
    applicant_achievements = relationship("ApplicantAchievement", back_populates="applicant")
    applicant_certificates = relationship("ApplicantCertificate", back_populates="applicant")
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


def _generate_public_id(connection) -> str:
    while True:
        candidate = f"{secrets.randbelow(90_000_000) + 10_000_000}"
        exists = connection.execute(
            select(User.public_id).where(User.public_id == candidate)
        ).scalar_one_or_none()
        if exists is None:
            return candidate


@event.listens_for(User, "before_insert")
def assign_public_id_before_insert(mapper, connection, target: User) -> None:
    if target.role == UserRole.CURATOR:
        target.public_id = None
        return

    if target.public_id:
        return

    target.public_id = _generate_public_id(connection)
