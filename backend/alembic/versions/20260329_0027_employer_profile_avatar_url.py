"""add avatar url to employer profiles

Revision ID: 20260329_0027
Revises: 20260329_0026
Create Date: 2026-03-29 19:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260329_0027"
down_revision = "20260329_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_profiles")}

    if "avatar_url" not in columns:
        op.add_column("employer_profiles", sa.Column("avatar_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_profiles")}

    if "avatar_url" in columns:
        op.drop_column("employer_profiles", "avatar_url")
