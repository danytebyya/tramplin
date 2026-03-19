from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.db import get_db
from src.models import User
from src.schemas.auth import LoginRequest, LogoutRequest, RefreshRequest, RegisterRequest
from src.schemas.user import UserRead
from src.services import AuthService
from src.utils.responses import success_response

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    user = AuthService(db).register(payload)
    return success_response({"user": UserRead.model_validate(user).model_dump(mode="json")})


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> dict:
    service = AuthService(db)
    token_data = service.login(
        payload=payload,
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
    )
    token_data["user"] = UserRead.model_validate(token_data["user"]).model_dump(mode="json")
    return success_response(token_data)


@router.post("/refresh")
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)) -> dict:
    service = AuthService(db)
    token_data = service.refresh(
        refresh_token=payload.refresh_token,
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
    )
    token_data["user"] = UserRead.model_validate(token_data["user"]).model_dump(mode="json")
    return success_response(token_data)


@router.get("/me")
def me(current_user: User = Depends(get_current_user)) -> dict:
    return success_response({"user": UserRead.model_validate(current_user).model_dump(mode="json")})


@router.post("/logout")
def logout(
    payload: LogoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    AuthService(db).logout(user_id=str(current_user.id), refresh_token=payload.refresh_token)
    return success_response({"message": "Logged out"})


@router.post("/logout-all")
def logout_all(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    AuthService(db).logout_all(user_id=str(current_user.id))
    return success_response({"message": "All sessions revoked"})
