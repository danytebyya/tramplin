"""employer onboarding

Revision ID: 20260320_0003
Revises: 20260320_0002
Create Date: 2026-03-20
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260320_0003"
down_revision: str | None = "20260320_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


employer_type = postgresql.ENUM(
    "company",
    "sole_proprietor",
    name="employer_type",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    employer_type.create(bind, checkfirst=True)

    op.add_column(
        "employer_profiles",
        sa.Column(
            "employer_type",
            employer_type,
            nullable=False,
            server_default="company",
        ),
    )
    op.alter_column("employer_profiles", "employer_type", server_default=None)


def downgrade() -> None:
    op.drop_column("employer_profiles", "employer_type")

    bind = op.get_bind()
    employer_type.drop(bind, checkfirst=True)
