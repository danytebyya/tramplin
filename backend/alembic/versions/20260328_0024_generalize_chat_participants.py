"""generalize chat participants

Revision ID: 20260328_0024
Revises: 20260328_0023
Create Date: 2026-03-28 22:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260328_0024"
down_revision = "20260328_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("chat_conversations", "employer_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    op.alter_column("chat_conversations", "employer_id", existing_type=sa.Uuid(), nullable=False)
