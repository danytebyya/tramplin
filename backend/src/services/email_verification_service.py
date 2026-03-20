from src.core.config import settings
from src.repositories import UserRepository
from src.services.email_service import send_email
from src.services.otp_service import otp_service
from src.services.rate_limit_service import rate_limit_service


class EmailVerificationService:
    def __init__(self, user_repo: UserRepository) -> None:
        self.user_repo = user_repo

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

    def request_registration_code(self, email: str, ip_address: str | None = None) -> None:
        self.ensure_email_check_allowed(ip_address)

        if not self.check_email_availability(email):
            return

        code = otp_service.issue_code(email, "register")
        send_email(
            recipient=email,
            subject="Код подтверждения регистрации в Трамплин",
            body=(
                f"Ваш код подтверждения: {code}\n"
                "Код действует 15 минут.\n"
                "Если вы не запрашивали регистрацию, просто проигнорируйте это письмо."
            ),
        )

    def verify_registration_code(self, email: str, code: str, ip_address: str | None = None) -> None:
        self.ensure_email_check_allowed(ip_address)
        otp_service.verify_code(email, "register", code, consume=False)

    @staticmethod
    def _normalize_ip(ip_address: str | None) -> str:
        return (ip_address or "unknown").strip().lower()
