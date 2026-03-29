"""add user public id

Revision ID: 20260328_0025
Revises: 20260328_0024
Create Date: 2026-03-28 22:45:00.000000
"""

import random

from alembic import op
import sqlalchemy as sa


revision = "20260328_0025"
down_revision = "20260328_0024"
branch_labels = None
depends_on = None


def _generate_public_id(existing_ids: set[str]) -> str:
    while True:
        candidate = f"{random.SystemRandom().randrange(10_000_000, 100_000_000)}"
        if candidate not in existing_ids:
            existing_ids.add(candidate)
            return candidate


def upgrade() -> None:
    op.add_column("users", sa.Column("public_id", sa.String(length=8), nullable=True))
    op.create_index("ix_users_public_id", "users", ["public_id"], unique=True)

    bind = op.get_bind()
    rows = bind.execute(sa.text("select id, role from users")).mappings().all()
    existing_ids = {
        row[0]
        for row in bind.execute(sa.text("select public_id from users where public_id is not null")).all()
        if row[0] is not None
    }

    for row in rows:
        if row["role"] == "curator":
            continue
        bind.execute(
            sa.text("update users set public_id = :public_id where id = :user_id"),
            {
                "public_id": _generate_public_id(existing_ids),
                "user_id": row["id"],
            },
        )


def downgrade() -> None:
    op.drop_index("ix_users_public_id", table_name="users")
    op.drop_column("users", "public_id")
