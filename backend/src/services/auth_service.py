from datetime import UTC, datetime

from sqlalchemy.orm import Session

from src.core.security import (
    TokenPayloadError,
    create_access_token,
    create_refresh_token,
    decode_token,
    ensure_token_type,
    hash_password,
    hash_token,
    verify_password,
)
from src.enums import EmployerVerificationStatus, TokenType, UserRole, UserStatus
from src.models import ApplicantProfile, EmployerProfile, RefreshSession, User
from src.repositories import AuthRepository, UserRepository
from src.schemas.auth import LoginRequest, RegisterRequest
from src.utils.errors import AppError


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.auth_repo = AuthRepository(db)

    def register(self, payload: RegisterRequest) -> User:
        if payload.role not in {UserRole.APPLICANT, UserRole.EMPLOYER}:
            raise AppError(
                code="AUTH_ROLE_NOT_ALLOWED",
                message="Only applicant and employer roles can self-register",
                status_code=422,
            )

        if self.user_repo.get_by_email(payload.email):
            raise AppError(
                code="AUTH_EMAIL_EXISTS",
                message="User with this email already exists",
                status_code=409,
            )

        user = User(
            email=payload.email.lower(),
            display_name=payload.display_name,
            password_hash=hash_password(payload.password),
            role=payload.role,
            status=UserStatus.ACTIVE,
        )

        if payload.role == UserRole.APPLICANT:
            user.applicant_profile = ApplicantProfile(
                full_name=payload.applicant_profile.full_name
                if payload.applicant_profile
                else None,
                university=payload.applicant_profile.university
                if payload.applicant_profile
                else None,
                graduation_year=payload.applicant_profile.graduation_year
                if payload.applicant_profile
                else None,
            )

        if payload.role == UserRole.EMPLOYER:
            if payload.employer_profile is None:
                raise AppError(
                    code="AUTH_EMPLOYER_PROFILE_REQUIRED",
                    message="Employer profile payload is required",
                    status_code=422,
                )
            user.employer_profile = EmployerProfile(
                company_name=payload.employer_profile.company_name,
                inn=payload.employer_profile.inn,
                corporate_email=payload.employer_profile.corporate_email,
                website=payload.employer_profile.website,
                verification_status=EmployerVerificationStatus.UNVERIFIED,
            )

        self.user_repo.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def login(self, payload: LoginRequest, user_agent: str | None, ip_address: str | None) -> dict:
        user = self.user_repo.get_by_email(payload.email.lower())
        if user is None or not verify_password(payload.password, user.password_hash):
            raise AppError(
                code="AUTH_INVALID_CREDENTIALS",
                message="Invalid email or password",
                status_code=401,
            )

        if user.status != UserStatus.ACTIVE:
            raise AppError(
                code="AUTH_USER_NOT_ACTIVE", message="User account is not active", status_code=403
            )

        access_token, access_exp = create_access_token(subject=str(user.id), role=user.role.value)
        refresh_token, refresh_exp, jti = create_refresh_token(subject=str(user.id))

        session = RefreshSession(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            jti=jti,
            user_agent=user_agent,
            ip_address=ip_address,
            expires_at=refresh_exp,
        )
        self.auth_repo.create_session(session)
        self.db.commit()

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": int((access_exp - datetime.now(UTC)).total_seconds()),
            "user": user,
        }

    def refresh(self, refresh_token: str, user_agent: str | None, ip_address: str | None) -> dict:
        try:
            payload = ensure_token_type(decode_token(refresh_token), TokenType.REFRESH)
        except TokenPayloadError as exc:
            raise AppError(code="AUTH_INVALID_REFRESH", message=str(exc), status_code=401) from exc

        token_hash_value = hash_token(refresh_token)
        active_session = self.auth_repo.get_active_session_by_hash(token_hash_value)
        if active_session is None:
            raise AppError(
                code="AUTH_REFRESH_REVOKED",
                message="Refresh session is invalid or expired",
                status_code=401,
            )

        user = self.user_repo.get_by_id(str(payload.get("sub")))
        if user is None:
            raise AppError(code="AUTH_USER_NOT_FOUND", message="User not found", status_code=404)

        self.auth_repo.revoke_session(str(active_session.id))

        access_token, access_exp = create_access_token(subject=str(user.id), role=user.role.value)
        new_refresh_token, refresh_exp, jti = create_refresh_token(subject=str(user.id))

        session = RefreshSession(
            user_id=user.id,
            token_hash=hash_token(new_refresh_token),
            jti=jti,
            user_agent=user_agent,
            ip_address=ip_address,
            expires_at=refresh_exp,
        )
        self.auth_repo.create_session(session)
        self.db.commit()

        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": int((access_exp - datetime.now(UTC)).total_seconds()),
            "user": user,
        }

    def logout(self, user_id: str, refresh_token: str) -> None:
        token_hash_value = hash_token(refresh_token)
        session = self.auth_repo.get_active_session_by_hash(token_hash_value)
        if session and str(session.user_id) == user_id:
            self.auth_repo.revoke_session(str(session.id))
            self.db.commit()

    def logout_all(self, user_id: str) -> None:
        self.auth_repo.revoke_all_user_sessions(user_id)
        self.db.commit()
