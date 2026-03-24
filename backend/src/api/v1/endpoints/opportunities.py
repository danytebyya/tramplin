from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.db import get_db
from src.repositories import OpportunityRepository
from src.services import OpportunityService
from src.utils.responses import success_response

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


@router.get("", status_code=status.HTTP_200_OK)
def list_opportunities(db: Session = Depends(get_db)) -> dict:
    service = OpportunityService(OpportunityRepository(db))
    return success_response({"items": service.list_public_feed()})
