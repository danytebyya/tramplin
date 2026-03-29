"""chat unread reminders

Revision ID: 20260330_0035
Revises: 20260330_0034
Create Date: 2026-03-30 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260330_0035"
down_revision = "20260330_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_notification_preferences",
        sa.Column("email_chat_reminders", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "user_notification_preferences",
        sa.Column("push_chat_reminders", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_enum
                WHERE enumlabel = 'chat'
                  AND enumtypid = 'notification_kind'::regtype
            ) THEN
                ALTER TYPE notification_kind ADD VALUE 'chat';
            END IF;
        END $$;
        """
    )

    op.create_table(
        "chat_unread_reminder_states",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_role", sa.Enum("applicant", "employer", "junior", "curator", "admin", name="user_role", create_type=False), nullable=False),
        sa.Column("employer_id", sa.Uuid(), sa.ForeignKey("employers.id", ondelete="CASCADE"), nullable=True),
        sa.Column("scope_key", sa.String(length=160), nullable=False),
        sa.Column("is_pending", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("first_unread_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_unread_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_notified_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "scope_key", name="uq_chat_unread_reminder_states_user_scope"),
    )


def downgrade() -> None:
    op.drop_table("chat_unread_reminder_states")
    op.drop_column("user_notification_preferences", "push_chat_reminders")
    op.drop_column("user_notification_preferences", "email_chat_reminders")
