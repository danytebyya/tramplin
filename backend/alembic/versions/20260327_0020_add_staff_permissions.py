"""add staff permissions

Revision ID: 20260327_0020
Revises: 20260327_0019
Create Date: 2026-03-27 18:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260327_0020"
down_revision = "20260327_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    membership_columns = {column["name"] for column in inspector.get_columns("employer_memberships")}
    if "permissions" not in membership_columns:
        with op.batch_alter_table("employer_memberships") as batch_op:
            batch_op.add_column(sa.Column("permissions", sa.JSON(), nullable=True))

    invitation_columns = {column["name"] for column in inspector.get_columns("employer_staff_invitations")}
    if "permissions" not in invitation_columns:
        with op.batch_alter_table("employer_staff_invitations") as batch_op:
            batch_op.add_column(sa.Column("permissions", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    membership_columns = {column["name"] for column in inspector.get_columns("employer_memberships")}
    if "permissions" in membership_columns:
        with op.batch_alter_table("employer_memberships") as batch_op:
            batch_op.drop_column("permissions")

    invitation_columns = {column["name"] for column in inspector.get_columns("employer_staff_invitations")}
    if "permissions" in invitation_columns:
        with op.batch_alter_table("employer_staff_invitations") as batch_op:
            batch_op.drop_column("permissions")
