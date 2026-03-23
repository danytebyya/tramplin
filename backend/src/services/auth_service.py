import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from src.core.config import settings
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
from src.enums import TokenType, UserRole, UserStatus
from src.models import ApplicantProfile, RefreshSession, User
from src.repositories import AuthRepository, UserRepository
from src.schemas.auth import LoginRequest, RegisterRequest
from src.services.email_verification_service import EmailVerificationService
from src.services.rate_limit_service import rate_limit_service
from src.utils.errors import AppError


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.auth_repo = AuthRepository(db)

    logger = logging.getLogger(__name__)

    def register(self, payload: RegisterRequest) -> User:
        normalized_email = payload.email.lower()
        if payload.role not in {UserRole.APPLICANT, UserRole.EMPLOYER}:
            raise AppError(
                code="AUTH_ROLE_NOT_ALLOWED",
                message="Самостоятельная регистрация доступна только соискателям и работодателям",
                status_code=422,
            )

        if self.user_repo.get_by_email(normalized_email):
            self.logger.warning("auth.register.email_exists email=%s", normalized_email)
            raise AppError(
                code="AUTH_EMAIL_EXISTS",
                message="Аккаунт с такой почтой уже зарегистрирован",
                status_code=409,
            )

        self.logger.info(
            "auth.register.verify_code email=%s role=%s",
            normalized_email,
            payload.role.value,
        )
        EmailVerificationService(self.db, self.user_repo).verify_registration_code(
            normalized_email,
            payload.verification_code,
            consume=True,
        )

        user = User(
            email=normalized_email,
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

        self.user_repo.add(user)
        self.db.commit()
        self.db.refresh(user)
        self.logger.info("auth.register.persisted email=%s user_id=%s", user.email, user.id)
        return user

    def login(self, payload: LoginRequest, user_agent: str | None, ip_address: str | None) -> dict:
        normalized_email = payload.email.lower()
        normalized_ip = self._normalize_ip(ip_address)

        self._ensure_login_allowed(normalized_email, normalized_ip)

        user = self.user_repo.get_by_email(normalized_email, with_profiles=False)
        if user is None or not verify_password(payload.password, user.password_hash):
            self._register_login_failure(normalized_email, normalized_ip)
            raise AppError(
                code="AUTH_INVALID_CREDENTIALS",
                message="Неверный email или пароль",
                status_code=401,
            )

        if user.status != UserStatus.ACTIVE:
            raise AppError(
                code="AUTH_USER_NOT_ACTIVE",
                message="Учётная запись недоступна для входа",
                status_code=403,
            )

        self._reset_login_failures(normalized_email, normalized_ip)

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
            "has_employer_profile": (
                self.user_repo.has_employer_profile(user.id) if user.role == UserRole.EMPLOYER else False
            ),
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
                message="Сессия обновления недействительна или истекла",
                status_code=401,
            )

        if active_session.jti != payload.get("jti") or str(active_session.user_id) != str(payload.get("sub")):
            self.auth_repo.revoke_session(str(active_session.id))
            self.db.commit()
            raise AppError(
                code="AUTH_INVALID_REFRESH",
                message="Refresh token не соответствует активной сессии",
                status_code=401,
            )

        user = self.user_repo.get_by_id(str(payload.get("sub")), with_profiles=False)
        if user is None:
            raise AppError(code="AUTH_USER_NOT_FOUND", message="Пользователь не найден", status_code=404)

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
            "has_employer_profile": (
                self.user_repo.has_employer_profile(user.id) if user.role == UserRole.EMPLOYER else False
            ),
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

    def _ensure_login_allowed(self, email: str, ip_address: str) -> None:
        rate_limit_service.ensure_allowed(
            "auth_login_email",
            email,
            limit=settings.auth_login_attempt_limit,
            window_seconds=settings.auth_login_attempt_window_seconds,
            block_seconds=settings.auth_login_block_seconds,
            error_code="AUTH_LOGIN_RATE_LIMITED",
            error_message="Слишком много неудачных попыток входа. Попробуйте позже.",
        )
        rate_limit_service.ensure_allowed(
            "auth_login_ip",
            ip_address,
            limit=settings.auth_login_ip_attempt_limit,
            window_seconds=settings.auth_login_ip_attempt_window_seconds,
            block_seconds=settings.auth_login_ip_block_seconds,
            error_code="AUTH_LOGIN_RATE_LIMITED",
            error_message="Слишком много неудачных попыток входа. Попробуйте позже.",
        )

    def _register_login_failure(self, email: str, ip_address: str) -> None:
        rate_limit_service.register_failure(
            "auth_login_email",
            email,
            limit=settings.auth_login_attempt_limit,
            window_seconds=settings.auth_login_attempt_window_seconds,
            block_seconds=settings.auth_login_block_seconds,
        )
        rate_limit_service.register_failure(
            "auth_login_ip",
            ip_address,
            limit=settings.auth_login_ip_attempt_limit,
            window_seconds=settings.auth_login_ip_attempt_window_seconds,
            block_seconds=settings.auth_login_ip_block_seconds,
        )

    def _reset_login_failures(self, email: str, ip_address: str) -> None:
        rate_limit_service.clear("auth_login_email", email)
        rate_limit_service.clear("auth_login_ip", ip_address)

    @staticmethod
    def _normalize_ip(ip_address: str | None) -> str:
        return (ip_address or "unknown").strip().lower()
