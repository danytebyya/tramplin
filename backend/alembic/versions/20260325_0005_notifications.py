"""add notifications

Revision ID: 20260325_0005
Revises: 20260321_0004
Create Date: 2026-03-25
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260325_0005"
down_revision: str | None = "20260321_0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    notification_kind = sa.Enum(
        "system",
        "profile",
        "opportunity",
        "application",
        "employer_verification",
        "candidates",
        name="notification_kind",
    )
    notification_severity = sa.Enum(
        "info",
        "success",
        "warning",
        "attention",
        name="notification_severity",
    )
    notification_kind.create(op.get_bind(), checkfirst=True)
    notification_severity.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", notification_kind, nullable=False),
        sa.Column("severity", notification_severity, nullable=False, server_default="info"),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("action_label", sa.String(length=80), nullable=True),
        sa.Column("action_url", sa.String(length=500), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
    sa.Enum(name="notification_severity").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="notification_kind").drop(op.get_bind(), checkfirst=True)
