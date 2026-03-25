from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.api.deps.auth import get_current_user
from src.db import get_db
from src.models import User
from src.repositories import FavoriteRepository, OpportunityRepository
from src.services import FavoriteService
from src.utils.responses import success_response

router = APIRouter(prefix="/favorites", tags=["favorites"])


def _build_service(db: Session) -> FavoriteService:
    return FavoriteService(FavoriteRepository(db), OpportunityRepository(db))


@router.get("/opportunities", status_code=status.HTTP_200_OK)
def list_favorite_opportunities(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    service = _build_service(db)
    return success_response({"items": service.list_opportunity_ids(str(current_user.id))})


@router.post("/opportunities/{opportunity_id}", status_code=status.HTTP_200_OK)
def add_favorite_opportunity(
    opportunity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    service = _build_service(db)
    return success_response({"items": service.add_opportunity(str(current_user.id), opportunity_id)})


@router.delete("/opportunities/{opportunity_id}", status_code=status.HTTP_200_OK)
def remove_favorite_opportunity(
    opportunity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    service = _build_service(db)
    return success_response({"items": service.remove_opportunity(str(current_user.id), opportunity_id)})
