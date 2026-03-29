"""add opportunity detail columns

Revision ID: 20260330_0034
Revises: 20260330_0033
Create Date: 2026-03-30 01:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260330_0034"
down_revision = "20260330_0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("opportunities")}

    if "event_type" not in columns:
        op.add_column("opportunities", sa.Column("event_type", sa.String(length=120), nullable=True))
    if "mentorship_direction" not in columns:
        op.add_column("opportunities", sa.Column("mentorship_direction", sa.String(length=120), nullable=True))
    if "mentor_experience" not in columns:
        op.add_column("opportunities", sa.Column("mentor_experience", sa.String(length=120), nullable=True))

    opportunity_tags = sa.table(
        "opportunity_tags",
        sa.column("opportunity_id", sa.Uuid()),
        sa.column("tag_id", sa.Uuid()),
    )
    tags = sa.table(
        "tags",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("tag_type", sa.String()),
    )
    opportunities = sa.table(
        "opportunities",
        sa.column("id", sa.Uuid()),
        sa.column("event_type", sa.String()),
        sa.column("mentorship_direction", sa.String()),
        sa.column("mentor_experience", sa.String()),
        sa.column("level", sa.String()),
        sa.column("opportunity_type", sa.String()),
    )

    event_links = sa.text(
        """
        select opportunity_tags.opportunity_id, tags.name
        from opportunity_tags
        join tags on opportunity_tags.tag_id = tags.id
        where tags.tag_type = cast(:tag_type as tag_type)
        """
    )
    for opportunity_id, name in bind.execute(event_links, {"tag_type": "event_topic"}):
        bind.execute(
            opportunities.update()
            .where(opportunities.c.id == opportunity_id)
            .values(event_type=name)
        )

    mentorship_links = sa.text(
        """
        select opportunity_tags.opportunity_id, tags.name
        from opportunity_tags
        join tags on opportunity_tags.tag_id = tags.id
        where tags.tag_type = cast(:tag_type as tag_type)
        """
    )
    for opportunity_id, name in bind.execute(mentorship_links, {"tag_type": "direction"}):
        bind.execute(
            opportunities.update()
            .where(opportunities.c.id == opportunity_id)
            .values(mentorship_direction=name)
        )

    mentor_experience_rows = bind.execute(
        sa.select(opportunities.c.id, opportunities.c.level).where(
            opportunities.c.opportunity_type == sa.cast(
                "mentorship_program",
                sa.Enum(
                    "internship",
                    "vacancy",
                    "mentorship_program",
                    "career_event",
                    name="opportunity_type",
                    create_type=False,
                ),
            )
        )
    )
    level_to_label = {
        "junior": "Junior+",
        "middle": "Middle+",
        "senior": "Senior",
        "lead": "Senior",
        "executive": "Senior",
        "entry": "Junior+",
        "student": "Junior+",
    }
    for opportunity_id, level in mentor_experience_rows:
        bind.execute(
            opportunities.update()
            .where(opportunities.c.id == opportunity_id)
            .values(mentor_experience=level_to_label.get(level, "Middle+"))
        )


def downgrade() -> None:
    op.drop_column("opportunities", "mentor_experience")
    op.drop_column("opportunities", "mentorship_direction")
    op.drop_column("opportunities", "event_type")
