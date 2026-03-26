"""add hidden state to notifications

Revision ID: 20260326_0017
Revises: 20260326_0016
Create Date: 2026-03-26 16:40:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260326_0017"
down_revision = "20260326_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("notifications")}

    if "is_hidden" not in columns:
        op.add_column(
            "notifications",
            sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if "hidden_at" not in columns:
        op.add_column(
            "notifications",
            sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("notifications")}

    if "hidden_at" in columns:
        op.drop_column("notifications", "hidden_at")
    if "is_hidden" in columns:
        op.drop_column("notifications", "is_hidden")
