"""add avatar url to applicant profiles

Revision ID: 20260331_0038
Revises: 20260330_0037
Create Date: 2026-03-31 12:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260331_0038"
down_revision = "20260330_0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("applicant_profiles")}

    if "avatar_url" not in columns:
        op.add_column("applicant_profiles", sa.Column("avatar_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("applicant_profiles")}

    if "avatar_url" in columns:
        op.drop_column("applicant_profiles", "avatar_url")
