"""domain core schema

Revision ID: 20260320_0002
Revises: 20260319_0001
Create Date: 2026-03-20
"""

from pathlib import Path
from typing import Sequence

from alembic import op

revision: str = "20260320_0002"
down_revision: str | None = "20260319_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _read_sql(filename: str) -> str:
    sql_path = Path(__file__).resolve().parents[2] / "sql" / "migrations" / filename
    return sql_path.read_text(encoding="utf-8")


def upgrade() -> None:
    op.execute(_read_sql("20260320_0002_up.sql"))


def downgrade() -> None:
    op.execute(_read_sql("20260320_0002_down.sql"))
