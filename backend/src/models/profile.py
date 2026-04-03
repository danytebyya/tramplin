from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
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
    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    study_course: Mapped[int | None] = mapped_column(Integer, nullable=True)
    graduation_year: Mapped[int | None] = mapped_column(nullable=True)
    resume_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    portfolio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    desired_salary_from: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    employment_types: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    work_formats: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    hard_skills: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    soft_skills: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    languages: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    github_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    gitlab_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bitbucket_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    habr_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    profile_visibility: Mapped[str] = mapped_column(String(32), nullable=False, default="public")
    show_resume: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    profile_views_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recommendations_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    user = relationship("User", back_populates="applicant_profile")


class ApplicantProject(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "applicant_projects"

    applicant_user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    technologies: Mapped[str | None] = mapped_column(Text, nullable=True)
    period_label: Mapped[str | None] = mapped_column(String(180), nullable=True)
    role_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    repository_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    applicant = relationship("User", back_populates="applicant_projects")


class ApplicantAchievement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "applicant_achievements"

    applicant_user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    event_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    project_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    award: Mapped[str | None] = mapped_column(String(255), nullable=True)

    applicant = relationship("User", back_populates="applicant_achievements")


class ApplicantCertificate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "applicant_certificates"

    applicant_user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    organization_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issued_at: Mapped[Date | None] = mapped_column(Date, nullable=True)
    credential_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    applicant = relationship("User", back_populates="applicant_certificates")


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
    corporate_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    social_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    max_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    rutube_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    short_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    office_addresses: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    activity_areas: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    organization_size: Mapped[str | None] = mapped_column(String(120), nullable=True)
    foundation_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    profile_views_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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
