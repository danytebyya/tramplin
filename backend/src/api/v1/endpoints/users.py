from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.db import get_db
from src.models import User
from src.schemas.auth import RegisterRequest
from src.schemas.user import ApplicantProfileRead, CuratorProfileRead, EmployerProfileRead, UserRead
from src.services import AuthService
from src.utils.responses import success_response

router = APIRouter(prefix="/users", tags=["users"])


def _serialize_user(user: User) -> dict:
    return UserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        status=user.status,
        created_at=user.created_at,
        applicant_profile=(
            ApplicantProfileRead.model_validate(user.applicant_profile)
            if user.role.value == "applicant" and user.applicant_profile is not None
            else None
        ),
        employer_profile=(
            EmployerProfileRead.model_validate(user.employer_profile)
            if user.role.value == "employer" and user.employer_profile is not None
            else None
        ),
        curator_profile=(
            CuratorProfileRead.model_validate(user.curator_profile)
            if user.role.value == "curator" and user.curator_profile is not None
            else None
        ),
    ).model_dump(mode="json")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    user = AuthService(db).register(payload)
    return success_response({"user": _serialize_user(user)})


@router.get("/me", status_code=status.HTTP_200_OK)
def read_me(current_user: User = Depends(get_current_user)) -> dict:
    return success_response({"user": _serialize_user(current_user)})
