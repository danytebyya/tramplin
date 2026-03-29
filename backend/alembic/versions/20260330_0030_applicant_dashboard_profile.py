"""add applicant dashboard profile fields

Revision ID: 20260330_0030
Revises: 20260329_0029
Create Date: 2026-03-30 10:15:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260330_0030"
down_revision = "20260329_0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    profile_columns = {column["name"] for column in inspector.get_columns("applicant_profiles")}
    if "about" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("about", sa.Text(), nullable=True))
    if "study_course" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("study_course", sa.Integer(), nullable=True))
    if "level" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("level", sa.String(length=32), nullable=True))
    if "desired_salary_from" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("desired_salary_from", sa.Integer(), nullable=True))
    if "preferred_location" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("preferred_location", sa.String(length=120), nullable=True))
    if "employment_types" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("employment_types", sa.JSON(), nullable=True))
    if "work_formats" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("work_formats", sa.JSON(), nullable=True))
    if "hard_skills" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("hard_skills", sa.JSON(), nullable=True))
    if "soft_skills" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("soft_skills", sa.JSON(), nullable=True))
    if "languages" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("languages", sa.JSON(), nullable=True))
    if "github_url" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("github_url", sa.String(length=500), nullable=True))
    if "gitlab_url" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("gitlab_url", sa.String(length=500), nullable=True))
    if "bitbucket_url" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("bitbucket_url", sa.String(length=500), nullable=True))
    if "linkedin_url" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("linkedin_url", sa.String(length=500), nullable=True))
    if "habr_url" not in profile_columns:
        op.add_column("applicant_profiles", sa.Column("habr_url", sa.String(length=500), nullable=True))
    if "profile_views_count" not in profile_columns:
        op.add_column(
            "applicant_profiles",
            sa.Column("profile_views_count", sa.Integer(), nullable=False, server_default="0"),
        )
    if "recommendations_count" not in profile_columns:
        op.add_column(
            "applicant_profiles",
            sa.Column("recommendations_count", sa.Integer(), nullable=False, server_default="0"),
        )

    if "applicant_projects" not in tables:
        op.create_table(
            "applicant_projects",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("applicant_user_id", sa.Uuid(), nullable=False),
            sa.Column("title", sa.String(length=180), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("technologies", sa.Text(), nullable=True),
            sa.Column("period_label", sa.String(length=180), nullable=True),
            sa.Column("role_name", sa.String(length=180), nullable=True),
            sa.Column("repository_url", sa.String(length=500), nullable=True),
            sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["applicant_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        project_columns = {column["name"] for column in inspector.get_columns("applicant_projects")}
        if "technologies" not in project_columns:
            op.add_column("applicant_projects", sa.Column("technologies", sa.Text(), nullable=True))
        if "period_label" not in project_columns:
            op.add_column("applicant_projects", sa.Column("period_label", sa.String(length=180), nullable=True))
        if "role_name" not in project_columns:
            op.add_column("applicant_projects", sa.Column("role_name", sa.String(length=180), nullable=True))

    if "applicant_achievements" not in tables:
        op.create_table(
            "applicant_achievements",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("applicant_user_id", sa.Uuid(), nullable=False),
            sa.Column("title", sa.String(length=180), nullable=False),
            sa.Column("event_name", sa.String(length=255), nullable=True),
            sa.Column("project_name", sa.String(length=255), nullable=True),
            sa.Column("award", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["applicant_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if "applicant_certificates" not in tables:
        op.create_table(
            "applicant_certificates",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("applicant_user_id", sa.Uuid(), nullable=False),
            sa.Column("title", sa.String(length=180), nullable=False),
            sa.Column("organization_name", sa.String(length=255), nullable=True),
            sa.Column("issued_at", sa.Date(), nullable=True),
            sa.Column("credential_url", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["applicant_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "applicant_certificates" in tables:
        op.drop_table("applicant_certificates")

    if "applicant_achievements" in tables:
        op.drop_table("applicant_achievements")

    profile_columns = {column["name"] for column in inspector.get_columns("applicant_profiles")}
    for column_name in [
        "recommendations_count",
        "profile_views_count",
        "habr_url",
        "linkedin_url",
        "bitbucket_url",
        "gitlab_url",
        "github_url",
        "languages",
        "soft_skills",
        "hard_skills",
        "work_formats",
        "employment_types",
        "desired_salary_from",
        "preferred_location",
        "level",
        "study_course",
        "about",
    ]:
        if column_name in profile_columns:
            op.drop_column("applicant_profiles", column_name)

    if "applicant_projects" in tables:
        project_columns = {column["name"] for column in inspector.get_columns("applicant_projects")}
        for column_name in ["role_name", "period_label", "technologies"]:
            if column_name in project_columns:
                op.drop_column("applicant_projects", column_name)
