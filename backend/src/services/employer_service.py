import hashlib
import secrets
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import DataError, ProgrammingError
from sqlalchemy.orm import Session, selectinload

from src.core.config import settings
from src.core.security import hash_token
from src.enums import (
    EmployerVerificationRequestStatus,
    EmployerVerificationStatus,
    EmployerType,
    MembershipRole,
    NotificationKind,
    NotificationSeverity,
    UserRole,
    UserStatus,
    VerificationDocumentType,
)
from src.models import (
    Employer,
    EmployerMembership,
    EmployerProfile,
    EmployerStaffInvitation,
    EmployerVerificationDocument,
    EmployerVerificationRequest,
    MediaFile,
    User,
    UserNotificationPreference,
)
from src.schemas.company import (
    EmployerOnboardingRequest,
    EmployerStaffInvitationListRead,
    EmployerStaffInvitationRead,
    EmployerStaffInviteRequest,
    EmployerStaffListRead,
    EmployerStaffMemberRead,
)
from src.realtime.notification_hub import notification_hub
from src.services.email_service import send_email
from src.services.notification_service import NotificationService
from src.utils.errors import AppError


class EmployerService:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _get_verification_storage_dir() -> Path:
        configured_path = os.getenv("VERIFICATION_DOCUMENTS_STORAGE_DIR")
        if configured_path:
            return Path(configured_path).expanduser().resolve()
        return Path(__file__).resolve().parents[2] / "storage" / "verification-documents"

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

        employer_profile.moderator_comment = None

        self.db.commit()
        self.db.refresh(employer_profile)
        return employer_profile

    def list_staff_members(
        self,
        current_user: User,
        *,
        access_payload: dict | None = None,
    ) -> EmployerStaffListRead:
        employer, membership = self._resolve_staff_access(current_user=current_user, access_payload=access_payload)
        if employer is None:
            employer_profile = current_user.employer_profile
            if employer_profile is None:
                raise AppError(
                    code="EMPLOYER_PROFILE_REQUIRED",
                    message="Сначала заполните профиль работодателя",
                    status_code=400,
                )
            return EmployerStaffListRead(
                items=[
                    EmployerStaffMemberRead(
                        id=str(current_user.id),
                        user_id=str(current_user.id),
                        email=current_user.email,
                        role=MembershipRole.OWNER,
                        permissions=self._resolve_membership_permissions(MembershipRole.OWNER),
                        invited_at=employer_profile.created_at.date().isoformat(),
                        is_current_user=True,
                        is_primary=True,
                    )
                ]
            )
        if membership is None:
            raise AppError(
                code="EMPLOYER_STAFF_FORBIDDEN",
                message="Нет доступа к сотрудникам этой компании",
                status_code=403,
            )

        memberships = (
            self.db.query(EmployerMembership, User)
            .join(User, User.id == EmployerMembership.user_id)
            .filter(EmployerMembership.employer_id == employer.id)
            .order_by(EmployerMembership.is_primary.desc(), EmployerMembership.created_at.asc())
            .all()
        )

        return EmployerStaffListRead(
            items=[
                EmployerStaffMemberRead(
                    id=str(membership.id),
                    user_id=str(user.id),
                    email=user.email,
                    role=membership.membership_role,
                    permissions=self._resolve_membership_permissions(membership.membership_role),
                    invited_at=membership.created_at.date().isoformat(),
                    is_current_user=user.id == current_user.id,
                    is_primary=membership.is_primary,
                )
                for membership, user in memberships
            ]
        )

    def list_staff_invitations(
        self,
        current_user: User,
        *,
        access_payload: dict | None = None,
    ) -> EmployerStaffInvitationListRead:
        employer, membership = self._resolve_staff_access(current_user=current_user, access_payload=access_payload)
        self._ensure_staff_management_allowed(membership)

        items = (
            self.db.query(EmployerStaffInvitation)
            .filter(
                EmployerStaffInvitation.employer_id == employer.id,
                EmployerStaffInvitation.revoked_at.is_(None),
                EmployerStaffInvitation.accepted_at.is_(None),
            )
            .order_by(EmployerStaffInvitation.created_at.desc())
            .all()
        )
        return EmployerStaffInvitationListRead(
            items=[
                EmployerStaffInvitationRead(
                    id=str(item.id),
                    email=item.invited_email,
                    role=item.membership_role,
                    status="pending" if item.expires_at > datetime.now(UTC) else "expired",
                    invited_at=item.created_at.date().isoformat(),
                    expires_at=item.expires_at.date().isoformat(),
                )
                for item in items
            ]
        )

    def invite_staff_member(
        self,
        current_user: User,
        payload: EmployerStaffInviteRequest,
        *,
        access_payload: dict | None = None,
    ) -> EmployerStaffInvitationRead:
        employer, membership = self._resolve_staff_access(current_user=current_user, access_payload=access_payload)
        self._ensure_staff_management_allowed(membership)

        existing_user = self.db.query(User).filter(User.email == payload.email).one_or_none()
        if existing_user is not None:
            existing_membership = (
                self.db.query(EmployerMembership)
                .filter(
                    EmployerMembership.employer_id == employer.id,
                    EmployerMembership.user_id == existing_user.id,
                )
                .one_or_none()
            )
            if existing_membership is not None:
                raise AppError(
                    code="EMPLOYER_STAFF_ALREADY_EXISTS",
                    message="Пользователь уже привязан к этой компании",
                    status_code=409,
                )

        token = secrets.token_urlsafe(24)
        invitation = EmployerStaffInvitation(
            employer_id=employer.id,
            invited_email=payload.email,
            membership_role=payload.role,
            token_hash=hash_token(token),
            invited_by_user_id=current_user.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        self.db.add(invitation)
        self.db.commit()
        self.db.refresh(invitation)

        invitation_url = (
            f"{settings.frontend_base_url.rstrip('/')}/settings"
            f"?invite_token={token}&mode=accept-company-invite"
        )
        if existing_user is not None:
            body = (
                f"Вас пригласили в компанию {employer.display_name}.\n\n"
                "У вас уже есть аккаунт на Трамплин. После перехода по ссылке новый рабочий профиль компании "
                "будет добавлен как отдельный контекст, и вы сможете быстро переключаться между профилями.\n\n"
                f"Ссылка: {invitation_url}"
            )
        else:
            body = (
                f"Вас пригласили в компанию {employer.display_name}.\n\n"
                "Если у вас ещё нет аккаунта в Трамплин, зарегистрируйтесь как соискатель по этой почте, "
                "а затем откройте ссылку приглашения, чтобы привязать рабочий профиль компании.\n\n"
                f"Ссылка: {invitation_url}"
            )
        self._send_moderation_email(
            recipient=payload.email,
            subject=f"Приглашение в компанию {employer.display_name}",
            body=body,
        )

        return EmployerStaffInvitationRead(
            id=str(invitation.id),
            email=invitation.invited_email,
            role=invitation.membership_role,
            status="pending",
            invited_at=invitation.created_at.date().isoformat(),
            expires_at=invitation.expires_at.date().isoformat(),
        )

    def accept_staff_invitation(
        self,
        current_user: User,
        *,
        token: str,
    ) -> EmployerStaffMemberRead:
        invitation = (
            self.db.query(EmployerStaffInvitation)
            .filter(EmployerStaffInvitation.token_hash == hash_token(token))
            .one_or_none()
        )
        if invitation is None or invitation.revoked_at is not None or invitation.accepted_at is not None:
            raise AppError(
                code="EMPLOYER_INVITATION_NOT_FOUND",
                message="Приглашение не найдено или уже недоступно",
                status_code=404,
            )
        invitation_expires_at = (
            invitation.expires_at.replace(tzinfo=UTC)
            if invitation.expires_at.tzinfo is None
            else invitation.expires_at
        )
        if invitation_expires_at <= datetime.now(UTC):
            raise AppError(
                code="EMPLOYER_INVITATION_EXPIRED",
                message="Срок действия приглашения истёк",
                status_code=410,
            )
        if current_user.email.lower() != invitation.invited_email.lower():
            raise AppError(
                code="EMPLOYER_INVITATION_EMAIL_MISMATCH",
                message="Приглашение привязано к другой почте",
                status_code=403,
            )

        membership = (
            self.db.query(EmployerMembership)
            .filter(
                EmployerMembership.employer_id == invitation.employer_id,
                EmployerMembership.user_id == current_user.id,
            )
            .one_or_none()
        )
        if membership is None:
            membership = EmployerMembership(
                employer_id=invitation.employer_id,
                user_id=current_user.id,
                membership_role=invitation.membership_role,
                is_primary=False,
            )
            self.db.add(membership)
            self.db.flush()

        invitation.accepted_at = datetime.now(UTC)
        self.db.add(invitation)
        self.db.commit()

        employer = self.db.query(Employer).filter(Employer.id == invitation.employer_id).one()
        return EmployerStaffMemberRead(
            id=str(membership.id),
            user_id=str(current_user.id),
            email=current_user.email,
            role=membership.membership_role,
            permissions=self._resolve_membership_permissions(membership.membership_role),
            invited_at=membership.created_at.date().isoformat(),
            is_current_user=True,
            is_primary=membership.is_primary,
        )

    def leave_company(
        self,
        current_user: User,
        *,
        membership_id: str,
    ) -> None:
        membership = (
            self.db.query(EmployerMembership)
            .filter(
                EmployerMembership.id == UUID(str(membership_id)),
                EmployerMembership.user_id == current_user.id,
            )
            .one_or_none()
        )
        if membership is None:
            raise AppError(
                code="EMPLOYER_MEMBERSHIP_NOT_FOUND",
                message="Привязка к компании не найдена",
                status_code=404,
            )
        if membership.is_primary:
            raise AppError(
                code="EMPLOYER_MEMBERSHIP_PRIMARY_FORBIDDEN",
                message="Основной профиль компании нельзя отвязать через приглашение",
                status_code=409,
            )
        self.db.delete(membership)
        self.db.commit()

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

    @staticmethod
    def _resolve_membership_permissions(role: MembershipRole) -> list[str]:
        if role == MembershipRole.OWNER:
            return [
                "Просмотр откликов",
                "Создание и редактирование возможностей",
                "Управление профилем компании",
                "Управление сотрудниками",
                "Общение в чате",
            ]

        if role == MembershipRole.RECRUITER:
            return [
                "Просмотр откликов",
                "Создание и редактирование возможностей",
                "Общение в чате",
            ]

        if role == MembershipRole.MANAGER:
            return [
                "Просмотр откликов",
                "Управление профилем компании",
                "Общение в чате",
            ]

        return [
            "Просмотр откликов",
        ]

    def _resolve_staff_access(
        self,
        *,
        current_user: User,
        access_payload: dict | None,
    ) -> tuple[Employer | None, EmployerMembership | None]:
        effective_role = (access_payload or {}).get("active_role") or current_user.role.value
        active_employer_id = (access_payload or {}).get("active_employer_id")
        active_membership_id = (access_payload or {}).get("active_membership_id")

        if effective_role != UserRole.EMPLOYER.value:
            raise AppError(
                code="EMPLOYER_STAFF_FORBIDDEN",
                message="Сотрудники компании доступны только работодателям",
                status_code=403,
            )

        if active_employer_id:
            employer = self.db.query(Employer).filter(Employer.id == UUID(str(active_employer_id))).one_or_none()
            if employer is None:
                raise AppError(
                    code="EMPLOYER_NOT_FOUND",
                    message="Компания не найдена",
                    status_code=404,
                )
            membership = None
            if active_membership_id:
                membership = (
                    self.db.query(EmployerMembership)
                    .filter(
                        EmployerMembership.id == UUID(str(active_membership_id)),
                        EmployerMembership.user_id == current_user.id,
                        EmployerMembership.employer_id == employer.id,
                    )
                    .one_or_none()
                )
            return employer, membership

        employer_profile = current_user.employer_profile
        if employer_profile is None or not employer_profile.inn:
            raise AppError(
                code="EMPLOYER_PROFILE_REQUIRED",
                message="Сначала заполните профиль работодателя",
                status_code=400,
            )

        employer = self.db.query(Employer).filter(Employer.inn == employer_profile.inn).one_or_none()
        if employer is None:
            return None, None

        membership = (
            self.db.query(EmployerMembership)
            .filter(EmployerMembership.employer_id == employer.id, EmployerMembership.user_id == current_user.id)
            .one_or_none()
        )
        return employer, membership

    @staticmethod
    def _ensure_staff_management_allowed(membership: EmployerMembership | None) -> None:
        if membership is None or membership.membership_role != MembershipRole.OWNER:
            raise AppError(
                code="EMPLOYER_STAFF_MANAGEMENT_FORBIDDEN",
                message="Управление сотрудниками доступно только владельцу компании",
                status_code=403,
            )

    def get_verification_document_or_raise(
        self,
        *,
        current_user: User,
        document_id: str,
    ) -> EmployerVerificationDocument:
        document = (
            self.db.query(EmployerVerificationDocument)
            .options(
                selectinload(EmployerVerificationDocument.media_file),
                selectinload(EmployerVerificationDocument.verification_request),
            )
            .filter(EmployerVerificationDocument.id == UUID(str(document_id)))
            .one_or_none()
        )

        if document is None or document.media_file is None:
            raise AppError(
                code="EMPLOYER_VERIFICATION_DOCUMENT_NOT_FOUND",
                message="Документ не найден",
                status_code=404,
            )

        if current_user.role in {UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN}:
            return document

        if current_user.role != UserRole.EMPLOYER:
            raise AppError(
                code="EMPLOYER_VERIFICATION_DOCUMENT_FORBIDDEN",
                message="Недостаточно прав для просмотра документа",
                status_code=403,
            )

        verification_request = document.verification_request
        if verification_request is None or verification_request.submitted_by != current_user.id:
            raise AppError(
                code="EMPLOYER_VERIFICATION_DOCUMENT_FORBIDDEN",
                message="Недостаточно прав для просмотра документа",
                status_code=403,
            )

        return document

    def submit_verification_documents(
        self,
        current_user: User,
        files: list[tuple[str, str, bytes]],
        *,
        verification_request_id: str | None = None,
        deleted_document_ids: list[str] | None = None,
        phone: str | None = None,
        social_link: str | None = None,
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

        employer = self.db.query(Employer).filter(Employer.inn == employer_profile.inn).one_or_none()
        if employer is None:
            employer = Employer(
                employer_type=EmployerType(employer_profile.employer_type),
                display_name=employer_profile.company_name,
                legal_name=employer_profile.company_name,
                inn=employer_profile.inn,
                website_url=employer_profile.website,
                corporate_email=employer_profile.corporate_email,
                phone=employer_profile.phone,
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
            employer.phone = employer_profile.phone
            employer.verification_status = EmployerVerificationRequestStatus.PENDING
            employer.verified_at = None
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
                phone=phone,
                social_link=social_link,
                status=EmployerVerificationRequestStatus.PENDING,
                submitted_by=current_user.id,
            )
            self.db.add(verification_request)
            self.db.flush()
        else:
            try:
                verification_request_uuid = UUID(str(verification_request_id))
            except ValueError as exc:
                raise AppError(
                    code="EMPLOYER_VERIFICATION_REQUEST_NOT_FOUND",
                    message="Заявка на верификацию не найдена",
                    status_code=404,
                ) from exc
            verification_request = (
                self.db.query(EmployerVerificationRequest)
                .filter(
                    EmployerVerificationRequest.id == verification_request_uuid,
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
            previous_status = verification_request.status
            previous_reviewed_by = verification_request.reviewed_by
            verification_request.employer_id = employer.id
            verification_request.legal_name = employer_profile.company_name
            verification_request.employer_type = EmployerType(employer_profile.employer_type)
            verification_request.inn = employer_profile.inn
            verification_request.corporate_email = employer_profile.corporate_email
            verification_request.phone = phone
            verification_request.social_link = social_link
            verification_request.status = EmployerVerificationRequestStatus.PENDING
            verification_request.submitted_by = current_user.id
            verification_request.submitted_at = datetime.now(UTC)
            verification_request.reviewed_by = None
            verification_request.reviewed_at = None
            verification_request.rejection_reason = None
            verification_request.moderator_comment = None
        if verification_request_id is None:
            previous_status = None
            previous_reviewed_by = None

        existing_documents = list(verification_request.documents or [])
        documents_to_delete: list[EmployerVerificationDocument] = []
        deleted_document_ids_set: set[str] = set()

        for document_id in deleted_document_ids or []:
            document = self.get_verification_document_or_raise(
                current_user=current_user,
                document_id=document_id,
            )
            if document.verification_request_id != verification_request.id:
                raise AppError(
                    code="EMPLOYER_VERIFICATION_DOCUMENT_FORBIDDEN",
                    message="Недостаточно прав для удаления документа",
                    status_code=403,
                )
            if document.id in deleted_document_ids_set:
                continue
            deleted_document_ids_set.add(document.id)
            documents_to_delete.append(document)

        remaining_existing_documents = [
            document for document in existing_documents if document.id not in deleted_document_ids_set
        ]
        if not files and not remaining_existing_documents:
            raise AppError(
                code="EMPLOYER_VERIFICATION_DOCUMENTS_REQUIRED",
                message="Загрузите хотя бы один документ",
                status_code=400,
            )

        for document in documents_to_delete:
            self._delete_verification_document_record(document)

        storage_dir = self._get_verification_storage_dir()
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
        employer_profile.moderator_comment = None
        NotificationService(self.db).create_notification(
            user_id=current_user.id,
            kind=NotificationKind.EMPLOYER_VERIFICATION,
            severity=NotificationSeverity.SUCCESS,
            title="Документы отправлены",
            message="Заявка на верификацию компании принята. Мы уведомим вас после проверки куратором.",
            action_label="Открыть профиль",
            action_url="/onboarding/employer",
            payload={"verification_request_id": str(verification_request.id)},
        )
        if previous_status == EmployerVerificationRequestStatus.SUSPENDED and previous_reviewed_by is not None:
            self._notify_curator_about_resubmitted_verification_request(
                curator_user_id=previous_reviewed_by,
                verification_request=verification_request,
            )
        elif previous_status is None:
            self._notify_moderators_about_new_verification_request(verification_request=verification_request)
        self.db.commit()
        self.db.refresh(verification_request)
        self._publish_verification_request_updated(verification_request)

        return {
            "verification_request_id": str(verification_request.id),
            "documents_count": len(files),
        }

    def get_verification_draft(self, current_user: User) -> dict:
        if current_user.role != UserRole.EMPLOYER:
            raise AppError(
                code="EMPLOYER_PROFILE_FORBIDDEN",
                message="Профиль работодателя доступен только работодателям",
                status_code=403,
            )

        employer_profile = current_user.employer_profile
        if employer_profile is None:
            return {
                "verification_request_id": None,
                "website": None,
                "phone": None,
                "social_link": None,
                "documents": [],
            }

        verification_request = (
            self.db.query(EmployerVerificationRequest)
            .options(
                selectinload(EmployerVerificationRequest.documents).selectinload(
                    EmployerVerificationDocument.media_file
                )
            )
            .filter(
                EmployerVerificationRequest.submitted_by == current_user.id,
                EmployerVerificationRequest.status.in_(
                    [
                        EmployerVerificationRequestStatus.PENDING,
                        EmployerVerificationRequestStatus.UNDER_REVIEW,
                        EmployerVerificationRequestStatus.SUSPENDED,
                        EmployerVerificationRequestStatus.REJECTED,
                    ]
                ),
            )
            .order_by(EmployerVerificationRequest.submitted_at.desc())
            .first()
        )

        return {
            "verification_request_id": str(verification_request.id) if verification_request is not None else None,
            "website": employer_profile.website,
            "phone": verification_request.phone if verification_request is not None else None,
            "social_link": verification_request.social_link if verification_request is not None else None,
            "documents": [
                {
                    "id": str(document.id),
                    "file_name": (
                        document.media_file.original_filename if document.media_file is not None else "Документ"
                    ),
                    "file_size": document.media_file.file_size if document.media_file is not None else 0,
                    "mime_type": (
                        document.media_file.mime_type
                        if document.media_file is not None
                        else "application/octet-stream"
                    ),
                    "file_url": (
                        f"/api/v1/companies/verification-documents/{document.id}/file"
                        if document.media_file is not None
                        else document.source_url
                    ),
                }
                for document in (verification_request.documents if verification_request is not None else [])
            ],
        }

    def delete_verification_document(self, *, current_user: User, document_id: str) -> None:
        document = self.get_verification_document_or_raise(
            current_user=current_user,
            document_id=document_id,
        )
        self._delete_verification_document_record(document)
        self.db.commit()

    def _delete_verification_document_record(self, document: EmployerVerificationDocument) -> None:
        media_file = document.media_file
        if media_file is not None and media_file.public_url:
            file_path = Path(media_file.public_url)
            if file_path.exists() and file_path.is_file():
                file_path.unlink()

        self.db.delete(document)
        if media_file is not None:
            self.db.delete(media_file)

    def _notify_moderators_about_new_verification_request(self, *, verification_request: EmployerVerificationRequest) -> None:
        notification_service = NotificationService(self.db)
        title = "Новая заявка на верификацию"
        message = (
            f"Поступила новая заявка на верификацию работодателя: "
            f"{verification_request.legal_name}."
        )
        for moderator in self._list_moderation_recipients():
            if self._is_moderation_notification_enabled(moderator, "push_new_verification_requests"):
                notification_service.create_notification(
                    user_id=moderator.id,
                    kind=NotificationKind.EMPLOYER_VERIFICATION,
                    severity=NotificationSeverity.INFO,
                    title=title,
                    message=message,
                    action_label="Открыть список",
                    action_url="/moderation/employers",
                    payload={
                        "verification_request_id": str(verification_request.id),
                        "status": EmployerVerificationRequestStatus.PENDING.value,
                    },
                )
            if self._is_moderation_email_enabled(moderator, "email_new_verification_requests"):
                self._send_moderation_email(
                    recipient=moderator.email,
                    subject=title,
                    body=(
                        f"{message}\n\n"
                        f"Компания: {verification_request.legal_name}\n"
                        f"ИНН: {verification_request.inn}\n\n"
                        "Откройте список заявок на верификацию в панели куратора."
                    ),
                )

    def _notify_curator_about_resubmitted_verification_request(
        self,
        *,
        curator_user_id,
        verification_request: EmployerVerificationRequest,
    ) -> None:
        moderator = self._get_moderation_recipient(
            curator_user_id,
        )
        if moderator is None:
            return

        title = "Работодатель прислал обновлённые данные"
        message = (
            f"По заявке {verification_request.legal_name} поступили обновлённые данные "
            "после запроса дополнительной информации."
        )
        if self._is_moderation_notification_enabled(moderator, "push_company_profile_changes"):
            NotificationService(self.db).create_notification(
                user_id=moderator.id,
                kind=NotificationKind.EMPLOYER_VERIFICATION,
                severity=NotificationSeverity.INFO,
                title=title,
                message=message,
                action_label="Открыть заявку",
                action_url="/moderation/employers",
                payload={
                    "verification_request_id": str(verification_request.id),
                    "status": EmployerVerificationRequestStatus.PENDING.value,
                    "source": "resubmitted_after_changes_request",
                },
            )
        if self._is_moderation_email_enabled(moderator, "email_company_profile_changes"):
            self._send_moderation_email(
                recipient=moderator.email,
                subject=title,
                body=(
                    f"{message}\n\n"
                    f"Компания: {verification_request.legal_name}\n"
                    f"ИНН: {verification_request.inn}\n\n"
                    "Откройте заявку в панели куратора."
                ),
            )

    def _list_moderation_recipients(self) -> list[User]:
        try:
            stmt = (
                select(User)
                .options(selectinload(User.notification_preferences))
                .where(
                    User.role.in_([UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN]),
                    User.status == UserStatus.ACTIVE,
                )
            )
            return list(self.db.execute(stmt).scalars().all())
        except (ProgrammingError, DataError):
            self.db.rollback()
            stmt = (
                select(User)
                .options(selectinload(User.notification_preferences))
                .where(
                    User.role.in_([UserRole.CURATOR, UserRole.ADMIN]),
                    User.status == UserStatus.ACTIVE,
                )
            )
            return list(self.db.execute(stmt).scalars().all())

    def _publish_verification_request_updated(self, verification_request: EmployerVerificationRequest) -> None:
        moderator_user_ids = [str(user.id) for user in self._list_moderation_recipients()]
        if not moderator_user_ids:
            return

        notification_hub.publish_to_users_sync(
            moderator_user_ids,
            {
                "type": "moderation_employer_verification_updated",
                "verification_request_id": str(verification_request.id),
                "status": verification_request.status.value,
            },
        )

    def _get_moderation_recipient(self, user_id) -> User | None:
        stmt = (
            select(User)
            .options(selectinload(User.notification_preferences))
            .where(User.id == UUID(str(user_id)))
        )
        user = self.db.execute(stmt).scalar_one_or_none()
        if (
            user is None
            or user.role not in {UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN}
            or user.status != UserStatus.ACTIVE
        ):
            return None
        return user

    @staticmethod
    def _is_moderation_notification_enabled(user: User, preference_key: str) -> bool:
        preferences = user.notification_preferences
        if preferences is None:
            return False
        return bool(getattr(preferences, preference_key, False))

    @staticmethod
    def _is_moderation_email_enabled(user: User, preference_key: str) -> bool:
        preferences = user.notification_preferences
        if preferences is None:
            return False
        return bool(getattr(preferences, preference_key, False))

    @staticmethod
    def _send_moderation_email(*, recipient: str | None, subject: str, body: str) -> None:
        if not recipient:
            return
        try:
            send_email(recipient=recipient, subject=subject, body=body)
        except Exception:
            return
