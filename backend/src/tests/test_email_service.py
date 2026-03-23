import smtplib

import pytest

from src.core.config import settings
from src.services.email_service import send_email
from src.utils.errors import AppError


def test_send_email_falls_back_to_log_in_development_on_smtp_error(monkeypatch):
    class BrokenSmtp:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def starttls(self, *args, **kwargs):
            return None

        def login(self, *args, **kwargs):
            raise smtplib.SMTPException("smtp unavailable")

        def send_message(self, *args, **kwargs):
            return None

    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "app_debug", True)
    monkeypatch.setattr(settings, "email_transport", "smtp")
    monkeypatch.setattr(settings, "email_sender_address", "noreply@example.com")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_username", "user")
    monkeypatch.setattr(settings, "smtp_password", "pass")
    monkeypatch.setattr(settings, "smtp_use_tls", True)
    monkeypatch.setattr(smtplib, "SMTP", BrokenSmtp)

    send_email("student@example.com", "subject", "body")


def test_send_email_raises_in_production_on_smtp_error(monkeypatch):
    class BrokenSmtp:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def starttls(self, *args, **kwargs):
            return None

        def login(self, *args, **kwargs):
            raise smtplib.SMTPException("smtp unavailable")

        def send_message(self, *args, **kwargs):
            return None

    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "app_debug", False)
    monkeypatch.setattr(settings, "email_transport", "smtp")
    monkeypatch.setattr(settings, "email_sender_address", "noreply@example.com")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_username", "user")
    monkeypatch.setattr(settings, "smtp_password", "pass")
    monkeypatch.setattr(settings, "smtp_use_tls", True)
    monkeypatch.setattr(smtplib, "SMTP", BrokenSmtp)

    with pytest.raises(AppError) as exc_info:
        send_email("student@example.com", "subject", "body")
    assert exc_info.value.code == "EMAIL_DELIVERY_FAILED"
