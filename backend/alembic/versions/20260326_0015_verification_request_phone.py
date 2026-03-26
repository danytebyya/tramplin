"""add phone to employer verification requests

Revision ID: 20260326_0015
Revises: 20260326_0014
Create Date: 2026-03-26 23:35:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260326_0015"
down_revision = "20260326_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_verification_requests")}

    if "phone" not in columns:
        op.add_column(
            "employer_verification_requests",
            sa.Column("phone", sa.String(length=32), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("employer_verification_requests")}

    if "phone" in columns:
        op.drop_column("employer_verification_requests", "phone")
