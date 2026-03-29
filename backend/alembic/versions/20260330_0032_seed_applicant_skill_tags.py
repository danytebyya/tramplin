"""seed applicant skill tags

Revision ID: 20260330_0032
Revises: 20260330_0031
Create Date: 2026-03-30 12:00:00
"""

from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "20260330_0032"
down_revision = "20260330_0031"
branch_labels = None
depends_on = None


TAG_GROUPS = [
    {
        "slug": "applicant-hard-skills",
        "name": "Hard skills",
        "tag_type": "skill",
        "items": [
            "Python",
            "Django",
            "FastAPI",
            "TypeScript",
            "React",
            "PostgreSQL",
            "MySQL",
            "Docker",
            "Git",
            "REST API",
        ],
    },
    {
        "slug": "applicant-soft-skills",
        "name": "Soft skills",
        "tag_type": "skill",
        "items": [
            "Командная работа",
            "Коммуникабельность",
            "Аналитическое мышление",
            "Ответственность",
            "Критическое мышление",
            "Тайм-менеджмент",
        ],
    },
    {
        "slug": "spoken-languages",
        "name": "Языки",
        "tag_type": "language",
        "items": [
            "Русский",
            "Английский A1",
            "Английский A2",
            "Английский B1",
            "Английский B2",
            "Английский C1",
            "Английский C2",
            "Немецкий",
            "Французский",
            "Испанский",
            "Китайский",
        ],
    },
]


def _upsert_tag(connection, *, slug: str, name: str, tag_type: str, parent_id=None) -> str:
    existing = connection.execute(
        sa.text("select id from tags where slug = :slug"),
        {"slug": slug},
    ).scalar_one_or_none()

    if existing is not None:
        connection.execute(
            sa.text(
                """
                update tags
                set name = :name,
                    tag_type = cast(:tag_type as tag_type),
                    parent_id = :parent_id,
                    moderation_status = cast('approved' as moderation_status),
                    is_system = true,
                    updated_at = now()
                where id = :id
                """
            ),
            {
                "id": existing,
                "name": name,
                "tag_type": tag_type,
                "parent_id": parent_id,
            },
        )
        return str(existing)

    tag_id = str(uuid4())
    connection.execute(
        sa.text(
            """
            insert into tags (
                id, slug, name, tag_type, parent_id, moderation_status, is_system, created_at, updated_at
            ) values (
                :id, :slug, :name, cast(:tag_type as tag_type), :parent_id,
                cast('approved' as moderation_status), true, now(), now()
            )
            """
        ),
        {
            "id": tag_id,
            "slug": slug,
            "name": name,
            "tag_type": tag_type,
            "parent_id": parent_id,
        },
    )
    return tag_id


def upgrade() -> None:
    connection = op.get_bind()
    for group in TAG_GROUPS:
        parent_id = _upsert_tag(
            connection,
            slug=group["slug"],
            name=group["name"],
            tag_type=group["tag_type"],
        )
        for item_name in group["items"]:
            item_slug = f"{group['slug']}-{item_name.lower().replace(' ', '-').replace('.', '').replace('/', '-')}"
            _upsert_tag(
                connection,
                slug=item_slug,
                name=item_name,
                tag_type=group["tag_type"],
                parent_id=parent_id,
            )


def downgrade() -> None:
    connection = op.get_bind()
    slugs = [group["slug"] for group in TAG_GROUPS]
    connection.execute(
        sa.text(
            """
            delete from tags
            where slug = any(:slugs)
               or parent_id in (select id from tags where slug = any(:slugs))
            """
        ).bindparams(sa.bindparam("slugs", expanding=False)),
        {"slugs": slugs},
    )
