"""moderation settings

Revision ID: 20260325_0011
Revises: 20260325_0010
Create Date: 2026-03-25 04:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260325_0011"
down_revision = "20260325_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "moderation_settings" not in tables:
        op.create_table(
            "moderation_settings",
            sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
            sa.Column("vacancy_review_hours", sa.Integer(), nullable=False, server_default="24"),
            sa.Column("internship_review_hours", sa.Integer(), nullable=False, server_default="24"),
            sa.Column("event_review_hours", sa.Integer(), nullable=False, server_default="24"),
            sa.Column("mentorship_review_hours", sa.Integer(), nullable=False, server_default="24"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    op.drop_table("moderation_settings")
