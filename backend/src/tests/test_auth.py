import re

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from src.core.config import settings
from src.enums import UserRole, UserStatus
from src.models import EmailVerificationState, User


def _request_code(client, db_session, email: str, *, force_resend: bool = False) -> str:
    normalized_email = email.lower()
    response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": email, "force_resend": force_resend},
    )
    assert response.status_code == 200
    code = db_session.execute(
        select(EmailVerificationState.debug_code).where(
            EmailVerificationState.email == normalized_email,
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
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "AUTH_EMAIL_EXISTS"
    assert response.json()["error"]["message"] == "Аккаунт с такой почтой уже зарегистрирован"
    persisted_code = db_session.execute(
        select(EmailVerificationState.debug_code).where(
            EmailVerificationState.email == "taken@example.com",
            EmailVerificationState.purpose == "register",
        )
    ).scalar_one_or_none()
    assert persisted_code is None


def test_request_code_rejects_existing_email_case_insensitive(client, db_session):
    code = _request_code(client, db_session, "Taken@example.com")
    register_payload = {
        "email": "Taken@example.com",
        "display_name": "Taken User",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "Taken User"},
    }
    register_response = client.post("/api/v1/users", json=register_payload)
    assert register_response.status_code == 201

    response = client.post("/api/v1/auth/email/request-code", json={"email": "taken@example.com"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "AUTH_EMAIL_EXISTS"
    assert response.json()["error"]["message"] == "Аккаунт с такой почтой уже зарегистрирован"


def test_register_rejects_existing_email_for_another_role(client, db_session):
    code = _request_code(client, db_session, "multi-role@example.com")
    first_payload = {
        "email": "multi-role@example.com",
        "display_name": "Applicant User",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "Applicant User"},
    }

    first_response = client.post("/api/v1/users", json=first_payload)
    assert first_response.status_code == 201

    second_response = client.post(
        "/api/v1/users",
        json={
            "email": "multi-role@example.com",
            "display_name": "Employer User",
            "password": "StrongPass123",
            "verification_code": "123456",
            "role": "employer",
        },
    )
    assert second_response.status_code == 409
    assert second_response.json()["error"]["code"] == "AUTH_EMAIL_EXISTS"
    assert second_response.json()["error"]["message"] == "Аккаунт с такой почтой уже зарегистрирован"


def test_register_rejects_existing_email_case_insensitive(client, db_session):
    code = _request_code(client, db_session, "CaseSensitive@example.com")
    first_payload = {
        "email": "CaseSensitive@example.com",
        "display_name": "Applicant User",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "Applicant User"},
    }

    first_response = client.post("/api/v1/users", json=first_payload)
    assert first_response.status_code == 201

    second_response = client.post(
        "/api/v1/users",
        json={
            "email": "casesensitive@example.com",
            "display_name": "Employer User",
            "password": "StrongPass123",
            "verification_code": "123456",
            "role": "employer",
        },
    )
    assert second_response.status_code == 409
    assert second_response.json()["error"]["code"] == "AUTH_EMAIL_EXISTS"
    assert second_response.json()["error"]["message"] == "Аккаунт с такой почтой уже зарегистрирован"


def test_users_table_rejects_duplicate_email_case_insensitive(db_session):
    db_session.add(
        User(
            email="curator@example.com",
            display_name="Curator",
            password_hash="hashed",
            role=UserRole.CURATOR,
            status=UserStatus.ACTIVE,
        )
    )
    db_session.commit()

    db_session.add(
        User(
            email="Curator@example.com",
            display_name="Applicant",
            password_hash="hashed",
            role=UserRole.APPLICANT,
            status=UserStatus.ACTIVE,
        )
    )

    with pytest.raises(IntegrityError):
        db_session.commit()


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


def test_register_rejects_password_without_latin_letters(client, db_session):
    code = _request_code(client, db_session, "no-latin@example.com")
    payload = {
        "email": "no-latin@example.com",
        "display_name": "No Latin User",
        "password": "Пароль123Я",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "No Latin User"},
    }

    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["message"] == "Пароль должен содержать латинские буквы"


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


def test_request_code_force_resend_rotates_active_code(client, db_session):
    first_code = _request_code(client, db_session, "resend@example.com")
    second_code = _request_code(client, db_session, "resend@example.com", force_resend=True)
    assert second_code != first_code


def test_force_resend_invalidates_previous_code(client, db_session):
    first_code = _request_code(client, db_session, "resend-invalidates@example.com")
    second_code = _request_code(client, db_session, "resend-invalidates@example.com", force_resend=True)

    first_verify_response = client.post(
        "/api/v1/auth/email/verify-code",
        json={"email": "resend-invalidates@example.com", "code": first_code},
    )
    assert first_verify_response.status_code == 400
    assert first_verify_response.json()["error"]["code"] == "AUTH_OTP_INVALID"

    second_verify_response = client.post(
        "/api/v1/auth/email/verify-code",
        json={"email": "resend-invalidates@example.com", "code": second_code},
    )
    assert second_verify_response.status_code == 200


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


def test_list_and_revoke_sessions(client, db_session):
    code = _request_code(client, db_session, "sessions@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "sessions@example.com",
            "display_name": "Sessions User",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Sessions User"},
        },
    )
    assert register_response.status_code == 201

    first_login = client.post(
        "/api/v1/auth/sessions",
        headers={"User-Agent": "Browser One"},
        json={"email": "sessions@example.com", "password": "StrongPass123"},
    )
    assert first_login.status_code == 201

    second_login = client.post(
        "/api/v1/auth/sessions",
        headers={"User-Agent": "Browser Two"},
        json={"email": "sessions@example.com", "password": "StrongPass123"},
    )
    assert second_login.status_code == 201

    access_token = second_login.json()["data"]["access_token"]
    sessions_response = client.get(
        "/api/v1/auth/sessions",
        headers={
            "Authorization": f"Bearer {access_token}",
            "User-Agent": "Browser Two",
        },
    )
    assert sessions_response.status_code == 200
    items = sessions_response.json()["data"]["items"]
    assert len(items) == 2
    assert any(item["is_current"] is True for item in items)

    target_session_id = next(item["id"] for item in items if item["user_agent"] == "Browser One")
    revoke_response = client.delete(
        f"/api/v1/auth/sessions/{target_session_id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert revoke_response.status_code == 200

    after_revoke_response = client.get(
        "/api/v1/auth/sessions",
        headers={
            "Authorization": f"Bearer {access_token}",
            "User-Agent": "Browser Two",
        },
    )
    assert after_revoke_response.status_code == 200
    assert len(after_revoke_response.json()["data"]["items"]) == 1


def test_login_history_returns_real_events(client, db_session):
    code = _request_code(client, db_session, "history@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "history@example.com",
            "display_name": "History User",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "History User"},
        },
    )
    assert register_response.status_code == 201

    failed_login = client.post(
        "/api/v1/auth/sessions",
        headers={"User-Agent": "History Browser"},
        json={"email": "history@example.com", "password": "WrongPass123"},
    )
    assert failed_login.status_code == 401

    successful_login = client.post(
        "/api/v1/auth/sessions",
        headers={"User-Agent": "History Browser"},
        json={"email": "history@example.com", "password": "StrongPass123"},
    )
    assert successful_login.status_code == 201
    access_token = successful_login.json()["data"]["access_token"]

    history_response = client.get(
        "/api/v1/auth/login-history",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert history_response.status_code == 200
    items = history_response.json()["data"]["items"]
    assert len(items) >= 2
    assert any(item["is_success"] is True for item in items)
    assert any(item["is_success"] is False for item in items)


def test_active_sessions_marks_only_one_session_as_current_for_same_browser(client, db_session):
    code = _request_code(client, db_session, "duplicate-current@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "duplicate-current@example.com",
            "display_name": "Duplicate Current",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Duplicate Current"},
        },
    )
    assert register_response.status_code == 201

    first_login = client.post(
        "/api/v1/auth/sessions",
        headers={"User-Agent": "Same Browser"},
        json={"email": "duplicate-current@example.com", "password": "StrongPass123"},
    )
    assert first_login.status_code == 201

    second_login = client.post(
        "/api/v1/auth/sessions",
        headers={"User-Agent": "Same Browser"},
        json={"email": "duplicate-current@example.com", "password": "StrongPass123"},
    )
    assert second_login.status_code == 201

    access_token = second_login.json()["data"]["access_token"]
    sessions_response = client.get(
        "/api/v1/auth/sessions",
        headers={
            "Authorization": f"Bearer {access_token}",
            "User-Agent": "Same Browser",
        },
    )

    assert sessions_response.status_code == 200
    items = sessions_response.json()["data"]["items"]
    assert len(items) == 2
    assert sum(1 for item in items if item["is_current"]) == 1


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


def test_update_preferred_city(client, db_session):
    code = _request_code(client, db_session, "preferred-city@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "preferred-city@example.com",
            "display_name": "Preferred City User",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Preferred City User"},
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "preferred-city@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 201
    access_token = login_response.json()["data"]["access_token"]

    update_response = client.put(
        "/api/v1/users/me/preferred-city",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"preferred_city": "Казань"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["user"]["preferred_city"] == "Казань"

    me_response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["data"]["user"]["preferred_city"] == "Казань"


def test_update_me_profile(client, db_session):
    code = _request_code(client, db_session, "update-me@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "update-me@example.com",
            "display_name": "Initial Name",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Initial Name"},
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "update-me@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 201
    access_token = login_response.json()["data"]["access_token"]

    update_response = client.put(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "email": "updated-me@example.com",
            "display_name": "Updated Name",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["user"]["email"] == "updated-me@example.com"
    assert update_response.json()["data"]["user"]["display_name"] == "Updated Name"
    assert update_response.json()["data"]["user"]["applicant_profile"]["full_name"] == "Updated Name"

    me_response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["data"]["user"]["email"] == "updated-me@example.com"
    assert me_response.json()["data"]["user"]["display_name"] == "Updated Name"


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
