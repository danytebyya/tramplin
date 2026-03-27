"""make staff invitation email optional

Revision ID: 20260327_0019
Revises: 20260327_0018
Create Date: 2026-03-27 15:55:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260327_0019"
down_revision = "20260327_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"]: column for column in inspector.get_columns("employer_staff_invitations")}

    invited_email = columns.get("invited_email")
    if invited_email is not None and not invited_email.get("nullable", False):
        with op.batch_alter_table("employer_staff_invitations") as batch_op:
            batch_op.alter_column(
                "invited_email",
                existing_type=sa.String(length=320),
                nullable=True,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"]: column for column in inspector.get_columns("employer_staff_invitations")}

    invited_email = columns.get("invited_email")
    if invited_email is not None and invited_email.get("nullable", False):
        with op.batch_alter_table("employer_staff_invitations") as batch_op:
            batch_op.alter_column(
                "invited_email",
                existing_type=sa.String(length=320),
                nullable=False,
            )
