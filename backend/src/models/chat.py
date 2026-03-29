from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, String, Text, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from src.enums import UserRole


def enum_values(enum_cls: type) -> list[str]:
    return [member.value for member in enum_cls]


class ChatUserKey(TimestampMixin, Base):
    __tablename__ = "chat_user_keys"

    user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    algorithm: Mapped[str] = mapped_column(String(50), nullable=False, default="ECDH_P256")
    public_key_jwk: Mapped[dict] = mapped_column(JSON, nullable=False)


class ChatConversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chat_conversations"
    __table_args__ = (
        UniqueConstraint(
            "applicant_user_id",
            "employer_user_id",
            "employer_id",
            name="uq_chat_conversations_scope",
        ),
    )

    applicant_user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    employer_user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    employer_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("employers.id", ondelete="CASCADE"), nullable=True
    )
    created_by_user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    last_message_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("chat_messages.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChatMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "chat_messages"

    conversation_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    sender_role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=enum_values, create_type=False),
        nullable=False,
    )
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    iv: Mapped[str] = mapped_column(String(120), nullable=False)
    salt: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ChatConversationReadState(Base):
    __tablename__ = "chat_conversation_read_states"
    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "user_id",
            name="uq_chat_conversation_read_states_conversation_user",
        ),
    )

    conversation_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("chat_conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    last_read_message_id: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True
    )
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
