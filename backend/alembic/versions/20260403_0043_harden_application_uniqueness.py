"""harden application uniqueness

Revision ID: 20260403_0043
Revises: 20260402_0042
Create Date: 2026-04-03 18:15:00.000000
"""

from alembic import op
from sqlalchemy import inspect


revision = "20260403_0043"
down_revision = "20260402_0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "applications" not in existing_tables:
        return

    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY opportunity_id, applicant_user_id
                    ORDER BY
                        COALESCE(submitted_at, created_at, NOW()) DESC,
                        COALESCE(status_changed_at, submitted_at, created_at, NOW()) DESC,
                        CASE status
                            WHEN 'withdrawn'::application_status THEN 5
                            WHEN 'canceled'::application_status THEN 5
                            WHEN 'rejected'::application_status THEN 4
                            WHEN 'accepted'::application_status THEN 3
                            WHEN 'offer'::application_status THEN 3
                            WHEN 'interview'::application_status THEN 3
                            WHEN 'reserved'::application_status THEN 2
                            WHEN 'shortlisted'::application_status THEN 2
                            ELSE 1
                        END DESC,
                        COALESCE(updated_at, created_at, NOW()) DESC,
                        id DESC
                ) AS row_number
            FROM applications
            WHERE deleted_at IS NULL
              AND status NOT IN ('withdrawn'::application_status, 'canceled'::application_status)
        )
        UPDATE applications AS application
        SET
            deleted_at = NOW(),
            updated_at = NOW()
        FROM ranked
        WHERE application.id = ranked.id
          AND ranked.row_number > 1
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_applications_single_active")
    op.execute("DROP INDEX IF EXISTS uq_applications_single_non_canceled")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_single_blocking
        ON applications (opportunity_id, applicant_user_id)
        WHERE deleted_at IS NULL
          AND status NOT IN ('withdrawn'::application_status, 'canceled'::application_status)
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "applications" not in existing_tables:
        return

    op.execute("DROP INDEX IF EXISTS uq_applications_single_blocking")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_single_active
        ON applications (opportunity_id, applicant_user_id)
        WHERE deleted_at IS NULL
          AND status NOT IN ('withdrawn'::application_status, 'rejected'::application_status, 'canceled'::application_status)
        """
    )
