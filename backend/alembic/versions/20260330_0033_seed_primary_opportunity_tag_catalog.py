"""seed primary opportunity tag catalog

Revision ID: 20260330_0033
Revises: 20260330_0032
Create Date: 2026-03-30 13:05:00
"""

from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "20260330_0033"
down_revision = "20260330_0032"
branch_labels = None
depends_on = None


TAG_GROUPS = [
    {
        "slug": "programming-languages",
        "name": "Языки программирования",
        "tag_type": "language",
        "items": [
            "Python", "JavaScript", "TypeScript", "Java", "C#", "C++", "Go", "Rust", "Kotlin", "Swift",
            "PHP", "Ruby", "Dart", "Scala", "Haskell", "Elixir", "Bash", "Shell",
        ],
    },
    {
        "slug": "backend",
        "name": "Backend",
        "tag_type": "technology",
        "items": [
            "FastAPI", "Django", "Flask", "Spring", "Spring Boot", "ASP.NET", "Node.js", "Express",
            "NestJS", "Laravel", "Ruby on Rails", "GraphQL", "REST API", "gRPC", "Microservices",
        ],
    },
    {
        "slug": "frontend",
        "name": "Frontend",
        "tag_type": "technology",
        "items": [
            "React", "Next.js", "Vue", "Nuxt.js", "Angular", "Svelte", "HTML", "CSS", "SCSS",
            "Tailwind", "Redux", "Zustand", "Webpack", "Vite",
        ],
    },
    {
        "slug": "databases",
        "name": "Базы данных",
        "tag_type": "technology",
        "items": [
            "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Elasticsearch", "Firebase",
            "Supabase", "Oracle", "Cassandra",
        ],
    },
    {
        "slug": "devops-infra",
        "name": "DevOps / Инфраструктура",
        "tag_type": "skill",
        "items": [
            "Docker", "Kubernetes", "CI/CD", "GitHub Actions", "GitLab CI", "Jenkins", "Nginx",
            "Apache", "Terraform", "Ansible", "Helm",
        ],
    },
    {
        "slug": "cloud",
        "name": "Облака",
        "tag_type": "skill",
        "items": [
            "AWS", "Azure", "Google Cloud", "Yandex Cloud", "Vercel", "Netlify", "DigitalOcean",
        ],
    },
    {
        "slug": "testing",
        "name": "Тестирование",
        "tag_type": "skill",
        "items": [
            "Unit Testing", "Integration Testing", "E2E Testing", "PyTest", "Jest", "Mocha",
            "Cypress", "Playwright", "Selenium",
        ],
    },
    {
        "slug": "security",
        "name": "Безопасность",
        "tag_type": "skill",
        "items": [
            "OAuth", "JWT", "Auth", "Encryption", "HTTPS", "Web Security", "OWASP", "RBAC",
        ],
    },
    {
        "slug": "mobile",
        "name": "Mobile",
        "tag_type": "technology",
        "items": [
            "React Native", "Flutter", "iOS", "Android", "SwiftUI", "Kotlin Multiplatform",
        ],
    },
    {
        "slug": "data-ai",
        "name": "Data / AI",
        "tag_type": "skill",
        "items": [
            "Machine Learning", "Deep Learning", "Data Science", "Pandas", "NumPy", "TensorFlow",
            "PyTorch", "OpenCV", "NLP", "LLM", "Computer Vision",
        ],
    },
    {
        "slug": "analytics",
        "name": "Аналитика",
        "tag_type": "skill",
        "items": [
            "Data Analysis", "Power BI", "Tableau", "Excel", "SQL Analytics", "Big Data",
            "Hadoop", "Spark",
        ],
    },
    {
        "slug": "other-useful",
        "name": "Другое",
        "tag_type": "skill",
        "items": [
            "Git", "GitHub", "GitLab", "API Design", "System Design", "Agile", "Scrum", "Kanban",
            "Clean Architecture", "OOP", "Design Patterns",
        ],
    },
    {
        "slug": "level-format",
        "name": "Уровень / формат",
        "tag_type": "level",
        "items": [
            "Junior", "Middle", "Senior", "Intern", "Remote", "Office", "Hybrid",
            "Full-time", "Part-time", "Contract",
        ],
    },
    {
        "slug": "specialization",
        "name": "Специализация",
        "tag_type": "specialization",
        "items": [
            "Backend", "Frontend", "Fullstack", "DevOps", "QA", "Data Engineer", "ML Engineer",
            "Product Manager", "UI/UX Designer",
        ],
    },
]


def _slugify_item(value: str) -> str:
    return (
        value.lower()
        .replace(" / ", "-")
        .replace("/", "-")
        .replace(".", "")
        .replace("+", "plus")
        .replace("#", "sharp")
        .replace(" ", "-")
    )


def _upsert_tag(connection, *, slug: str, name: str, tag_type: str, parent_id=None) -> str:
    existing = connection.execute(
        sa.text("select id from tags where slug = :slug"),
        {"slug": slug},
    ).scalar_one_or_none()

    if existing is None:
        existing = connection.execute(
            sa.text(
                """
                select id
                from tags
                where deleted_at is null
                  and tag_type = cast(:tag_type as tag_type)
                  and lower(name) = lower(:name)
                limit 1
                """
            ),
            {
                "name": name,
                "tag_type": tag_type,
            },
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
            _upsert_tag(
                connection,
                slug=f"{group['slug']}-{_slugify_item(item_name)}",
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
