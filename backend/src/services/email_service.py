import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from ssl import create_default_context

from src.core.config import settings
from src.utils.errors import AppError

logger = logging.getLogger(__name__)


def _log_email(recipient: str, subject: str, body: str, *, transport: str) -> None:
    logger.info(
        "email.send recipient=%s subject=%s transport=%s body=%s",
        recipient,
        subject,
        transport,
        body,
    )


def _should_fallback_to_log_transport() -> bool:
    return settings.app_env.lower() in {"development", "dev", "local"} or settings.app_debug


def send_email(recipient: str, subject: str, body: str) -> None:
    if settings.email_transport == "log":
        _log_email(recipient, subject, body, transport="log")
        return

    if not settings.email_sender_address:
        if _should_fallback_to_log_transport():
            logger.warning("email.fallback_to_log reason=missing_sender_address recipient=%s", recipient)
            _log_email(recipient, subject, body, transport="fallback-log")
            return
        raise AppError(
            code="EMAIL_NOT_CONFIGURED",
            message="Email sender is not configured",
            status_code=503,
        )
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        if _should_fallback_to_log_transport():
            logger.warning("email.fallback_to_log reason=missing_smtp_credentials recipient=%s", recipient)
            _log_email(recipient, subject, body, transport="fallback-log")
            return
        raise AppError(
            code="EMAIL_NOT_CONFIGURED",
            message="SMTP credentials are not configured",
            status_code=503,
        )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((settings.email_sender_name, settings.email_sender_address))
    message["To"] = recipient
    message.set_content(body)

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
                context=create_default_context(),
            ) as smtp:
                smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
            ) as smtp:
                if settings.smtp_use_tls:
                    smtp.starttls(context=create_default_context())
                smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
    except (smtplib.SMTPException, OSError, TimeoutError) as exc:
        logger.exception("email.smtp_error recipient=%s subject=%s", recipient, subject)
        if _should_fallback_to_log_transport():
            logger.warning(
                "email.fallback_to_log reason=smtp_delivery_failed recipient=%s exception_type=%s",
                recipient,
                exc.__class__.__name__,
            )
            _log_email(recipient, subject, body, transport="fallback-log")
            return
        raise AppError(
            code="EMAIL_DELIVERY_FAILED",
            message="Не удалось выполнить запрос. Попробуйте позже.",
            status_code=503,
        ) from exc

    logger.info(
        "email.sent recipient=%s subject=%s transport=smtp",
        recipient,
        subject,
    )
