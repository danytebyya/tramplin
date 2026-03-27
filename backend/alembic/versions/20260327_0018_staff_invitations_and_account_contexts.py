"""staff invitations and account contexts

Revision ID: 20260327_0018
Revises: 20260326_0017
Create Date: 2026-03-27 15:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260327_0018"
down_revision = "20260326_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    refresh_columns = {column["name"] for column in inspector.get_columns("refresh_sessions")}
    if "active_role" not in refresh_columns:
        op.add_column(
            "refresh_sessions",
            sa.Column("active_role", sa.Enum("guest", "applicant", "employer", "junior", "curator", "admin", name="user_role"), nullable=True),
        )
    if "active_employer_id" not in refresh_columns:
        op.add_column(
            "refresh_sessions",
            sa.Column("active_employer_id", sa.Uuid(), nullable=True),
        )
        op.create_foreign_key(
            "fk_refresh_sessions_active_employer_id_employers",
            "refresh_sessions",
            "employers",
            ["active_employer_id"],
            ["id"],
        )
    if "active_membership_id" not in refresh_columns:
        op.add_column(
            "refresh_sessions",
            sa.Column("active_membership_id", sa.Uuid(), nullable=True),
        )
        op.create_foreign_key(
            "fk_refresh_sessions_active_membership_id_employer_memberships",
            "refresh_sessions",
            "employer_memberships",
            ["active_membership_id"],
            ["id"],
        )

    tables = set(inspector.get_table_names())
    if "employer_staff_invitations" not in tables:
        op.create_table(
            "employer_staff_invitations",
            sa.Column("employer_id", sa.Uuid(), nullable=False),
            sa.Column("invited_email", sa.String(length=320), nullable=False),
            sa.Column("membership_role", sa.Enum("owner", "recruiter", "manager", "observer", name="membership_role"), nullable=False),
            sa.Column("token_hash", sa.String(length=128), nullable=False),
            sa.Column("invited_by_user_id", sa.Uuid(), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["employer_id"], ["employers.id"]),
            sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_hash"),
        )
        op.create_index(
            op.f("ix_employer_staff_invitations_invited_email"),
            "employer_staff_invitations",
            ["invited_email"],
            unique=False,
        )
        op.create_index(
            op.f("ix_employer_staff_invitations_token_hash"),
            "employer_staff_invitations",
            ["token_hash"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "employer_staff_invitations" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("employer_staff_invitations")}
        if op.f("ix_employer_staff_invitations_token_hash") in indexes:
            op.drop_index(op.f("ix_employer_staff_invitations_token_hash"), table_name="employer_staff_invitations")
        if op.f("ix_employer_staff_invitations_invited_email") in indexes:
            op.drop_index(op.f("ix_employer_staff_invitations_invited_email"), table_name="employer_staff_invitations")
        op.drop_table("employer_staff_invitations")

    refresh_columns = {column["name"] for column in inspector.get_columns("refresh_sessions")}
    foreign_keys = {fk["name"] for fk in inspector.get_foreign_keys("refresh_sessions")}
    if "fk_refresh_sessions_active_membership_id_employer_memberships" in foreign_keys:
        op.drop_constraint(
            "fk_refresh_sessions_active_membership_id_employer_memberships",
            "refresh_sessions",
            type_="foreignkey",
        )
    if "active_membership_id" in refresh_columns:
        op.drop_column("refresh_sessions", "active_membership_id")

    if "fk_refresh_sessions_active_employer_id_employers" in foreign_keys:
        op.drop_constraint(
            "fk_refresh_sessions_active_employer_id_employers",
            "refresh_sessions",
            type_="foreignkey",
        )
    if "active_employer_id" in refresh_columns:
        op.drop_column("refresh_sessions", "active_employer_id")

    if "active_role" in refresh_columns:
        op.drop_column("refresh_sessions", "active_role")
