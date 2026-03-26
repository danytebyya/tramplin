"""user notification preferences

Revision ID: 20260325_0010
Revises: 20260325_0009
Create Date: 2026-03-25 03:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260325_0010"
down_revision = "20260325_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "user_notification_preferences" not in tables:
        op.create_table(
            "user_notification_preferences",
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("email_new_verification_requests", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("email_content_complaints", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("email_overdue_reviews", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("email_company_profile_changes", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("email_publication_changes", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("email_daily_digest", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("email_weekly_report", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("push_new_verification_requests", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("push_content_complaints", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("push_overdue_reviews", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("push_company_profile_changes", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("push_publication_changes", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("push_daily_digest", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("push_weekly_report", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id"),
        )

    indexes = {index["name"] for index in inspector.get_indexes("user_notification_preferences")}
    if op.f("ix_user_notification_preferences_user_id") not in indexes:
        op.create_index(
            op.f("ix_user_notification_preferences_user_id"),
            "user_notification_preferences",
            ["user_id"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_user_notification_preferences_user_id"),
        table_name="user_notification_preferences",
    )
    op.drop_table("user_notification_preferences")
