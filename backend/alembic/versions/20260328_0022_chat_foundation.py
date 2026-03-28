"""chat foundation

Revision ID: 20260328_0022
Revises: 20260328_0021
Create Date: 2026-03-28 17:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260328_0022"
down_revision = "20260328_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role_enum = postgresql.ENUM(
        "guest",
        "applicant",
        "employer",
        "junior",
        "curator",
        "admin",
        name="user_role",
        create_type=False,
    )

    op.create_table(
        "chat_user_keys",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("algorithm", sa.String(length=50), nullable=False),
        sa.Column("public_key_jwk", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("applicant_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employer_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employer_id", sa.Uuid(), sa.ForeignKey("employers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=False),
        sa.Column("last_message_id", sa.Uuid(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("applicant_user_id", "employer_user_id", "employer_id", name="uq_chat_conversations_scope"),
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_role", user_role_enum, nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column("iv", sa.String(length=120), nullable=False),
        sa.Column("salt", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_foreign_key(
        "fk_chat_conversations_last_message_id",
        "chat_conversations",
        "chat_messages",
        ["last_message_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "chat_conversation_read_states",
        sa.Column("conversation_id", sa.Uuid(), sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("last_read_message_id", sa.Uuid(), sa.ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_chat_conversation_read_states_conversation_user"),
    )


def downgrade() -> None:
    op.drop_table("chat_conversation_read_states")
    op.drop_constraint("fk_chat_conversations_last_message_id", "chat_conversations", type_="foreignkey")
    op.drop_table("chat_messages")
    op.drop_table("chat_conversations")
    op.drop_table("chat_user_keys")
