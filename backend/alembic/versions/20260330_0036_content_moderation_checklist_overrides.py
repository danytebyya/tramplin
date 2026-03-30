"""add content moderation checklist overrides

Revision ID: 20260330_0036
Revises: 20260330_0035
Create Date: 2026-03-30 03:05:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260330_0036"
down_revision = "20260330_0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("opportunities")}

    if "checklist_salary_specified" not in columns:
        op.add_column("opportunities", sa.Column("checklist_salary_specified", sa.Boolean(), nullable=True))
    if "checklist_requirements_completed" not in columns:
        op.add_column("opportunities", sa.Column("checklist_requirements_completed", sa.Boolean(), nullable=True))
    if "checklist_responsibilities_completed" not in columns:
        op.add_column("opportunities", sa.Column("checklist_responsibilities_completed", sa.Boolean(), nullable=True))
    if "checklist_conditions_specified" not in columns:
        op.add_column("opportunities", sa.Column("checklist_conditions_specified", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("opportunities", "checklist_conditions_specified")
    op.drop_column("opportunities", "checklist_responsibilities_completed")
    op.drop_column("opportunities", "checklist_requirements_completed")
    op.drop_column("opportunities", "checklist_salary_specified")
