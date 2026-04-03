from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ApplicantContact(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "applicant_contacts"
    __table_args__ = (
        UniqueConstraint("user_low_id", "user_high_id", name="uq_applicant_contacts_pair"),
    )

    user_low_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_high_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_by_user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="accepted", server_default="accepted")
