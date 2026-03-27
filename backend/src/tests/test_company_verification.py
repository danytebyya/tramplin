from src.services.dadata_service import DadataService


def _register_and_login_employer(client, db_session, *, email: str = "verify-inn@example.com"):
    request_code_response = client.post(
        "/api/v1/auth/email/request-code",
        json={"email": email, "force_resend": False},
    )
    assert request_code_response.status_code == 200

    from src.models import EmailVerificationState

    verification_state = (
        db_session.query(EmailVerificationState)
        .filter(EmailVerificationState.email == email)
        .one()
    )

    register_response = client.post(
        "/api/v1/users",
        json={
            "email": email,
            "display_name": "Verify Inn",
            "password": "StrongPass123",
            "verification_code": verification_state.debug_code,
            "role": "employer",
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/sessions",
        json={"email": email, "password": "StrongPass123"},
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


def test_verify_employer_inn_rejects_existing_inn_in_platform(client, db_session):
    access_token = _register_and_login_employer(client, db_session, email="first-verify-inn@example.com")
    another_access_token = _register_and_login_employer(
        client,
        db_session,
        email="second-verify-inn@example.com",
    )

    profile_response = client.put(
        "/api/v1/companies/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "employer_type": "company",
            "company_name": "Existing Corp",
            "inn": "7707083893",
            "corporate_email": "hr@existing.example",
            "website": "https://existing.example",
        },
    )
    assert profile_response.status_code == 200

    response = client.post(
        "/api/v1/companies/verify-inn",
        headers={"Authorization": f"Bearer {another_access_token}"},
        json={"inn": "7707083893"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMPLOYER_INN_EXISTS"
    assert (
        response.json()["error"]["message"]
        == "Организация или работодатель с таким ИНН уже зарегистрированы на платформе"
    )


def test_upload_employer_verification_documents_persists_records(client, db_session):
    access_token = _register_and_login_employer(client, db_session)

    profile_response = client.put(
        "/api/v1/companies/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "employer_type": "company",
            "company_name": "ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ Acme Corp",
            "inn": "7707083893",
            "corporate_email": "hr@acme.example",
            "website": "https://acme.example",
        },
    )
    assert profile_response.status_code == 200

    response = client.post(
        "/api/v1/companies/verification-documents",
        headers={"Authorization": f"Bearer {access_token}"},
        files=[
            ("files", ("registration.pdf", b"registration-document", "application/pdf")),
            ("files", ("power.docx", b"power-of-attorney", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["documents_count"] == 2

    from src.models import Employer, EmployerMembership, EmployerProfile, EmployerVerificationDocument, EmployerVerificationRequest, MediaFile, User

    user = db_session.query(User).filter(User.email == "verify-inn@example.com").one()
    employer_profile = db_session.query(EmployerProfile).filter(EmployerProfile.user_id == user.id).one()
    employer = db_session.query(Employer).filter(Employer.inn == "7707083893").one()
    membership = (
        db_session.query(EmployerMembership)
        .filter(EmployerMembership.employer_id == employer.id, EmployerMembership.user_id == user.id)
        .one()
    )
    verification_request = (
        db_session.query(EmployerVerificationRequest)
        .filter(EmployerVerificationRequest.employer_id == employer.id)
        .one()
    )
    documents = (
        db_session.query(EmployerVerificationDocument)
        .filter(EmployerVerificationDocument.verification_request_id == verification_request.id)
        .all()
    )
    media_files = db_session.query(MediaFile).all()

    assert employer_profile.company_name == "ООО Acme Corp"
    assert employer.legal_name == "ООО Acme Corp"
    assert membership.is_primary is True
    assert employer_profile.verification_status.value == "pending_review"
    assert verification_request.inn == "7707083893"
    assert len(documents) == 2
    assert len(media_files) == 2


def test_employer_verification_draft_returns_saved_fields_and_documents(client, db_session):
    access_token = _register_and_login_employer(client, db_session, email="draft@example.com")

    profile_response = client.put(
        "/api/v1/companies/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "employer_type": "company",
            "company_name": "Draft Corp",
            "inn": "7707083894",
            "corporate_email": "hr@draft.example",
            "website": "https://draft.example",
            "phone": "+7 (999) 111-22-33",
            "social_link": "https://max.chat/draft",
        },
    )
    assert profile_response.status_code == 200

    upload_response = client.post(
        "/api/v1/companies/verification-documents",
        headers={"Authorization": f"Bearer {access_token}"},
        data={
            "phone": "+7 (999) 111-22-33",
            "social_link": "https://max.chat/draft",
        },
        files=[
            ("files", ("registration.pdf", b"registration-document", "application/pdf")),
        ],
    )
    assert upload_response.status_code == 200

    response = client.get(
        "/api/v1/companies/verification-draft",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["website"] == "https://draft.example"
    assert body["phone"] == "+7 (999) 111-22-33"
    assert body["social_link"] == "https://max.chat/draft"
    assert body["verification_request_id"] is not None
    assert len(body["documents"]) == 1
    assert body["documents"][0]["file_name"] == "registration.pdf"


def test_employer_can_delete_existing_verification_document(client, db_session):
    access_token = _register_and_login_employer(client, db_session, email="draft-delete@example.com")

    profile_response = client.put(
        "/api/v1/companies/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "employer_type": "company",
            "company_name": "Delete Corp",
            "inn": "7707083895",
            "corporate_email": "hr@delete.example",
            "website": "https://delete.example",
        },
    )
    assert profile_response.status_code == 200

    upload_response = client.post(
        "/api/v1/companies/verification-documents",
        headers={"Authorization": f"Bearer {access_token}"},
        files=[
            ("files", ("registration.pdf", b"registration-document", "application/pdf")),
        ],
    )
    assert upload_response.status_code == 200

    draft_response = client.get(
        "/api/v1/companies/verification-draft",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    document_id = draft_response.json()["data"]["documents"][0]["id"]

    delete_response = client.delete(
        f"/api/v1/companies/verification-documents/{document_id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert delete_response.status_code == 200

    next_draft_response = client.get(
        "/api/v1/companies/verification-draft",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert next_draft_response.status_code == 200
    assert next_draft_response.json()["data"]["documents"] == []


def test_employer_staff_returns_real_company_members(client, db_session):
    owner_access_token = _register_and_login_employer(client, db_session, email="owner@acme.example")
    _register_and_login_employer(client, db_session, email="recruiter@acme.example")

    profile_response = client.put(
        "/api/v1/companies/profile",
        headers={"Authorization": f"Bearer {owner_access_token}"},
        json={
            "employer_type": "company",
            "company_name": "Acme Corp",
            "inn": "7707083898",
            "corporate_email": "hr@acme.example",
            "website": "https://acme.example",
        },
    )
    assert profile_response.status_code == 200

    from src.enums import EmployerVerificationRequestStatus, EmployerType, MembershipRole
    from src.models import Employer, EmployerMembership, User

    owner = db_session.query(User).filter(User.email == "owner@acme.example").one()
    recruiter = db_session.query(User).filter(User.email == "recruiter@acme.example").one()
    employer = Employer(
        employer_type=EmployerType.COMPANY,
        display_name="Acme Corp",
        legal_name="Acme Corp",
        inn="7707083898",
        corporate_email="hr@acme.example",
        website_url="https://acme.example",
        verification_status=EmployerVerificationRequestStatus.PENDING,
        created_by=owner.id,
        updated_by=owner.id,
    )
    db_session.add(employer)
    db_session.flush()
    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=owner.id,
            membership_role=MembershipRole.OWNER,
            is_primary=True,
        )
    )
    db_session.add(
        EmployerMembership(
            employer_id=employer.id,
            user_id=recruiter.id,
            membership_role=MembershipRole.RECRUITER,
            is_primary=False,
        )
    )
    db_session.commit()

    response = client.get(
        "/api/v1/companies/staff",
        headers={"Authorization": f"Bearer {owner_access_token}"},
    )

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 2
    assert items[0]["email"] == "owner@acme.example"
    assert items[0]["role"] == "owner"
    assert items[0]["is_current_user"] is True
    assert items[0]["is_primary"] is True
    assert "Управление сотрудниками" in items[0]["permissions"]
    assert any(item["email"] == "recruiter@acme.example" and item["role"] == "recruiter" for item in items)


def test_submit_verification_documents_applies_deleted_document_ids_only_on_submit(client, db_session):
    access_token = _register_and_login_employer(client, db_session, email="pending-delete@example.com")

    profile_response = client.put(
        "/api/v1/companies/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "employer_type": "company",
            "company_name": "Pending Delete Corp",
            "inn": "7707083896",
            "corporate_email": "hr@pending-delete.example",
            "website": "https://pending-delete.example",
        },
    )
    assert profile_response.status_code == 200

    initial_upload_response = client.post(
        "/api/v1/companies/verification-documents",
        headers={"Authorization": f"Bearer {access_token}"},
        files=[
            ("files", ("old-a.pdf", b"old-a-document", "application/pdf")),
            ("files", ("old-b.pdf", b"old-b-document", "application/pdf")),
        ],
    )
    assert initial_upload_response.status_code == 200
    verification_request_id = initial_upload_response.json()["data"]["verification_request_id"]

    draft_response = client.get(
        "/api/v1/companies/verification-draft",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert draft_response.status_code == 200
    old_document_id = draft_response.json()["data"]["documents"][0]["id"]

    resubmit_response = client.post(
        "/api/v1/companies/verification-documents",
        headers={"Authorization": f"Bearer {access_token}"},
        data={
            "verification_request_id": verification_request_id,
            "deleted_document_ids": old_document_id,
        },
        files=[
            ("files", ("new-c.pdf", b"new-c-document", "application/pdf")),
        ],
    )
    assert resubmit_response.status_code == 200

    next_draft_response = client.get(
        "/api/v1/companies/verification-draft",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert next_draft_response.status_code == 200
    file_names = sorted(document["file_name"] for document in next_draft_response.json()["data"]["documents"])
    assert file_names == ["new-c.pdf", "old-b.pdf"]
