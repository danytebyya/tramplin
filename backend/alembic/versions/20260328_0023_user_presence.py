"""user presence

Revision ID: 20260328_0023
Revises: 20260328_0022
Create Date: 2026-03-28 21:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0023"
down_revision = "20260328_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_seen_at")
