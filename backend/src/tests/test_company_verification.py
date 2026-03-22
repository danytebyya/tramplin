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
        assert inn == "770708389312"
        assert employer_type.value == "company"
        return {
            "inn": "770708389312",
            "name": "ПАО СБЕРБАНК",
            "ogrn": "1027700132195",
            "address": "г Москва, ул Вавилова, д 19",
            "type": "LEGAL",
            "status": "ACTIVE",
        }

    monkeypatch.setattr(DadataService, "verify_inn", mock_verify_inn)

    response = client.post(
        "/api/v1/companies/verify-inn",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"employer_type": "company", "inn": "770708389312"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["verification"]["inn"] == "770708389312"
    assert body["data"]["verification"]["name"] == "ПАО СБЕРБАНК"


def test_verify_employer_inn_returns_not_found(client, db_session, monkeypatch):
    access_token = _register_and_login_employer(client, db_session)

    from src.utils.errors import AppError

    def mock_verify_inn(self, inn, employer_type):
        raise AppError(
            code="EMPLOYER_INN_NOT_FOUND",
            message="Организация или ИП с таким ИНН не найдены",
            status_code=404,
        )

    monkeypatch.setattr(DadataService, "verify_inn", mock_verify_inn)

    response = client.post(
        "/api/v1/companies/verify-inn",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"employer_type": "company", "inn": "770708389312"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "EMPLOYER_INN_NOT_FOUND"


def test_verify_employer_inn_validates_length_by_employer_type(client, db_session):
    access_token = _register_and_login_employer(client, db_session)

    response = client.post(
        "/api/v1/companies/verify-inn",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"employer_type": "company", "inn": "7707083893"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "Для компании ИНН должен содержать 12 цифр"
