"""add employer profile dashboard fields

Revision ID: 20260329_0026
Revises: 20260328_0025
Create Date: 2026-03-29 18:20:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260329_0026"
down_revision = "20260328_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_profiles")}

    if "max_link" not in columns:
        op.add_column("employer_profiles", sa.Column("max_link", sa.String(length=500), nullable=True))

    if "rutube_link" not in columns:
        op.add_column("employer_profiles", sa.Column("rutube_link", sa.String(length=500), nullable=True))

    if "short_description" not in columns:
        op.add_column("employer_profiles", sa.Column("short_description", sa.String(length=500), nullable=True))

    if "office_addresses" not in columns:
        op.add_column("employer_profiles", sa.Column("office_addresses", sa.JSON(), nullable=True))

    if "activity_areas" not in columns:
        op.add_column("employer_profiles", sa.Column("activity_areas", sa.JSON(), nullable=True))

    if "organization_size" not in columns:
        op.add_column("employer_profiles", sa.Column("organization_size", sa.String(length=120), nullable=True))

    if "foundation_year" not in columns:
        op.add_column("employer_profiles", sa.Column("foundation_year", sa.Integer(), nullable=True))

    if "profile_views_count" not in columns:
        op.add_column(
            "employer_profiles",
            sa.Column("profile_views_count", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_profiles")}

    if "profile_views_count" in columns:
        op.drop_column("employer_profiles", "profile_views_count")

    if "foundation_year" in columns:
        op.drop_column("employer_profiles", "foundation_year")

    if "organization_size" in columns:
        op.drop_column("employer_profiles", "organization_size")

    if "activity_areas" in columns:
        op.drop_column("employer_profiles", "activity_areas")

    if "office_addresses" in columns:
        op.drop_column("employer_profiles", "office_addresses")

    if "short_description" in columns:
        op.drop_column("employer_profiles", "short_description")

    if "rutube_link" in columns:
        op.drop_column("employer_profiles", "rutube_link")

    if "max_link" in columns:
        op.drop_column("employer_profiles", "max_link")
