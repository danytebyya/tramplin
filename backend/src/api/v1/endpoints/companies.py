from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.db import get_db
from src.models import User
from src.schemas.company import EmployerOnboardingRequest
from src.schemas.user import UserRead
from src.services import EmployerService
from src.utils.responses import success_response

router = APIRouter(prefix="/companies", tags=["companies"])


@router.put("/profile", status_code=status.HTTP_200_OK)
def upsert_employer_profile(
    payload: EmployerOnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    EmployerService(db).upsert_profile(current_user=current_user, payload=payload)
    db.refresh(current_user)
    return success_response({"user": UserRead.model_validate(current_user).model_dump(mode="json")})
