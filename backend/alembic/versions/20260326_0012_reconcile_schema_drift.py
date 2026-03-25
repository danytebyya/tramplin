"""reconcile schema drift for users and favorites

Revision ID: 20260326_0012
Revises: 20260325_0011
Create Date: 2026-03-26 12:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260326_0012"
down_revision = "20260325_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "preferred_city" not in user_columns:
        op.add_column("users", sa.Column("preferred_city", sa.String(length=120), nullable=True))

    tables = set(inspector.get_table_names())
    if "favorite_opportunities" not in tables:
        op.create_table(
            "favorite_opportunities",
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("opportunity_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id", "opportunity_id"),
        )

    indexes = {index["name"] for index in inspector.get_indexes("favorite_opportunities")}
    if "ix_favorite_opportunities_opportunity" not in indexes:
        op.create_index(
            "ix_favorite_opportunities_opportunity",
            "favorite_opportunities",
            ["opportunity_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    tables = set(inspector.get_table_names())
    if "favorite_opportunities" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("favorite_opportunities")}
        if "ix_favorite_opportunities_opportunity" in indexes:
            op.drop_index("ix_favorite_opportunities_opportunity", table_name="favorite_opportunities")
        op.drop_table("favorite_opportunities")

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "preferred_city" in user_columns:
        op.drop_column("users", "preferred_city")
