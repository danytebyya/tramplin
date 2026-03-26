"""add social link to employer verification requests

Revision ID: 20260326_0014
Revises: 20260326_0013
Create Date: 2026-03-26 23:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260326_0014"
down_revision = "20260326_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_verification_requests")}

    if "social_link" not in columns:
        op.add_column(
            "employer_verification_requests",
            sa.Column("social_link", sa.String(length=500), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_verification_requests")}

    if "social_link" in columns:
        op.drop_column("employer_verification_requests", "social_link")
