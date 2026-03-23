import re

from sqlalchemy import select

from src.core.config import settings
from src.models import EmailVerificationState


def _request_code(client, db_session, email: str, *, force_resend: bool = False) -> str:
    response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": email, "force_resend": force_resend},
    )
    assert response.status_code == 200
    code = db_session.execute(
        select(EmailVerificationState.debug_code).where(
            EmailVerificationState.email == email,
            EmailVerificationState.purpose == "register",
        )
    ).scalar_one_or_none()
    assert code is not None
    assert re.fullmatch(r"\d{6}", code)
    return code


def test_check_email_availability(client):
    response = client.post("/api/v1/auth/email/check", json={"email": "available@example.com"})
    assert response.status_code == 200
    assert response.json()["data"]["exists"] is False


def test_register_applicant(client, db_session):
    code = _request_code(client, db_session, "student@example.com")
    payload = {
        "email": "student@example.com",
        "display_name": "Student One",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {
            "full_name": "Student One",
            "university": "MIPT",
            "graduation_year": 2027,
        },
    }

    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert body["data"]["user"]["email"] == "student@example.com"
    assert body["data"]["user"]["role"] == "applicant"


def test_register_employer_without_profile(client, db_session):
    code = _request_code(client, db_session, "hr@example.com")
    payload = {
        "email": "hr@example.com",
        "display_name": "HR",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "employer",
    }

    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 201
    assert response.json()["data"]["user"]["employer_profile"] is None


def test_request_code_rejects_existing_email(client, db_session):
    code = _request_code(client, db_session, "taken@example.com")
    register_payload = {
        "email": "taken@example.com",
        "display_name": "Taken User",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "Taken User"},
    }
    register_response = client.post("/api/v1/users", json=register_payload)
    assert register_response.status_code == 201

    response = client.post("/api/v1/auth/email/request-code", json={"email": "taken@example.com"})
    assert response.status_code == 200
    assert response.json()["data"]["message"] == "Код подтверждения отправлен на email"
    persisted_code = db_session.execute(
        select(EmailVerificationState.debug_code).where(
            EmailVerificationState.email == "taken@example.com",
            EmailVerificationState.purpose == "register",
        )
    ).scalar_one_or_none()
    assert persisted_code is None


def test_check_email_returns_exists_for_registered_user(client, db_session):
    code = _request_code(client, db_session, "registered@example.com")
    register_payload = {
        "email": "registered@example.com",
        "display_name": "Registered User",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "Registered User"},
    }
    register_response = client.post("/api/v1/users", json=register_payload)
    assert register_response.status_code == 201

    response = client.post("/api/v1/auth/email/check", json={"email": "registered@example.com"})
    assert response.status_code == 200
    assert response.json()["data"]["exists"] is True


def test_verify_code_returns_success_without_consuming_code(client, db_session):
    code = _request_code(client, db_session, "verify@example.com")
    response = client.post(
        "/api/v1/auth/email/verify-code",
        json={"email": "verify@example.com", "code": code},
    )
    assert response.status_code == 200
    assert response.json()["data"]["message"] == "Код подтверждён"

    payload = {
        "email": "verify@example.com",
        "display_name": "Verify User",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "Verify User"},
    }
    register_response = client.post("/api/v1/users", json=payload)
    assert register_response.status_code == 201


def test_register_requires_valid_verification_code(client):
    payload = {
        "email": "otp@example.com",
        "display_name": "OTP User",
        "password": "StrongPass123",
        "verification_code": "123456",
        "role": "applicant",
        "applicant_profile": {"full_name": "OTP User"},
    }

    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Код подтверждения не найден. Запросите новый."


def test_register_rejects_invalid_verification_code_format(client):
    payload = {
        "email": "invalid-format@example.com",
        "display_name": "OTP User",
        "password": "StrongPass123",
        "verification_code": "12ab",
        "role": "applicant",
        "applicant_profile": {"full_name": "OTP User"},
    }

    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "Код подтверждения должен содержать 6 цифр"


def test_request_code_rejects_invalid_email_with_localized_message(client):
    response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": "invalid-email", "force_resend": True},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "Введите корректный email"
    assert body["error"]["details"]["fields"][0]["field"] == "email"
    assert body["error"]["details"]["fields"][0]["message"] == "Введите корректный email"


def test_register_rejects_weak_password(client, db_session):
    code = _request_code(client, db_session, "weak@example.com")
    payload = {
        "email": "weak@example.com",
        "display_name": "Weak User",
        "password": "weakpass",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "Weak User"},
    }

    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["message"] == "Пароль должен содержать заглавные буквы"


def test_request_code_rate_limit(client):
    email = "limit@example.com"
    for _ in range(5):
        response = client.post(
            "/api/v1/auth/email/request-code",
            json={"email": email, "force_resend": True},
        )
        assert response.status_code == 200

    response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": email, "force_resend": True},
    )
    assert response.status_code == 429
    assert response.json()["error"]["message"] == "Слишком много запросов кода. Попробуйте позже."


def test_request_code_is_not_bound_to_email_check_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_email_check_limit", 1)

    first_response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": "request-rate-limit@example.com", "force_resend": True},
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": "request-rate-limit@example.com", "force_resend": True},
    )
    assert second_response.status_code == 200


def test_email_check_rate_limit(client):
    for _ in range(20):
        response = client.post("/api/v1/auth/email/check", json={"email": "probe@example.com"})
        assert response.status_code == 200

    response = client.post("/api/v1/auth/email/check", json={"email": "probe@example.com"})
    assert response.status_code == 429
    assert (
        response.json()["error"]["message"]
        == "Слишком много запросов проверки email. Попробуйте позже."
    )


def test_verify_code_attempt_limit(client, db_session):
    _request_code(client, db_session, "attempts@example.com")

    for _ in range(9):
        response = client.post(
            "/api/v1/auth/email/verify-code",
            json={"email": "attempts@example.com", "code": "000000"},
        )
        assert response.status_code == 400
        assert response.json()["error"]["message"] == "Неверный код подтверждения."

    response = client.post(
        "/api/v1/auth/email/verify-code",
        json={"email": "attempts@example.com", "code": "000000"},
    )
    assert response.status_code == 400
    assert (
        response.json()["error"]["message"]
        == "Превышено число попыток ввода кода. Запросите новый код."
    )


def test_verify_code_is_not_bound_to_email_check_limit(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "auth_email_check_limit", 1)
    code = _request_code(client, db_session, "verify-rate-limit@example.com")

    first_response = client.post(
        "/api/v1/auth/email/verify-code",
        json={"email": "verify-rate-limit@example.com", "code": code},
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/v1/auth/email/verify-code",
        json={"email": "verify-rate-limit@example.com", "code": code},
    )
    assert second_response.status_code == 200


def test_request_code_does_not_resend_while_code_is_active(client, db_session):
    first_code = _request_code(client, db_session, "active@example.com")
    second_response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": "active@example.com", "force_resend": False},
    )
    assert second_response.status_code == 200
    active_code = db_session.execute(
        select(EmailVerificationState.debug_code).where(
            EmailVerificationState.email == "active@example.com",
            EmailVerificationState.purpose == "register",
        )
    ).scalar_one_or_none()
    assert active_code == first_code


def test_request_code_force_resend_reuses_active_code(client, db_session):
    first_code = _request_code(client, db_session, "resend@example.com")
    second_code = _request_code(client, db_session, "resend@example.com", force_resend=True)
    assert second_code == first_code


def test_register_is_blocked_after_too_many_invalid_verification_attempts(client, db_session):
    _request_code(client, db_session, "blocked-register@example.com")

    for _ in range(10):
        response = client.post(
            "/api/v1/auth/email/verify-code",
            json={"email": "blocked-register@example.com", "code": "000000"},
        )

    assert response.status_code == 400

    request_response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": "blocked-register@example.com", "force_resend": False},
    )
    assert request_response.status_code == 429
    assert (
        request_response.json()["error"]["message"]
        == "Слишком много неудачных попыток подтверждения email. Попробуйте позже."
    )

    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "blocked-register@example.com",
            "display_name": "Blocked Register",
            "password": "StrongPass123",
            "verification_code": "000000",
            "role": "applicant",
            "applicant_profile": {"full_name": "Blocked Register"},
        },
    )
    assert register_response.status_code == 429
    assert (
        register_response.json()["error"]["message"]
        == "Слишком много неудачных попыток подтверждения email. Попробуйте позже."
    )


def test_login_and_refresh_flow(client, db_session):
    code = _request_code(client, db_session, "employer@example.com")
    register_payload = {
        "email": "employer@example.com",
        "display_name": "Employer",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "employer",
    }
    register_response = client.post("/api/v1/users", json=register_payload)
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "employer@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 201
    login_body = login_response.json()["data"]
    assert login_body["access_token"]
    assert login_body["refresh_token"]
    assert login_body["user"]["has_employer_profile"] is False

    refresh_response = client.post(
        "/api/v1/auth/tokens",
        json={"refresh_token": login_body["refresh_token"]},
    )
    assert refresh_response.status_code == 200
    refresh_body = refresh_response.json()["data"]
    assert refresh_body["access_token"]
    assert refresh_body["refresh_token"] != login_body["refresh_token"]


def test_employer_onboarding_flow(client, db_session):
    code = _request_code(client, db_session, "company-owner@example.com")
    register_payload = {
        "email": "company-owner@example.com",
        "display_name": "Company Owner",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "employer",
    }
    register_response = client.post("/api/v1/users", json=register_payload)
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "company-owner@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 201

    access_token = login_response.json()["data"]["access_token"]
    onboarding_response = client.put(
        "/api/v1/companies/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "employer_type": "company",
            "company_name": "Acme Corp",
            "inn": "7707083893",
            "corporate_email": "hr@acme.example",
            "website": "https://acme.example",
        },
    )
    assert onboarding_response.status_code == 200
    user = onboarding_response.json()["data"]["user"]
    assert user["employer_profile"]["employer_type"] == "company"
    assert user["employer_profile"]["company_name"] == "Acme Corp"

    me_response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["data"]["user"]["employer_profile"]["inn"] == "7707083893"


def test_login_rate_limit(client, db_session):
    code = _request_code(client, db_session, "limited-login@example.com")
    register_payload = {
        "email": "limited-login@example.com",
        "display_name": "Limited Login",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "Limited Login"},
    }
    register_response = client.post("/api/v1/users", json=register_payload)
    assert register_response.status_code == 201

    for _ in range(5):
        response = client.post(
            "/api/v1/auth/sessions",
            json={"email": "limited-login@example.com", "password": "WrongPass123"},
        )
        assert response.status_code == 401

    response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "limited-login@example.com", "password": "WrongPass123"},
    )
    assert response.status_code == 429
    assert (
        response.json()["error"]["message"]
        == "Слишком много неудачных попыток входа. Попробуйте позже."
    )
