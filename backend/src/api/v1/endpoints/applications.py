from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_access_payload, get_current_user
from src.db import get_db
from src.models import User
from src.schemas.application import ApplicationSubmitRequest, EmployerApplicationStatusUpdateRequest
from src.services.application_service import ApplicationService
from src.utils.responses import success_response

router = APIRouter(prefix="/applications", tags=["applications"])


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_application(
    payload: ApplicationSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response = ApplicationService(db).submit(current_user, payload)
    return success_response(response.model_dump(mode="json"))


@router.get("/mine/opportunity-ids", status_code=status.HTTP_200_OK)
def list_my_application_opportunity_ids(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response = ApplicationService(db).list_my_opportunity_ids(current_user)
    return success_response(response.model_dump(mode="json"))


@router.get("/mine", status_code=status.HTTP_200_OK)
def list_my_applications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response = ApplicationService(db).list_mine(current_user)
    return success_response(response.model_dump(mode="json"))


@router.get("/employer", status_code=status.HTTP_200_OK)
def list_employer_applications(
    current_user: User = Depends(get_current_user),
    access_payload: dict = Depends(get_current_access_payload),
    db: Session = Depends(get_db),
) -> dict:
    response = ApplicationService(db).list_for_employer(current_user, access_payload=access_payload)
    return success_response(response.model_dump(mode="json"))


@router.patch("/{application_id}/status", status_code=status.HTTP_200_OK)
def update_application_status(
    application_id: str,
    payload: EmployerApplicationStatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    access_payload: dict = Depends(get_current_access_payload),
    db: Session = Depends(get_db),
) -> dict:
    response = ApplicationService(db).update_employer_response(
        application_id,
        current_user,
        payload,
        access_payload=access_payload,
    )
    return success_response(response.model_dump(mode="json"))


@router.delete("/{opportunity_id}", status_code=status.HTTP_200_OK)
def withdraw_application(
    opportunity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    response = ApplicationService(db).withdraw(current_user, opportunity_id)
    return success_response(response.model_dump(mode="json"))
