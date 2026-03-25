from src.repositories import FavoriteRepository, OpportunityRepository
from src.utils.errors import AppError


class FavoriteService:
    def __init__(self, repo: FavoriteRepository, opportunity_repo: OpportunityRepository) -> None:
        self.repo = repo
        self.opportunity_repo = opportunity_repo

    def list_opportunity_ids(self, user_id: str) -> list[str]:
        return self.repo.list_opportunity_ids_by_user_id(user_id)

    def add_opportunity(self, user_id: str, opportunity_id: str) -> list[str]:
        if not self.opportunity_repo.exists_public_by_id(opportunity_id):
            raise AppError(
                code="FAVORITE_OPPORTUNITY_NOT_FOUND",
                message="Мероприятие или возможность не найдены",
                status_code=404,
            )

        existing_favorite = self.repo.get_opportunity(user_id, opportunity_id)
        if existing_favorite is None:
            self.repo.add_opportunity(user_id, opportunity_id)

        return self.list_opportunity_ids(user_id)

    def remove_opportunity(self, user_id: str, opportunity_id: str) -> list[str]:
        existing_favorite = self.repo.get_opportunity(user_id, opportunity_id)
        if existing_favorite is not None:
            self.repo.remove_opportunity(existing_favorite)

        return self.list_opportunity_ids(user_id)
