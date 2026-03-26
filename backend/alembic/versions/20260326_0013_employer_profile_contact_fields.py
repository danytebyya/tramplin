"""add employer profile contact fields

Revision ID: 20260326_0013
Revises: 20260326_0012
Create Date: 2026-03-26 16:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260326_0013"
down_revision = "20260326_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_profiles")}

    if "phone" not in columns:
        op.add_column("employer_profiles", sa.Column("phone", sa.String(length=32), nullable=True))

    if "social_link" not in columns:
        op.add_column("employer_profiles", sa.Column("social_link", sa.String(length=500), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_profiles")}

    if "social_link" in columns:
        op.drop_column("employer_profiles", "social_link")

    if "phone" in columns:
        op.drop_column("employer_profiles", "phone")
