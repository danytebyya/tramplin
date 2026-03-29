from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


def enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class ModerationStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    HIDDEN = "hidden"
    BLOCKED = "blocked"


class TagType(StrEnum):
    TECHNOLOGY = "technology"
    SKILL = "skill"
    LEVEL = "level"
    EMPLOYMENT_TYPE = "employment_type"
    SPECIALIZATION = "specialization"
    DIRECTION = "direction"
    FORMAT = "format"
    INDUSTRY = "industry"
    LANGUAGE = "language"
    EVENT_TOPIC = "event_topic"
    BENEFIT = "benefit"
    LOCATION = "location"


class OpportunityType(StrEnum):
    INTERNSHIP = "internship"
    VACANCY = "vacancy"
    MENTORSHIP_PROGRAM = "mentorship_program"
    CAREER_EVENT = "career_event"


class OpportunityStatus(StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    CLOSED = "closed"
    ARCHIVED = "archived"


class WorkFormat(StrEnum):
    OFFICE = "office"
    HYBRID = "hybrid"
    REMOTE = "remote"
    ONLINE = "online"
    OFFLINE = "offline"


class EmploymentType(StrEnum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    FREELANCE = "freelance"
    TEMPORARY = "temporary"
    VOLUNTEER = "volunteer"
    PROJECT_BASED = "project_based"


class OpportunityLevel(StrEnum):
    STUDENT = "student"
    ENTRY = "entry"
    JUNIOR = "junior"
    MIDDLE = "middle"
    SENIOR = "senior"
    LEAD = "lead"
    EXECUTIVE = "executive"


class Location(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "locations"

    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    country_name: Mapped[str] = mapped_column(String(120), nullable=False)
    region: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    formatted_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Tag(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "tags"

    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tag_type: Mapped[TagType] = mapped_column(
        Enum(TagType, name="tag_type", values_callable=enum_values, create_type=False),
        nullable=False,
    )
    parent_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("tags.id"), nullable=True
    )
    moderation_status: Mapped[ModerationStatus] = mapped_column(
        Enum(
            ModerationStatus,
            name="moderation_status",
            values_callable=enum_values,
            create_type=False,
        ),
        nullable=False,
        default=ModerationStatus.APPROVED,
    )
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    parent = relationship("Tag", remote_side="Tag.id", back_populates="children")
    children = relationship("Tag", back_populates="parent")


class Opportunity(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "opportunities"

    employer_id: Mapped[str] = mapped_column(Uuid(as_uuid=True), ForeignKey("employers.id"), nullable=False)
    created_by_user_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    updated_by_user_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    moderated_by_user_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    location_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("locations.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    short_description: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    opportunity_type: Mapped[OpportunityType] = mapped_column(
        Enum(
            OpportunityType,
            name="opportunity_type",
            values_callable=enum_values,
            create_type=False,
        ),
        nullable=False,
    )
    business_status: Mapped[OpportunityStatus] = mapped_column(
        Enum(
            OpportunityStatus,
            name="opportunity_status",
            values_callable=enum_values,
            create_type=False,
        ),
        nullable=False,
        default=OpportunityStatus.DRAFT,
    )
    moderation_status: Mapped[ModerationStatus] = mapped_column(
        Enum(
            ModerationStatus,
            name="moderation_status",
            values_callable=enum_values,
            create_type=False,
        ),
        nullable=False,
        default=ModerationStatus.PENDING_REVIEW,
    )
    work_format: Mapped[WorkFormat] = mapped_column(
        Enum(WorkFormat, name="work_format", values_callable=enum_values, create_type=False),
        nullable=False,
    )
    employment_type: Mapped[EmploymentType | None] = mapped_column(
        Enum(
            EmploymentType,
            name="employment_type",
            values_callable=enum_values,
            create_type=False,
        ),
        nullable=True,
    )
    level: Mapped[OpportunityLevel | None] = mapped_column(
        Enum(
            OpportunityLevel,
            name="opportunity_level",
            values_callable=enum_values,
            create_type=False,
        ),
        nullable=True,
    )
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    application_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    event_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    mentorship_direction: Mapped[str | None] = mapped_column(String(120), nullable=True)
    mentor_experience: Mapped[str | None] = mapped_column(String(120), nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    moderation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    employer = relationship("Employer")
    location = relationship("Location")
    compensation = relationship("OpportunityCompensation", back_populates="opportunity", uselist=False)
    tag_links = relationship("OpportunityTag", back_populates="opportunity")
    favorite_users = relationship("FavoriteOpportunity", back_populates="opportunity")
    applications = relationship("Application", back_populates="opportunity")


class OpportunityCompensation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "opportunity_compensations"

    opportunity_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("opportunities.id"), nullable=False, unique=True
    )
    salary_from: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    salary_to: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    stipend_text: Mapped[str | None] = mapped_column(String(255), nullable=True)

    opportunity = relationship("Opportunity", back_populates="compensation")


class OpportunityTag(Base):
    __tablename__ = "opportunity_tags"

    opportunity_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("opportunities.id"), primary_key=True
    )
    tag_id: Mapped[str] = mapped_column(Uuid(as_uuid=True), ForeignKey("tags.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    opportunity = relationship("Opportunity", back_populates="tag_links")
    tag = relationship("Tag")
