from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


def enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class ApplicationStatus(StrEnum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    SHORTLISTED = "shortlisted"
    INTERVIEW = "interview"
    OFFER = "offer"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    RESERVED = "reserved"
    WITHDRAWN = "withdrawn"
    CANCELED = "canceled"


class Application(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "applications"

    opportunity_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False
    )
    applicant_user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    resume_version_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    cover_letter: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(
            ApplicationStatus,
            name="application_status",
            values_callable=enum_values,
            create_type=False,
        ),
        nullable=False,
        default=ApplicationStatus.SUBMITTED,
    )
    status_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_hidden_by_applicant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    employer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    interview_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    interview_start_time: Mapped[str | None] = mapped_column(String(16), nullable=True)
    interview_end_time: Mapped[str | None] = mapped_column(String(16), nullable=True)
    interview_format: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meeting_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    checklist: Mapped[str | None] = mapped_column(Text, nullable=True)
    curator_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    opportunity = relationship("Opportunity", back_populates="applications")
    applicant = relationship("User")
