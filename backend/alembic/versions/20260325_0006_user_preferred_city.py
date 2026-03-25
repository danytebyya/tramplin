"""add user preferred city

Revision ID: 20260325_0006
Revises: 20260325_0005
Create Date: 2026-03-25 22:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260325_0006"
down_revision = "20260325_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("preferred_city", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferred_city")
