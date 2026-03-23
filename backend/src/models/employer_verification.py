from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from src.enums import (
    EmployerType,
    EmployerVerificationRequestStatus,
    MediaOwnerKind,
    MembershipRole,
    VerificationDocumentType,
)


def enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class Employer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "employers"

    employer_type: Mapped[EmployerType] = mapped_column(
        Enum(EmployerType, name="employer_type", values_callable=enum_values),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    inn: Mapped[str] = mapped_column(String(12), nullable=False, unique=True, index=True)
    description_short: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_full: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    corporate_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    headquarters_location_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    verification_status: Mapped[EmployerVerificationRequestStatus] = mapped_column(
        Enum(
            EmployerVerificationRequestStatus,
            name="employer_verification_status_v2",
            values_callable=enum_values,
        ),
        default=EmployerVerificationRequestStatus.PENDING,
        nullable=False,
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmployerMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "employer_memberships"

    employer_id: Mapped[str] = mapped_column(Uuid(as_uuid=True), ForeignKey("employers.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False)
    membership_role: Mapped[MembershipRole] = mapped_column(
        Enum(MembershipRole, name="membership_role", values_callable=enum_values),
        nullable=False,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class MediaFile(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "media_files"

    storage_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="local")
    public_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    uploaded_by_user_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EmployerVerificationRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "employer_verification_requests"

    employer_id: Mapped[str] = mapped_column(Uuid(as_uuid=True), ForeignKey("employers.id"), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    employer_type: Mapped[EmployerType] = mapped_column(
        Enum(EmployerType, name="employer_type", values_callable=enum_values),
        nullable=False,
    )
    inn: Mapped[str] = mapped_column(String(12), nullable=False)
    corporate_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    status: Mapped[EmployerVerificationRequestStatus] = mapped_column(
        Enum(
            EmployerVerificationRequestStatus,
            name="employer_verification_status_v2",
            values_callable=enum_values,
        ),
        default=EmployerVerificationRequestStatus.PENDING,
        nullable=False,
    )
    submitted_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    moderator_comment: Mapped[str | None] = mapped_column(Text, nullable=True)


class EmployerVerificationDocument(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "employer_verification_documents"

    verification_request_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("employer_verification_requests.id"),
        nullable=False,
    )
    media_file_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("media_files.id"), nullable=True)
    document_type: Mapped[VerificationDocumentType] = mapped_column(
        Enum(
            VerificationDocumentType,
            name="verification_document_type",
            values_callable=enum_values,
        ),
        nullable=False,
    )
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
