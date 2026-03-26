"""enforce case insensitive user email uniqueness

Revision ID: 20260326_0016
Revises: 20260326_0015
Create Date: 2026-03-26 23:55:00
"""

from alembic import op
from sqlalchemy import inspect


revision = "20260326_0016"
down_revision = "20260326_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("users")}

    if "ix_users_email" in indexes:
        op.drop_index("ix_users_email", table_name="users")

    if "uq_users_email_lower" not in indexes:
        op.execute("CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email))")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("users")}

    if "uq_users_email_lower" in indexes:
        op.drop_index("uq_users_email_lower", table_name="users")

    if "ix_users_email" not in indexes:
        op.create_index("ix_users_email", "users", ["email"], unique=True)
