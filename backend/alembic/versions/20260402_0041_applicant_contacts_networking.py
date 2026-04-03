"""applicant contacts networking

Revision ID: 20260402_0041
Revises: 20260402_0040
Create Date: 2026-04-02 20:40:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260402_0041"
down_revision = "20260402_0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "applicant_contacts" not in existing_tables:
        op.create_table(
            "applicant_contacts",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_low_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_high_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_low_id", "user_high_id", name="uq_applicant_contacts_pair"),
        )
    else:
        existing_columns = {column["name"] for column in inspector.get_columns("applicant_contacts")}

        if "created_by_user_id" not in existing_columns:
            op.add_column("applicant_contacts", sa.Column("created_by_user_id", sa.Uuid(), nullable=True))
            op.execute("UPDATE applicant_contacts SET created_by_user_id = user_low_id WHERE created_by_user_id IS NULL")
            op.alter_column("applicant_contacts", "created_by_user_id", nullable=False)
            op.create_foreign_key(
                "fk_applicant_contacts_created_by_user_id_users",
                "applicant_contacts",
                "users",
                ["created_by_user_id"],
                ["id"],
                ondelete="CASCADE",
            )

        if "updated_at" not in existing_columns:
            op.add_column(
                "applicant_contacts",
                sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            )

    existing_indexes = {index["name"] for index in inspector.get_indexes("applicant_contacts")}
    if "ix_applicant_contacts_user_low_id" not in existing_indexes:
        op.execute("CREATE INDEX IF NOT EXISTS ix_applicant_contacts_user_low_id ON applicant_contacts (user_low_id)")
    if "ix_applicant_contacts_user_high_id" not in existing_indexes:
        op.execute("CREATE INDEX IF NOT EXISTS ix_applicant_contacts_user_high_id ON applicant_contacts (user_high_id)")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "applicant_contacts" not in existing_tables:
        return

    existing_indexes = {index["name"] for index in inspector.get_indexes("applicant_contacts")}
    if "ix_applicant_contacts_user_high_id" in existing_indexes:
        op.drop_index("ix_applicant_contacts_user_high_id", table_name="applicant_contacts")
    if "ix_applicant_contacts_user_low_id" in existing_indexes:
        op.drop_index("ix_applicant_contacts_user_low_id", table_name="applicant_contacts")

    existing_columns = {column["name"] for column in inspector.get_columns("applicant_contacts")}
    if "created_by_user_id" in existing_columns:
        existing_foreign_keys = {fk["name"] for fk in inspector.get_foreign_keys("applicant_contacts")}
        if "fk_applicant_contacts_created_by_user_id_users" in existing_foreign_keys:
            op.drop_constraint("fk_applicant_contacts_created_by_user_id_users", "applicant_contacts", type_="foreignkey")
        op.drop_column("applicant_contacts", "created_by_user_id")
    if "updated_at" in existing_columns:
        op.drop_column("applicant_contacts", "updated_at")
