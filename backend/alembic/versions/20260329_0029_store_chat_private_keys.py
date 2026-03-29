"""store chat private keys

Revision ID: 20260329_0029
Revises: 20260329_0028
Create Date: 2026-03-29 23:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260329_0029"
down_revision = "20260329_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_user_keys", sa.Column("private_key_jwk", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_user_keys", "private_key_jwk")
