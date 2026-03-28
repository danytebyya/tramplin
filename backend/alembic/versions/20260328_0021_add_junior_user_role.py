"""add junior user role

Revision ID: 20260328_0021
Revises: 20260327_0020
Create Date: 2026-03-28
"""

from typing import Sequence

from alembic import op

revision: str = "20260328_0021"
down_revision: str | None = "20260327_0020"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'junior'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely in-place.
    pass
