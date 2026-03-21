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


def _serialize_auth_user(user: User, *, has_employer_profile: bool) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role.value,
        "status": user.status.value,
        "has_employer_profile": has_employer_profile,
    }


@router.post("/email/check", status_code=status.HTTP_200_OK)
def check_email_availability(
    payload: EmailCheckRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    service = EmailVerificationService(db, AuthService(db).user_repo)
    service.ensure_email_check_allowed(request.client.host if request.client else None)
    return success_response({"exists": not service.check_email_availability(payload.email)})


@router.post("/email/request-code", status_code=status.HTTP_200_OK)
def request_registration_code(
    payload: VerificationCodeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    service = EmailVerificationService(db, AuthService(db).user_repo)
    service.request_registration_code(
        payload.email,
        ip_address=request.client.host if request.client else None,
        force_resend=payload.force_resend,
    )
    return success_response({"message": "Код подтверждения отправлен на email"})


@router.post("/email/verify-code", status_code=status.HTTP_200_OK)
def verify_registration_code(
    payload: VerificationCodeVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    service = EmailVerificationService(db, AuthService(db).user_repo)
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
    token_data["user"] = _serialize_auth_user(
        token_data["user"],
        has_employer_profile=token_data.pop("has_employer_profile"),
    )
    return success_response(token_data)


@router.post("/tokens")
def create_tokens(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)) -> dict:
    service = AuthService(db)
    token_data = service.refresh(
        refresh_token=payload.refresh_token,
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
    )
    token_data["user"] = _serialize_auth_user(
        token_data["user"],
        has_employer_profile=token_data.pop("has_employer_profile"),
    )
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
