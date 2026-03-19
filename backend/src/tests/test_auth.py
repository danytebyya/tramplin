def test_register_applicant(client):
    payload = {
        "email": "student@example.com",
        "display_name": "Student One",
        "password": "StrongPass123",
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


def test_register_employer_requires_profile(client):
    payload = {
        "email": "hr@example.com",
        "display_name": "HR",
        "password": "StrongPass123",
        "role": "employer",
    }

    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 422


def test_login_and_refresh_flow(client):
    register_payload = {
        "email": "employer@example.com",
        "display_name": "Employer",
        "password": "StrongPass123",
        "role": "employer",
        "employer_profile": {
            "company_name": "Acme Corp",
            "inn": "7707083893",
            "corporate_email": "corp@acme.example",
        },
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

    refresh_response = client.post(
        "/api/v1/auth/tokens",
        json={"refresh_token": login_body["refresh_token"]},
    )
    assert refresh_response.status_code == 200
    refresh_body = refresh_response.json()["data"]
    assert refresh_body["access_token"]
    assert refresh_body["refresh_token"] != login_body["refresh_token"]
