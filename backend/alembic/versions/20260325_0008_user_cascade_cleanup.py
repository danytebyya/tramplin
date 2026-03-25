"""add cascade delete for user-owned profile/session records

Revision ID: 20260325_0008
Revises: 20260325_0007
Create Date: 2026-03-25
"""

from typing import Sequence

from alembic import op

revision: str = "20260325_0008"
down_revision: str | None = "20260325_0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("applicant_profiles_user_id_fkey", "applicant_profiles", type_="foreignkey")
    op.create_foreign_key(
        "applicant_profiles_user_id_fkey",
        "applicant_profiles",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("employer_profiles_user_id_fkey", "employer_profiles", type_="foreignkey")
    op.create_foreign_key(
        "employer_profiles_user_id_fkey",
        "employer_profiles",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("curator_profiles_user_id_fkey", "curator_profiles", type_="foreignkey")
    op.create_foreign_key(
        "curator_profiles_user_id_fkey",
        "curator_profiles",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("refresh_sessions_user_id_fkey", "refresh_sessions", type_="foreignkey")
    op.create_foreign_key(
        "refresh_sessions_user_id_fkey",
        "refresh_sessions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("refresh_sessions_user_id_fkey", "refresh_sessions", type_="foreignkey")
    op.create_foreign_key(
        "refresh_sessions_user_id_fkey",
        "refresh_sessions",
        "users",
        ["user_id"],
        ["id"],
    )

    op.drop_constraint("curator_profiles_user_id_fkey", "curator_profiles", type_="foreignkey")
    op.create_foreign_key(
        "curator_profiles_user_id_fkey",
        "curator_profiles",
        "users",
        ["user_id"],
        ["id"],
    )

    op.drop_constraint("employer_profiles_user_id_fkey", "employer_profiles", type_="foreignkey")
    op.create_foreign_key(
        "employer_profiles_user_id_fkey",
        "employer_profiles",
        "users",
        ["user_id"],
        ["id"],
    )

    op.drop_constraint("applicant_profiles_user_id_fkey", "applicant_profiles", type_="foreignkey")
    op.create_foreign_key(
        "applicant_profiles_user_id_fkey",
        "applicant_profiles",
        "users",
        ["user_id"],
        ["id"],
    )
