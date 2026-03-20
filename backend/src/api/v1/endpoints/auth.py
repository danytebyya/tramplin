from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.db import get_db
from src.models import User
from src.schemas.auth import (
    EmailCheckRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    VerificationCodeRequest,
    VerificationCodeVerifyRequest,
)
from src.services import AuthService, EmailVerificationService
from src.utils.responses import success_response

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/email/check", status_code=status.HTTP_200_OK)
def check_email_availability(
    payload: EmailCheckRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    service = EmailVerificationService(AuthService(db).user_repo)
    service.ensure_email_check_allowed(request.client.host if request.client else None)
    return success_response({"exists": not service.check_email_availability(payload.email)})


@router.post("/email/request-code", status_code=status.HTTP_200_OK)
def request_registration_code(
    payload: VerificationCodeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    service = EmailVerificationService(AuthService(db).user_repo)
    service.request_registration_code(
        payload.email,
        ip_address=request.client.host if request.client else None,
    )
    return success_response({"message": "Код подтверждения отправлен на email"})


@router.post("/email/verify-code", status_code=status.HTTP_200_OK)
def verify_registration_code(
    payload: VerificationCodeVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    service = EmailVerificationService(AuthService(db).user_repo)
    service.verify_registration_code(
        payload.email,
        payload.code,
        ip_address=request.client.host if request.client else None,
    )
    return success_response({"message": "Код подтверждён"})



@router.post("/sessions", status_code=status.HTTP_201_CREATED)
def create_session(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> dict:
    service = AuthService(db)
    token_data = service.login(
        payload=payload,
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
    )
    token_data["user"] = {
        "id": str(token_data["user"].id),
        "email": token_data["user"].email,
        "display_name": token_data["user"].display_name,
        "role": token_data["user"].role.value,
        "status": token_data["user"].status.value,
    }
    return success_response(token_data)


@router.post("/tokens")
def create_tokens(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)) -> dict:
    service = AuthService(db)
    token_data = service.refresh(
        refresh_token=payload.refresh_token,
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
    )
    token_data["user"] = {
        "id": str(token_data["user"].id),
        "email": token_data["user"].email,
        "display_name": token_data["user"].display_name,
        "role": token_data["user"].role.value,
        "status": token_data["user"].status.value,
    }
    return success_response(token_data)


@router.delete("/sessions/current", status_code=status.HTTP_200_OK)
def delete_current_session(
    payload: LogoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    AuthService(db).logout(user_id=str(current_user.id), refresh_token=payload.refresh_token)
    return success_response({"message": "Session revoked"})


@router.delete("/sessions", status_code=status.HTTP_200_OK)
def delete_all_sessions(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    AuthService(db).logout_all(user_id=str(current_user.id))
    return success_response({"message": "All sessions revoked"})
