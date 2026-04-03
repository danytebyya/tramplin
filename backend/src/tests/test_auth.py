import re
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from src.core.config import settings
from src.db.session import get_db
from src.enums import UserRole, UserStatus
from src.models import EmailVerificationState, User
import src.main as main_module
from src.main import app


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


def _register_user(client, db_session, email: str, *, password: str = "StrongPass123") -> None:
    code = _request_code(client, db_session, email)
    response = client.post(
        "/api/v1/users",
        json={
            "email": email,
            "display_name": email.split("@")[0],
            "password": password,
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Test User"},
        },
    )
    assert response.status_code == 201


def _login(client, email: str, password: str) -> str:
    response = client.post(
        "/api/v1/auth/sessions",
        json={"email": email, "password": password},
    )
    assert response.status_code == 201
    return response.json()["data"]["access_token"]


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
    assert re.fullmatch(r"\d{8}", body["data"]["user"]["public_id"])


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


def test_request_password_reset_code_for_existing_user(client, db_session):
    _register_user(client, db_session, "reset@example.com")

    response = client.post(
        "/api/v1/auth/password/request-reset-code",
        json={"email": "reset@example.com"},
    )

    assert response.status_code == 200
    code = db_session.execute(
        select(EmailVerificationState.debug_code).where(
            EmailVerificationState.email == "reset@example.com",
            EmailVerificationState.purpose == "password_reset",
        )
    ).scalar_one_or_none()
    assert code is not None
    assert re.fullmatch(r"\d{6}", code)


def test_password_reset_rejects_reusing_current_password(client, db_session):
    _register_user(client, db_session, "reuse@example.com")
    client.post(
        "/api/v1/auth/password/request-reset-code",
        json={"email": "reuse@example.com"},
    )
    code = db_session.execute(
        select(EmailVerificationState.debug_code).where(
            EmailVerificationState.email == "reuse@example.com",
            EmailVerificationState.purpose == "password_reset",
        )
    ).scalar_one()

    response = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": "reuse@example.com",
            "code": code,
            "new_password": "StrongPass123",
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "AUTH_PASSWORD_REUSE"


def test_password_reset_updates_password_and_returns_session(client, db_session):
    _register_user(client, db_session, "recover@example.com")
    client.post(
        "/api/v1/auth/password/request-reset-code",
        json={"email": "recover@example.com"},
    )
    code = db_session.execute(
        select(EmailVerificationState.debug_code).where(
            EmailVerificationState.email == "recover@example.com",
            EmailVerificationState.purpose == "password_reset",
        )
    ).scalar_one()

    verify_response = client.post(
        "/api/v1/auth/password/verify-reset-code",
        json={"email": "recover@example.com", "code": code},
    )
    assert verify_response.status_code == 200

    reset_response = client.post(
        "/api/v1/auth/password/reset",
        json={
            "email": "recover@example.com",
            "code": code,
            "new_password": "UpdatedPass123",
        },
    )

    assert reset_response.status_code == 200
    assert reset_response.json()["data"]["access_token"]

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "recover@example.com", "password": "UpdatedPass123"},
    )
    assert login_response.status_code == 201


def test_change_password_requires_current_password_and_blocks_reuse(client, db_session):
    _register_user(client, db_session, "change@example.com")
    access_token = _login(client, "change@example.com", "StrongPass123")

    invalid_current_response = client.post(
        "/api/v1/auth/password/change",
        json={
            "current_password": "WrongPass123",
            "new_password": "NextPass123",
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert invalid_current_response.status_code == 400
    assert invalid_current_response.json()["error"]["code"] == "AUTH_INVALID_CURRENT_PASSWORD"

    reuse_response = client.post(
        "/api/v1/auth/password/change",
        json={
            "current_password": "StrongPass123",
            "new_password": "StrongPass123",
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert reuse_response.status_code == 400
    assert reuse_response.json()["error"]["code"] == "AUTH_PASSWORD_REUSE"

    success_response = client.post(
        "/api/v1/auth/password/change",
        json={
            "current_password": "StrongPass123",
            "new_password": "NextPass123",
        },
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert success_response.status_code == 200

    relogin_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "change@example.com", "password": "NextPass123"},
    )
    assert relogin_response.status_code == 201


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


def test_non_curator_users_receive_public_id_while_curator_does_not(db_session):
    applicant = User(
        email="public-id-applicant@example.com",
        display_name="Applicant",
        password_hash="hashed",
        role=UserRole.APPLICANT,
        status=UserStatus.ACTIVE,
    )
    curator = User(
        email="public-id-curator@example.com",
        display_name="Curator",
        password_hash="hashed",
        role=UserRole.CURATOR,
        status=UserStatus.ACTIVE,
    )
    db_session.add_all([applicant, curator])
    db_session.commit()

    db_session.refresh(applicant)
    db_session.refresh(curator)

    assert re.fullmatch(r"\d{8}", applicant.public_id or "")
    assert curator.public_id is None


def test_startup_bootstraps_initial_curator_from_env(db_session, monkeypatch):
    monkeypatch.setattr(settings, "initial_curator_email", "bootstrap-curator@example.com")
    monkeypatch.setattr(settings, "initial_curator_password", "BootstrapPass123")
    monkeypatch.setattr(settings, "initial_curator_display_name", "Bootstrap Curator")
    monkeypatch.setattr(settings, "initial_admin_email", "")
    monkeypatch.setattr(settings, "initial_admin_password", "")

    testing_session_local = sessionmaker(
        bind=db_session.get_bind(),
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    monkeypatch.setattr(main_module, "SessionLocal", testing_session_local)

    def override_get_db():
        session = testing_session_local()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/v1/auth/sessions",
                json={
                    "email": "bootstrap-curator@example.com",
                    "password": "BootstrapPass123",
                },
            )

        assert response.status_code == 201
        body = response.json()
        assert body["data"]["user"]["email"] == "bootstrap-curator@example.com"
        assert body["data"]["user"]["role"] == "curator"

        persisted_user = db_session.execute(
            select(User).where(User.email == "bootstrap-curator@example.com")
        ).scalar_one()
        assert persisted_user.role == UserRole.CURATOR
        assert persisted_user.curator_profile is not None
        assert persisted_user.curator_profile.full_name == "Bootstrap Curator"
    finally:
        app.dependency_overrides.clear()


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


def test_user_can_delete_own_account(client, db_session):
    code = _request_code(client, db_session, "delete-me@example.com")
    register_payload = {
        "email": "delete-me@example.com",
        "display_name": "Delete Me",
        "password": "StrongPass123",
        "verification_code": code,
        "role": "applicant",
        "applicant_profile": {"full_name": "Delete Me"},
    }
    register_response = client.post("/api/v1/users", json=register_payload)
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "delete-me@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 201
    access_token = login_response.json()["data"]["access_token"]

    delete_response = client.delete(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["deleted"] is True

    deleted_user = db_session.execute(
        select(User).where(User.id == UUID(register_response.json()["data"]["user"]["id"]))
    ).scalar_one()
    assert deleted_user.status == UserStatus.ARCHIVED
    assert deleted_user.deleted_at is not None
    assert deleted_user.email != "delete-me@example.com"

    second_login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "delete-me@example.com", "password": "StrongPass123"},
    )
    assert second_login_response.status_code == 401


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


def test_active_sessions_preserves_current_session_when_user_agent_changes(client, db_session):
    code = _request_code(client, db_session, "ua-switch@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "ua-switch@example.com",
            "display_name": "UA Switch",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "UA Switch"},
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        headers={"User-Agent": "Desktop Browser"},
        json={"email": "ua-switch@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 201

    access_token = login_response.json()["data"]["access_token"]
    sessions_response = client.get(
        "/api/v1/auth/sessions",
        headers={
            "Authorization": f"Bearer {access_token}",
            "User-Agent": "Mobile Browser",
        },
    )

    assert sessions_response.status_code == 200
    items = sessions_response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["is_current"] is True


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


def test_update_applicant_dashboard(client, db_session):
    code = _request_code(client, db_session, "dashboard@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "dashboard@example.com",
            "display_name": "Dashboard User",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Dashboard User"},
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "dashboard@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 201
    access_token = login_response.json()["data"]["access_token"]

    update_response = client.put(
        "/api/v1/users/me/applicant-dashboard",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "full_name": "Иванов Иван",
            "university": "ЧГУ",
            "about": "Backend developer",
            "study_course": 3,
            "graduation_year": 2027,
            "level": "Junior",
            "hard_skills": ["Python", "Django"],
            "soft_skills": ["Коммуникация"],
            "languages": ["Русский", "English B2"],
            "links": {
                "github_url": "https://github.com/ivanov",
                "portfolio_url": "https://ivanov.dev",
            },
            "career_interests": {
                "desired_salary_from": 80000,
                "preferred_city": "Чебоксары",
                "employment_types": ["Full-time"],
                "work_formats": ["Удаленно"],
            },
            "projects": [
                {
                    "title": "Task manager",
                    "description": "Team project",
                    "technologies": "Python, React",
                    "period_label": "2025",
                    "role_name": "Backend",
                    "repository_url": "https://github.com/ivanov/task-manager",
                }
            ],
            "achievements": [
                {
                    "title": "Hackathon Winner",
                    "event_name": "Hack Day",
                    "project_name": "AI helper",
                    "award": "1 место",
                }
            ],
            "certificates": [
                {
                    "title": "Python Certificate",
                    "organization_name": "Coursera",
                    "issued_at": "2025-03-01",
                    "credential_url": "https://example.com/cert",
                }
            ],
        },
    )
    assert update_response.status_code == 200
    payload = update_response.json()["data"]
    assert payload["profile"]["full_name"] == "Иванов Иван"
    assert payload["profile"]["about"] == "Backend developer"
    assert payload["profile"]["study_course"] == 3
    assert payload["career_interests"]["preferred_city"] == "Чебоксары"
    assert payload["projects"][0]["title"] == "Task manager"
    assert payload["achievements"][0]["title"] == "Hackathon Winner"
    assert payload["certificates"][0]["title"] == "Python Certificate"

    dashboard_response = client.get(
        "/api/v1/users/me/applicant-dashboard",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert dashboard_response.status_code == 200
    body = dashboard_response.json()["data"]
    assert body["profile"]["github_url"] == "https://github.com/ivanov"
    assert body["preferred_city"] == "Чебоксары"
    assert len(body["projects"]) == 1


def test_upload_applicant_avatar_persists_avatar_url(client, db_session):
    code = _request_code(client, db_session, "applicant-avatar@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "applicant-avatar@example.com",
            "display_name": "Applicant Avatar",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Applicant Avatar"},
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "applicant-avatar@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 201
    access_token = login_response.json()["data"]["access_token"]

    response = client.post(
        "/api/v1/users/me/applicant-avatar",
        headers={"Authorization": f"Bearer {access_token}"},
        files=[("file", ("avatar.png", b"fake-image-content", "image/png"))],
    )

    assert response.status_code == 200
    avatar_url = response.json()["data"]["user"]["applicant_profile"]["avatar_url"]
    assert avatar_url
    assert avatar_url.startswith("/storage/applicant-avatars/")

    user = db_session.query(User).filter(User.email == "applicant-avatar@example.com").one()
    assert user.applicant_profile is not None
    assert user.applicant_profile.avatar_url == avatar_url


def test_read_public_applicant_profile(client, db_session):
    code = _request_code(client, db_session, "public-applicant@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "public-applicant@example.com",
            "display_name": "Public Applicant",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Public Applicant"},
        },
    )
    assert register_response.status_code == 201
    public_id = register_response.json()["data"]["user"]["public_id"]

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "public-applicant@example.com", "password": "StrongPass123"},
    )
    access_token = login_response.json()["data"]["access_token"]

    client.put(
        "/api/v1/users/me/applicant-dashboard",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "full_name": "Иван Иванов",
            "about": "Frontend developer",
            "hard_skills": ["React", "TypeScript"],
            "projects": [
                {
                    "title": "Portfolio",
                    "description": "Personal site",
                    "technologies": "React, TypeScript",
                    "period_label": "2026",
                    "role_name": "Frontend",
                    "repository_url": "https://github.com/test/portfolio",
                }
            ],
        },
    )

    response = client.get(f"/api/v1/users/public/{public_id}")
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["public_id"] == public_id
    assert payload["role"] == "applicant"
    assert payload["applicant_dashboard"]["profile"]["about"] == "Frontend developer"
    assert payload["applicant_dashboard"]["projects"][0]["title"] == "Portfolio"
    assert payload["employer_profile"] is None

    me_response = client.get(
        "/api/v1/users/me/applicant-dashboard",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["data"]["stats"]["profile_views_count"] == 1


def test_read_public_employer_profile(client, db_session):
    code = _request_code(client, db_session, "public-employer@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "public-employer@example.com",
            "display_name": "Public Employer",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "employer",
        },
    )
    assert register_response.status_code == 201
    public_id = register_response.json()["data"]["user"]["public_id"]

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "public-employer@example.com", "password": "StrongPass123"},
    )
    access_token = login_response.json()["data"]["access_token"]

    profile_response = client.put(
        "/api/v1/companies/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "employer_type": "company",
            "company_name": "Трамплин",
            "inn": "1234567890",
            "short_description": "Карьерная платформа",
            "website": "https://tramplin.example",
            "social_link": "https://vk.com/tramplin",
            "office_addresses": ["Чебоксары"],
            "activity_areas": ["IT"],
            "organization_size": "50-100",
            "foundation_year": 2020,
        },
    )
    assert profile_response.status_code == 200

    response = client.get(f"/api/v1/users/public/{public_id}")
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["public_id"] == public_id
    assert payload["role"] == "employer"
    assert payload["employer_profile"]["company_name"] == "Трамплин"
    assert payload["employer_stats"]["active_opportunities_count"] == 0
    assert payload["applicant_dashboard"] is None

    me_response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["data"]["user"]["employer_profile"]["profile_views_count"] == 1


def test_hidden_applicant_profile_is_not_publicly_accessible(client, db_session):
    code = _request_code(client, db_session, "hidden-public-applicant@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "hidden-public-applicant@example.com",
            "display_name": "Hidden Applicant",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Hidden Applicant"},
        },
    )
    assert register_response.status_code == 201
    public_id = register_response.json()["data"]["user"]["public_id"]

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "hidden-public-applicant@example.com", "password": "StrongPass123"},
    )
    access_token = login_response.json()["data"]["access_token"]

    privacy_response = client.put(
        "/api/v1/users/me/applicant-privacy",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"profile_visibility": "hidden", "show_resume": False},
    )
    assert privacy_response.status_code == 200

    response = client.get(f"/api/v1/users/public/{public_id}")
    assert response.status_code == 404


def test_authorized_applicant_profile_requires_authenticated_viewer(client, db_session):
    code = _request_code(client, db_session, "authorized-public-applicant@example.com")
    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "authorized-public-applicant@example.com",
            "display_name": "Authorized Applicant",
            "password": "StrongPass123",
            "verification_code": code,
            "role": "applicant",
            "applicant_profile": {"full_name": "Authorized Applicant"},
        },
    )
    assert register_response.status_code == 201
    public_id = register_response.json()["data"]["user"]["public_id"]

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "authorized-public-applicant@example.com", "password": "StrongPass123"},
    )
    access_token = login_response.json()["data"]["access_token"]

    privacy_response = client.put(
        "/api/v1/users/me/applicant-privacy",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"profile_visibility": "authorized", "show_resume": True},
    )
    assert privacy_response.status_code == 200

    anonymous_response = client.get(f"/api/v1/users/public/{public_id}")
    assert anonymous_response.status_code == 404

    authorized_response = client.get(
        f"/api/v1/users/public/{public_id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert authorized_response.status_code == 200


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
