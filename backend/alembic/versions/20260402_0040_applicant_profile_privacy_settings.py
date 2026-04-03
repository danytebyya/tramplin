"""add applicant profile privacy settings

Revision ID: 20260402_0040
Revises: 20260401_0039
Create Date: 2026-04-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_0040"
down_revision = "20260401_0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "applicant_profiles",
        sa.Column("profile_visibility", sa.String(length=32), nullable=False, server_default="public"),
    )
    op.add_column(
        "applicant_profiles",
        sa.Column("show_resume", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("applicant_profiles", "show_resume")
    op.drop_column("applicant_profiles", "profile_visibility")
