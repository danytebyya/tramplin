"""add user preferred city

Revision ID: 20260325_0006
Revises: 20260325_0005
Create Date: 2026-03-25 22:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260325_0006"
down_revision = "20260325_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "preferred_city" not in columns:
        op.add_column("users", sa.Column("preferred_city", sa.String(length=120), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "preferred_city" in columns:
        op.drop_column("users", "preferred_city")
