import logging

logger = logging.getLogger(__name__)


def send_email(recipient: str, subject: str, body: str) -> None:
    logger.info(
        "email.send recipient=%s subject=%s body=%s",
        recipient,
        subject,
        body,
    )
