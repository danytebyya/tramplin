from src.services.dadata_service import DadataService


def _register_and_login_employer(client, db_session):
    request_code_response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": "verify-inn@example.com", "force_resend": False},
    )
    assert request_code_response.status_code == 200

    from src.models import EmailVerificationState

    verification_state = (
        db_session.query(EmailVerificationState)
        .filter(EmailVerificationState.email == "verify-inn@example.com")
        .one()
    )

    register_response = client.post(
        "/api/v1/users",
        json={
            "email": "verify-inn@example.com",
            "display_name": "Verify Inn",
            "password": "StrongPass123",
            "verification_code": verification_state.debug_code,
            "role": "employer",
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": "verify-inn@example.com", "password": "StrongPass123"},
    )
    assert login_response.status_code == 201
    return login_response.json()["data"]["access_token"]


def test_verify_employer_inn(client, db_session, monkeypatch):
    access_token = _register_and_login_employer(client, db_session)

    def mock_verify_inn(self, inn, employer_type):
        assert inn == "7707083893"
        assert employer_type is None
        return {
            "employer_type": "company",
            "inn": "7707083893",
            "full_name": "ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО СБЕРБАНК",
            "name": "ПАО СБЕРБАНК",
            "ogrn": "1027700132195",
            "address": "г Москва, ул Вавилова, д 19",
            "type": "LEGAL",
            "status": "ACTIVE",
            "subject_type": "Публичное акционерное общество",
            "status_label": "Действующая",
            "registration_date": "20.06.1991",
            "director_name": "Иванов Иван Иванович",
        }

    monkeypatch.setattr(DadataService, "verify_inn", mock_verify_inn)

    response = client.post(
        "/api/v1/companies/verify-inn",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"inn": "7707083893"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["verification"]["inn"] == "7707083893"
    assert body["data"]["verification"]["name"] == "ПАО СБЕРБАНК"
    assert body["data"]["verification"]["employer_type"] == "company"
    assert body["data"]["verification"]["subject_type"] == "Публичное акционерное общество"


def test_verify_employer_inn_returns_not_found(client, db_session, monkeypatch):
    access_token = _register_and_login_employer(client, db_session)

    from src.utils.errors import AppError

    def mock_verify_inn(self, inn, employer_type):
        raise AppError(
            code="EMPLOYER_INN_NOT_FOUND",
            message="Организация с таким ИНН не найдена",
            status_code=404,
        )

    monkeypatch.setattr(DadataService, "verify_inn", mock_verify_inn)

    response = client.post(
        "/api/v1/companies/verify-inn",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"inn": "7707083893"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "EMPLOYER_INN_NOT_FOUND"
    assert response.json()["error"]["message"] == "Организация с таким ИНН не найдена"


def test_verify_employer_inn_validates_length(client, db_session):
    access_token = _register_and_login_employer(client, db_session)

    response = client.post(
        "/api/v1/companies/verify-inn",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"inn": "770708389"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "ИНН должен содержать 10 или 12 цифр"
