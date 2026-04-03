"""applicant contact status

Revision ID: 20260402_0042
Revises: 20260402_0041
Create Date: 2026-04-02 23:50:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260402_0042"
down_revision = "20260402_0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "applicant_contacts" not in existing_tables:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("applicant_contacts")}
    if "status" not in existing_columns:
        op.add_column(
            "applicant_contacts",
            sa.Column("status", sa.String(length=16), nullable=True, server_default="accepted"),
        )
        op.execute("UPDATE applicant_contacts SET status = 'accepted' WHERE status IS NULL")
        op.alter_column("applicant_contacts", "status", nullable=False, server_default="accepted")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "applicant_contacts" not in existing_tables:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("applicant_contacts")}
    if "status" in existing_columns:
        op.drop_column("applicant_contacts", "status")
