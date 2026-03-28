from src.models import ModerationStatus, Tag
from src.repositories import TagRepository


class TagService:
    def __init__(self, repo: TagRepository) -> None:
        self.repo = repo

    def list_catalog(self) -> list[dict]:
        return [self._serialize_category(item) for item in self.repo.list_catalog()]

    def _serialize_category(self, category: Tag) -> dict:
        children = sorted(
            [
                child
                for child in category.children
                if child.deleted_at is None and child.moderation_status == ModerationStatus.APPROVED
            ],
            key=lambda item: item.name.lower(),
        )

        return {
            "id": str(category.id),
            "slug": category.slug,
            "name": category.name,
            "tag_type": category.tag_type.value,
            "items": [self._serialize_tag(item) for item in children],
        }

    @staticmethod
    def _serialize_tag(tag: Tag) -> dict:
        return {
            "id": str(tag.id),
            "slug": tag.slug,
            "name": tag.name,
            "tag_type": tag.tag_type.value,
        }
