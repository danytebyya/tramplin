from sqlalchemy import Enum, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin
from src.enums import EmployerType, EmployerVerificationStatus


def enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class ApplicantProfile(TimestampMixin, Base):
    __tablename__ = "applicant_profiles"

    user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    full_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    university: Mapped[str | None] = mapped_column(String(180), nullable=True)
    graduation_year: Mapped[int | None] = mapped_column(nullable=True)
    resume_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    portfolio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user = relationship("User", back_populates="applicant_profile")


class EmployerProfile(TimestampMixin, Base):
    __tablename__ = "employer_profiles"

    user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    employer_type: Mapped[EmployerType] = mapped_column(
        Enum(EmployerType, name="employer_type", values_callable=enum_values),
        nullable=False,
    )
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    inn: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    corporate_email: Mapped[str] = mapped_column(String(320), nullable=False)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verification_status: Mapped[EmployerVerificationStatus] = mapped_column(
        Enum(
            EmployerVerificationStatus,
            name="employer_verification_status",
            values_callable=enum_values,
        ),
        default=EmployerVerificationStatus.UNVERIFIED,
        nullable=False,
    )
    moderator_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    user = relationship("User", back_populates="employer_profile")


class CuratorProfile(TimestampMixin, Base):
    __tablename__ = "curator_profiles"

    user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    full_name: Mapped[str | None] = mapped_column(String(180), nullable=True)

    user = relationship("User", back_populates="curator_profile")
