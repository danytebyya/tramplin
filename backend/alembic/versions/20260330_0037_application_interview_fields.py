"""add interview fields to applications

Revision ID: 20260330_0037
Revises: 20260330_0036
Create Date: 2026-03-30 19:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260330_0037"
down_revision = "20260330_0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("applications")}

    if "interview_date" not in columns:
        op.add_column("applications", sa.Column("interview_date", sa.DateTime(timezone=True), nullable=True))
    if "interview_start_time" not in columns:
        op.add_column("applications", sa.Column("interview_start_time", sa.String(length=16), nullable=True))
    if "interview_end_time" not in columns:
        op.add_column("applications", sa.Column("interview_end_time", sa.String(length=16), nullable=True))
    if "interview_format" not in columns:
        op.add_column("applications", sa.Column("interview_format", sa.String(length=255), nullable=True))
    if "meeting_link" not in columns:
        op.add_column("applications", sa.Column("meeting_link", sa.String(length=500), nullable=True))
    if "contact_email" not in columns:
        op.add_column("applications", sa.Column("contact_email", sa.String(length=320), nullable=True))
    if "checklist" not in columns:
        op.add_column("applications", sa.Column("checklist", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("applications")}

    if "checklist" in columns:
        op.drop_column("applications", "checklist")
    if "contact_email" in columns:
        op.drop_column("applications", "contact_email")
    if "meeting_link" in columns:
        op.drop_column("applications", "meeting_link")
    if "interview_format" in columns:
        op.drop_column("applications", "interview_format")
    if "interview_end_time" in columns:
        op.drop_column("applications", "interview_end_time")
    if "interview_start_time" in columns:
        op.drop_column("applications", "interview_start_time")
    if "interview_date" in columns:
        op.drop_column("applications", "interview_date")
