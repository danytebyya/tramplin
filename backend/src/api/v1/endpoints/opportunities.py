from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.api.deps.auth import get_current_access_payload, get_current_user
from src.db import get_db
from src.models import User
from src.repositories import OpportunityRepository
from src.schemas.opportunity import EmployerOpportunityUpsertRequest
from src.services import OpportunityService
from src.utils.responses import success_response

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


@router.get("", status_code=status.HTTP_200_OK)
def list_opportunities(db: Session = Depends(get_db)) -> dict:
    service = OpportunityService(OpportunityRepository(db))
    return success_response({"items": service.list_public_feed()})


@router.get("/mine", status_code=status.HTTP_200_OK)
def list_my_opportunities(
    current_user: User = Depends(get_current_user),
    access_payload: dict = Depends(get_current_access_payload),
    db: Session = Depends(get_db),
) -> dict:
    service = OpportunityService(OpportunityRepository(db))
    return success_response({"items": [item.model_dump(mode="json") for item in service.list_employer_items(current_user, access_payload=access_payload)]})


@router.post("", status_code=status.HTTP_201_CREATED)
def create_opportunity(
    payload: EmployerOpportunityUpsertRequest,
    current_user: User = Depends(get_current_user),
    access_payload: dict = Depends(get_current_access_payload),
    db: Session = Depends(get_db),
) -> dict:
    service = OpportunityService(OpportunityRepository(db))
    item = service.create_employer_item(current_user, payload, access_payload=access_payload)
    return success_response(item.model_dump(mode="json"))


@router.put("/{opportunity_id}", status_code=status.HTTP_200_OK)
def update_opportunity(
    opportunity_id: str,
    payload: EmployerOpportunityUpsertRequest,
    current_user: User = Depends(get_current_user),
    access_payload: dict = Depends(get_current_access_payload),
    db: Session = Depends(get_db),
) -> dict:
    service = OpportunityService(OpportunityRepository(db))
    item = service.update_employer_item(current_user, opportunity_id, payload, access_payload=access_payload)
    return success_response(item.model_dump(mode="json"))


@router.delete("/{opportunity_id}", status_code=status.HTTP_200_OK)
def delete_opportunity(
    opportunity_id: str,
    current_user: User = Depends(get_current_user),
    access_payload: dict = Depends(get_current_access_payload),
    db: Session = Depends(get_db),
) -> dict:
    service = OpportunityService(OpportunityRepository(db))
    service.delete_employer_item(current_user, opportunity_id, access_payload=access_payload)
    return success_response({"id": opportunity_id})
