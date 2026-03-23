import hashlib
from pathlib import Path
from uuid import uuid4

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from src.enums import (
    EmployerVerificationRequestStatus,
    EmployerVerificationStatus,
    EmployerType,
    MembershipRole,
    UserRole,
    VerificationDocumentType,
)
from src.models import (
    Employer,
    EmployerMembership,
    EmployerProfile,
    EmployerVerificationDocument,
    EmployerVerificationRequest,
    MediaFile,
    User,
)
from src.schemas.company import EmployerOnboardingRequest
from src.utils.errors import AppError


class EmployerService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def upsert_profile(self, current_user: User, payload: EmployerOnboardingRequest) -> EmployerProfile:
        if current_user.role != UserRole.EMPLOYER:
            raise AppError(
                code="EMPLOYER_PROFILE_FORBIDDEN",
                message="Профиль работодателя доступен только работодателям",
                status_code=403,
            )

        self.ensure_inn_available(current_user=current_user, inn=payload.inn)

        employer_profile = current_user.employer_profile

        if employer_profile is None:
            employer_profile = EmployerProfile(
                user_id=current_user.id,
                employer_type=payload.employer_type,
                company_name=payload.company_name,
                inn=payload.inn,
                corporate_email=payload.corporate_email,
                website=payload.website,
                verification_status=EmployerVerificationStatus.UNVERIFIED,
            )
            self.db.add(employer_profile)
        else:
            employer_profile.employer_type = payload.employer_type
            employer_profile.company_name = payload.company_name
            employer_profile.inn = payload.inn
            employer_profile.corporate_email = payload.corporate_email
            employer_profile.website = payload.website

        self.db.commit()
        self.db.refresh(employer_profile)
        return employer_profile

    def ensure_inn_available(self, current_user: User, inn: str) -> None:
        normalized_inn = inn.strip()

        conflicting_profile = (
            self.db.query(EmployerProfile)
            .filter(
                EmployerProfile.inn == normalized_inn,
                EmployerProfile.user_id != current_user.id,
            )
            .one_or_none()
        )
        if conflicting_profile is not None:
            raise AppError(
                code="EMPLOYER_INN_EXISTS",
                message="Организация или работодатель с таким ИНН уже зарегистрированы на платформе",
                status_code=409,
            )

        conflicting_employer = (
            self.db.query(Employer)
            .outerjoin(
                EmployerMembership,
                and_(
                    EmployerMembership.employer_id == Employer.id,
                    EmployerMembership.user_id == current_user.id,
                ),
            )
            .filter(
                Employer.inn == normalized_inn,
                or_(EmployerMembership.id.is_(None), EmployerMembership.user_id != current_user.id),
            )
            .one_or_none()
        )
        if conflicting_employer is not None:
            raise AppError(
                code="EMPLOYER_INN_EXISTS",
                message="Организация или работодатель с таким ИНН уже зарегистрированы на платформе",
                status_code=409,
            )

    def submit_verification_documents(
        self,
        current_user: User,
        files: list[tuple[str, str, bytes]],
        *,
        verification_request_id: str | None = None,
    ) -> dict:
        if current_user.role != UserRole.EMPLOYER:
            raise AppError(
                code="EMPLOYER_PROFILE_FORBIDDEN",
                message="Профиль работодателя доступен только работодателям",
                status_code=403,
            )

        employer_profile = current_user.employer_profile
        if employer_profile is None:
            raise AppError(
                code="EMPLOYER_PROFILE_REQUIRED",
                message="Сначала заполните профиль работодателя",
                status_code=400,
            )

        if not files:
            raise AppError(
                code="EMPLOYER_VERIFICATION_DOCUMENTS_REQUIRED",
                message="Загрузите хотя бы один документ",
                status_code=400,
            )

        employer = self.db.query(Employer).filter(Employer.inn == employer_profile.inn).one_or_none()
        if employer is None:
            employer = Employer(
                employer_type=EmployerType(employer_profile.employer_type),
                display_name=employer_profile.company_name,
                legal_name=employer_profile.company_name,
                inn=employer_profile.inn,
                website_url=employer_profile.website,
                corporate_email=employer_profile.corporate_email,
                verification_status=EmployerVerificationRequestStatus.PENDING,
                created_by=current_user.id,
                updated_by=current_user.id,
            )
            self.db.add(employer)
            self.db.flush()
        else:
            employer.employer_type = EmployerType(employer_profile.employer_type)
            employer.display_name = employer_profile.company_name
            employer.legal_name = employer_profile.company_name
            employer.website_url = employer_profile.website
            employer.corporate_email = employer_profile.corporate_email
            employer.verification_status = EmployerVerificationRequestStatus.PENDING
            employer.updated_by = current_user.id

        membership = (
            self.db.query(EmployerMembership)
            .filter(EmployerMembership.employer_id == employer.id, EmployerMembership.user_id == current_user.id)
            .one_or_none()
        )
        if membership is None:
            self.db.add(
                EmployerMembership(
                    employer_id=employer.id,
                    user_id=current_user.id,
                    membership_role=MembershipRole.OWNER,
                    is_primary=True,
                )
            )

        if verification_request_id is None:
            verification_request = EmployerVerificationRequest(
                employer_id=employer.id,
                legal_name=employer_profile.company_name,
                employer_type=EmployerType(employer_profile.employer_type),
                inn=employer_profile.inn,
                corporate_email=employer_profile.corporate_email,
                status=EmployerVerificationRequestStatus.PENDING,
                submitted_by=current_user.id,
            )
            self.db.add(verification_request)
            self.db.flush()
        else:
            verification_request = (
                self.db.query(EmployerVerificationRequest)
                .filter(
                    EmployerVerificationRequest.id == verification_request_id,
                    EmployerVerificationRequest.employer_id == employer.id,
                )
                .one_or_none()
            )
            if verification_request is None:
                raise AppError(
                    code="EMPLOYER_VERIFICATION_REQUEST_NOT_FOUND",
                    message="Заявка на верификацию не найдена",
                    status_code=404,
                )

        storage_dir = Path(__file__).resolve().parents[2] / "storage" / "verification-documents"
        storage_dir.mkdir(parents=True, exist_ok=True)

        for original_filename, mime_type, content in files:
            checksum_sha256 = hashlib.sha256(content).hexdigest()
            suffix = Path(original_filename).suffix
            storage_key = f"verification-documents/{verification_request.id}/{uuid4()}{suffix}"
            target_path = storage_dir / f"{uuid4()}{suffix}"
            target_path.write_bytes(content)

            media_file = MediaFile(
                storage_key=storage_key,
                original_filename=original_filename[:255] or "document",
                mime_type=(mime_type or "application/octet-stream")[:120],
                file_size=len(content),
                checksum_sha256=checksum_sha256,
                storage_provider="local",
                public_url=str(target_path),
                uploaded_by_user_id=current_user.id,
            )
            self.db.add(media_file)
            self.db.flush()

            self.db.add(
                EmployerVerificationDocument(
                    verification_request_id=verification_request.id,
                    media_file_id=media_file.id,
                    document_type=VerificationDocumentType.OTHER,
                )
            )

        employer_profile.verification_status = EmployerVerificationStatus.PENDING_REVIEW
        self.db.commit()
        self.db.refresh(verification_request)

        return {
            "verification_request_id": str(verification_request.id),
            "documents_count": len(files),
        }
