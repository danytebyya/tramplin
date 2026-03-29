"""make employer corporate email optional

Revision ID: 20260329_0028
Revises: 20260329_0027
Create Date: 2026-03-29 00:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260329_0028"
down_revision = "20260329_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "employer_profiles",
        "corporate_email",
        existing_type=sa.String(length=320),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "employer_profiles",
        "corporate_email",
        existing_type=sa.String(length=320),
        nullable=False,
    )
