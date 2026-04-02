"""store chat message key snapshots

Revision ID: 20260401_0039
Revises: 20260331_0038
Create Date: 2026-04-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_0039"
down_revision = "20260331_0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("sender_public_key_jwk", sa.JSON(), nullable=True))
    op.add_column("chat_messages", sa.Column("recipient_public_key_jwk", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "recipient_public_key_jwk")
    op.drop_column("chat_messages", "sender_public_key_jwk")
