"""add applicant preferred location

Revision ID: 20260330_0031
Revises: 20260330_0030
Create Date: 2026-03-30 11:20:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260330_0031"
down_revision = "20260330_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    profile_columns = {column["name"] for column in inspector.get_columns("applicant_profiles")}

    if "preferred_location" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("preferred_location", sa.String(length=120), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    profile_columns = {column["name"] for column in inspector.get_columns("applicant_profiles")}

    if "preferred_location" in profile_columns:
        op.drop_column("applicant_profiles", "preferred_location")
