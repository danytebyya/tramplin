from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime, timedelta
from secrets import compare_digest, randbelow

from sqlalchemy.orm import Session

from src.core.config import settings
from src.models import EmailVerificationState
from src.repositories import EmailVerificationRepository, UserRepository
from src.services.email_service import send_email
from src.services.rate_limit_service import rate_limit_service
from src.utils.errors import AppError


class EmailVerificationService:
    def __init__(self, db: Session, user_repo: UserRepository | None = None) -> None:
        self.db = db
        self.user_repo = user_repo or UserRepository(db)
        self.repo = EmailVerificationRepository(db)
        self.logger = logging.getLogger(__name__)

    def check_email_availability(self, email: str) -> bool:
        return self.user_repo.get_by_email(email.lower()) is None

    def ensure_email_check_allowed(self, ip_address: str | None) -> None:
        normalized_ip = self._normalize_ip(ip_address)
        rate_limit_service.ensure_allowed(
            "auth_email_check",
            normalized_ip,
            limit=settings.auth_email_check_limit,
            window_seconds=settings.auth_email_check_window_seconds,
            block_seconds=settings.auth_email_check_window_seconds,
            error_code="AUTH_EMAIL_CHECK_RATE_LIMITED",
            error_message="Слишком много запросов проверки email. Попробуйте позже.",
        )
        rate_limit_service.register_attempt(
            "auth_email_check",
            normalized_ip,
            limit=settings.auth_email_check_limit,
            window_seconds=settings.auth_email_check_window_seconds,
            block_seconds=settings.auth_email_check_window_seconds,
        )

    def request_registration_code(
        self,
        email: str,
        ip_address: str | None = None,
        *,
        force_resend: bool = False,
    ) -> None:
        normalized_email = self._normalize_email(email)
        now = datetime.now(UTC)

        state = self.repo.get_or_create(normalized_email, "register")
        self._ensure_not_blocked(state, now)

        if not self.check_email_availability(normalized_email):
            self.logger.info("auth.otp.request.reject_existing_email email=%s", normalized_email)
            raise AppError(
                code="AUTH_EMAIL_EXISTS",
                message="Аккаунт с такой почтой уже зарегистрирован",
                status_code=409,
            )

        if self._has_active_code(state, now) and not force_resend:
            self.logger.info("auth.otp.request.skip_active email=%s", normalized_email)
            return

        self._ensure_request_allowed(state, now)

        code = self._generate_code()
        state.code_hash = self._hash_code(code)
        state.debug_code = code
        state.code_expires_at = now + timedelta(seconds=settings.otp_code_ttl_seconds)
        state.code_attempts_left = settings.otp_verify_attempt_limit
        state.request_count += 1
        if state.request_window_started_at is None:
            state.request_window_started_at = now
        self.db.flush()

        if force_resend:
            # Persist the rotated code before delivery so the previous code
            # becomes invalid immediately after the resend request is made.
            self.db.commit()
            self._deliver_code(normalized_email, code, force_resend=True, state=state)
            return

        try:
            self._deliver_code(normalized_email, code, force_resend=force_resend, state=state)
        except Exception:
            self.db.rollback()
            raise

        self.db.commit()

    def verify_registration_code(
        self,
        email: str,
        code: str,
        ip_address: str | None = None,
        *,
        consume: bool = False,
    ) -> None:
        normalized_email = self._normalize_email(email)
        normalized_code = code.strip()
        now = datetime.now(UTC)

        state = self.repo.get_or_create(normalized_email, "register")
        self._ensure_not_blocked(state, now)
        self.logger.info(
            "auth.otp.verify.start email=%s consume=%s has_code=%s attempts_left=%s blocked_until=%s expires_at=%s",
            normalized_email,
            consume,
            state.code_hash is not None,
            state.code_attempts_left,
            state.blocked_until,
            state.code_expires_at,
        )

        if state.code_hash is None or state.code_expires_at is None:
            self.logger.warning("auth.otp.verify.not_found email=%s", normalized_email)
            raise AppError(
                code="AUTH_OTP_NOT_FOUND",
                message="Код подтверждения не найден. Запросите новый.",
                status_code=400,
            )

        code_expires_at = self._normalize_datetime(state.code_expires_at)
        if code_expires_at <= now:
            self._clear_code(state)
            self.db.commit()
            self.logger.warning("auth.otp.verify.expired email=%s", normalized_email)
            raise AppError(
                code="AUTH_OTP_EXPIRED",
                message="Срок действия кода истёк. Запросите новый.",
                status_code=400,
            )

        if not compare_digest(state.code_hash, self._hash_code(normalized_code)):
            self._register_verification_failure(state, now)
            self.db.commit()
            self.logger.warning(
                "auth.otp.verify.invalid email=%s attempts_left=%s blocked_until=%s",
                normalized_email,
                state.code_attempts_left,
                state.blocked_until,
            )
            raise self._build_invalid_code_error(state)

        self._reset_verification_window(state)
        if consume:
            self._clear_code(state)
        self.db.commit()
        self.logger.info("auth.otp.verify.success email=%s consume=%s", normalized_email, consume)

    def consume_debug_code(self, email: str, purpose: str) -> str | None:
        state = self.repo.get_by_email_and_purpose(self._normalize_email(email), purpose)
        return state.debug_code if state else None

    def reset_state(self, email: str, purpose: str) -> None:
        state = self.repo.get_by_email_and_purpose(self._normalize_email(email), purpose)
        if state is None:
            return
        self._clear_code(state)
        self._reset_request_window(state)
        self._reset_verification_window(state)
        self.db.commit()

    def _ensure_request_allowed(self, state: EmailVerificationState, now: datetime) -> None:
        window_seconds = settings.otp_request_window_seconds
        if (
            state.request_window_started_at is None
            or self._normalize_datetime(state.request_window_started_at)
            <= now - timedelta(seconds=window_seconds)
        ):
            state.request_window_started_at = now
            state.request_count = 0

        if state.request_count >= settings.otp_request_limit:
            raise AppError(
                code="AUTH_OTP_REQUEST_LIMIT_REACHED",
                message="Слишком много запросов кода. Попробуйте позже.",
                status_code=429,
            )

    def _deliver_code(
        self,
        email: str,
        code: str,
        *,
        force_resend: bool,
        state: EmailVerificationState,
    ) -> None:
        self.logger.info(
            "auth.otp.request.issue email=%s force_resend=%s request_count=%s attempts_left=%s expires_at=%s",
            email,
            force_resend,
            state.request_count,
            state.code_attempts_left,
            state.code_expires_at,
        )
        send_email(
            recipient=email,
            subject="Код подтверждения регистрации в Трамплин",
            body=(
                f"Ваш код подтверждения: {code}\n"
                "Код действует 15 минут.\n"
                "Если вы не запрашивали регистрацию, просто проигнорируйте это письмо."
            ),
        )

    def _register_verification_failure(self, state: EmailVerificationState, now: datetime) -> None:
        window_seconds = settings.otp_verify_window_seconds
        if (
            state.verify_window_started_at is None
            or self._normalize_datetime(state.verify_window_started_at)
            <= now - timedelta(seconds=window_seconds)
        ):
            state.verify_window_started_at = now
            state.verify_failure_count = 0

        state.verify_failure_count += 1
        state.code_attempts_left = max(0, (state.code_attempts_left or 0) - 1)

        if state.verify_failure_count >= settings.otp_verify_attempt_limit:
            state.blocked_until = now + timedelta(seconds=settings.otp_verify_block_seconds)
            self._clear_code(state)

    def _build_invalid_code_error(self, state: EmailVerificationState) -> AppError:
        if state.blocked_until is not None:
            return AppError(
                code="AUTH_OTP_ATTEMPTS_EXCEEDED",
                message="Превышено число попыток ввода кода. Запросите новый код.",
                status_code=400,
            )

        return AppError(
            code="AUTH_OTP_INVALID",
            message="Неверный код подтверждения.",
            status_code=400,
            details={"attempts_left": state.code_attempts_left},
        )

    def _ensure_not_blocked(self, state: EmailVerificationState, now: datetime) -> None:
        if state.blocked_until is None:
            return

        blocked_until = self._normalize_datetime(state.blocked_until)
        if blocked_until <= now:
            state.blocked_until = None
            self._reset_verification_window(state)
            return

        raise AppError(
            code="AUTH_OTP_VERIFICATION_BLOCKED",
            message="Слишком много неудачных попыток подтверждения email. Попробуйте позже.",
            status_code=429,
        )

    def _has_active_code(self, state: EmailVerificationState, now: datetime) -> bool:
        if state.code_hash is None or state.code_expires_at is None:
            return False

        code_expires_at = self._normalize_datetime(state.code_expires_at)
        if code_expires_at <= now:
            self._clear_code(state)
            return False

        return True

    @staticmethod
    def _clear_code(state: EmailVerificationState) -> None:
        state.code_hash = None
        state.debug_code = None
        state.code_expires_at = None
        state.code_attempts_left = None

    @staticmethod
    def _reset_request_window(state: EmailVerificationState) -> None:
        state.request_count = 0
        state.request_window_started_at = None

    @staticmethod
    def _reset_verification_window(state: EmailVerificationState) -> None:
        state.verify_failure_count = 0
        state.verify_window_started_at = None
        state.blocked_until = None

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.lower().strip()

    @staticmethod
    def _normalize_ip(ip_address: str | None) -> str:
        return (ip_address or "unknown").strip().lower()

    @staticmethod
    def _generate_code() -> str:
        return "".join(str(randbelow(10)) for _ in range(settings.otp_code_length))

    @staticmethod
    def _hash_code(code: str) -> str:
        return hashlib.sha256(code.encode("utf-8")).hexdigest()

    @staticmethod
    def _normalize_datetime(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
