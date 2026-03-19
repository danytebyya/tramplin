from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.db import get_db
from src.models import User
from src.schemas.auth import RegisterRequest
from src.schemas.user import UserRead
from src.services import AuthService
from src.utils.responses import success_response

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    user = AuthService(db).register(payload)
    return success_response({"user": UserRead.model_validate(user).model_dump(mode="json")})


@router.get("/me", status_code=status.HTTP_200_OK)
def read_me(current_user: User = Depends(get_current_user)) -> dict:
    return success_response({"user": UserRead.model_validate(current_user).model_dump(mode="json")})
