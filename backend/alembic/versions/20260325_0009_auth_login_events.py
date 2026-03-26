"""auth login events

Revision ID: 20260325_0009
Revises: 20260325_0008
Create Date: 2026-03-25 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260325_0009"
down_revision = "20260325_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "auth_login_events" not in tables:
        op.create_table(
            "auth_login_events",
            sa.Column("user_id", sa.Uuid(), nullable=True),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column("user_agent", sa.String(length=500), nullable=True),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("is_success", sa.Boolean(), nullable=False),
            sa.Column("failure_reason", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    indexes = {index["name"] for index in inspector.get_indexes("auth_login_events")}
    if op.f("ix_auth_login_events_created_at") not in indexes:
        op.create_index(op.f("ix_auth_login_events_created_at"), "auth_login_events", ["created_at"], unique=False)
    if op.f("ix_auth_login_events_email") not in indexes:
        op.create_index(op.f("ix_auth_login_events_email"), "auth_login_events", ["email"], unique=False)
    if op.f("ix_auth_login_events_user_id") not in indexes:
        op.create_index(op.f("ix_auth_login_events_user_id"), "auth_login_events", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_login_events_user_id"), table_name="auth_login_events")
    op.drop_index(op.f("ix_auth_login_events_email"), table_name="auth_login_events")
    op.drop_index(op.f("ix_auth_login_events_created_at"), table_name="auth_login_events")
    op.drop_table("auth_login_events")
