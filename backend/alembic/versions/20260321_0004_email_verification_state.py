"""persist email verification state

Revision ID: 20260321_0004
Revises: 20260320_0003
Create Date: 2026-03-21
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260321_0004"
down_revision: str | None = "20260320_0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_verification_states",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("purpose", sa.String(length=50), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=True),
        sa.Column("debug_code", sa.String(length=6), nullable=True),
        sa.Column("code_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("code_attempts_left", sa.Integer(), nullable=True),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("request_window_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verify_failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("verify_window_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", "purpose", name="uq_email_verification_states_email_purpose"),
    )
    op.create_index(
        "ix_email_verification_states_email",
        "email_verification_states",
        ["email"],
        unique=False,
    )
    op.create_index(
        "ix_email_verification_states_purpose",
        "email_verification_states",
        ["purpose"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_email_verification_states_purpose", table_name="email_verification_states")
    op.drop_index("ix_email_verification_states_email", table_name="email_verification_states")
    op.drop_table("email_verification_states")
