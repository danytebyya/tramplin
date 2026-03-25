"""add favorite opportunities

Revision ID: 20260325_0007
Revises: 20260325_0006
Create Date: 2026-03-25 23:40:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260325_0007"
down_revision = "20260325_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "favorite_opportunities",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "opportunity_id"),
    )
    op.create_index(
        "ix_favorite_opportunities_opportunity",
        "favorite_opportunities",
        ["opportunity_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_favorite_opportunities_opportunity", table_name="favorite_opportunities")
    op.drop_table("favorite_opportunities")
