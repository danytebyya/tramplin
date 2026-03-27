import logging
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.security import (
    TokenPayloadError,
    create_access_token,
    create_refresh_token,
    decode_token,
    ensure_token_type,
    hash_password,
    hash_token,
    verify_password,
)
from src.enums import MembershipRole, TokenType, UserRole, UserStatus
from src.models import (
    ApplicantProfile,
    AuthLoginEvent,
    Employer,
    EmployerMembership,
    EmployerStaffInvitation,
    RefreshSession,
    User,
)
from src.repositories import AuthRepository, UserRepository
from src.schemas.auth import (
    AccountContextListResponse,
    AccountContextRead,
    AccountContextSwitchResponse,
    AuthLoginHistoryItemRead,
    AuthLoginHistoryResponse,
    AuthSessionListResponse,
    AuthSessionRead,
    LoginRequest,
    RegisterRequest,
)
from src.services.email_verification_service import EmailVerificationService
from src.services.rate_limit_service import rate_limit_service
from src.utils.errors import AppError


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.auth_repo = AuthRepository(db)

    logger = logging.getLogger(__name__)

    @staticmethod
    def _resolve_membership_permission_keys(role: MembershipRole) -> list[str]:
        if role == MembershipRole.OWNER:
            return [
                "view_responses",
                "manage_opportunities",
                "manage_company_profile",
                "manage_staff",
                "access_chat",
            ]

        if role == MembershipRole.RECRUITER:
            return [
                "view_responses",
                "manage_opportunities",
                "access_chat",
            ]

        if role == MembershipRole.MANAGER:
            return [
                "view_responses",
                "manage_company_profile",
                "access_chat",
            ]

        return [
            "view_responses",
        ]

    def _resolve_active_permissions(self, membership_id) -> list[str] | None:
        if membership_id is None:
            return None

        membership = (
            self.db.query(EmployerMembership)
            .filter(EmployerMembership.id == membership_id)
            .one_or_none()
        )
        if membership is None:
            return None

        return membership.permissions or self._resolve_membership_permission_keys(membership.membership_role)

    def register(self, payload: RegisterRequest) -> User:
        normalized_email = payload.email.lower()
        if payload.role not in {UserRole.APPLICANT, UserRole.EMPLOYER}:
            raise AppError(
                code="AUTH_ROLE_NOT_ALLOWED",
                message="Самостоятельная регистрация доступна только соискателям и работодателям",
                status_code=422,
            )

        self._ensure_email_is_available(normalized_email)

        self.logger.info(
            "auth.register.verify_code email=%s role=%s",
            normalized_email,
            payload.role.value,
        )
        EmailVerificationService(self.db, self.user_repo).verify_registration_code(
            normalized_email,
            payload.verification_code,
            consume=True,
        )

        if payload.company_invite_token is not None:
            self._get_valid_company_invitation_for_registration(
                normalized_email,
                payload.company_invite_token,
            )

        user = User(
            email=normalized_email,
            display_name=payload.display_name,
            password_hash=hash_password(payload.password),
            role=payload.role,
            status=UserStatus.ACTIVE,
        )

        if payload.role == UserRole.APPLICANT and payload.applicant_profile is not None:
            user.applicant_profile = ApplicantProfile(
                full_name=payload.applicant_profile.full_name
                if payload.applicant_profile
                else None,
                university=payload.applicant_profile.university
                if payload.applicant_profile
                else None,
                graduation_year=payload.applicant_profile.graduation_year
                if payload.applicant_profile
                else None,
            )

        self.user_repo.add(user)
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            if self.user_repo.get_by_email(normalized_email, with_profiles=False):
                self.logger.warning("auth.register.email_exists_race email=%s", normalized_email)
                self._raise_email_exists_error()
            raise exc
        self.db.refresh(user)
        self.logger.info("auth.register.persisted email=%s user_id=%s", user.email, user.id)
        return user

    def _get_valid_company_invitation_for_registration(
        self,
        email: str,
        token: str,
    ) -> EmployerStaffInvitation:
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

        if invitation.invited_email is not None and invitation.invited_email.lower() != email:
            raise AppError(
                code="EMPLOYER_INVITATION_EMAIL_MISMATCH",
                message="Приглашение привязано к другой почте",
                status_code=403,
            )

        return invitation

    def login(self, payload: LoginRequest, user_agent: str | None, ip_address: str | None) -> dict:
        normalized_email = payload.email.lower()
        normalized_ip = self._normalize_ip(ip_address)

        self._ensure_login_allowed(normalized_email, normalized_ip)

        user = self.user_repo.get_by_email(normalized_email, with_profiles=False)
        if user is None or not verify_password(payload.password, user.password_hash):
            self._record_login_event(
                user=user,
                email=normalized_email,
                user_agent=user_agent,
                ip_address=ip_address,
                is_success=False,
                failure_reason="invalid_credentials",
            )
            self._register_login_failure(normalized_email, normalized_ip)
            raise AppError(
                code="AUTH_INVALID_CREDENTIALS",
                message="Неверный email или пароль",
                status_code=401,
            )

        if user.status != UserStatus.ACTIVE:
            raise AppError(
                code="AUTH_USER_NOT_ACTIVE",
                message="Учётная запись недоступна для входа",
                status_code=403,
            )

        self._reset_login_failures(normalized_email, normalized_ip)

        refresh_token, refresh_exp, jti = create_refresh_token(subject=str(user.id))
        access_token, access_exp = create_access_token(
            subject=str(user.id),
            role=user.role.value,
            session_jti=jti,
            active_role=user.role.value,
        )
        refresh_token_fingerprint = self._fingerprint_token(refresh_token)

        session = RefreshSession(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            jti=jti,
            user_agent=user_agent,
            ip_address=ip_address,
            active_role=user.role,
            expires_at=refresh_exp,
        )
        self.auth_repo.create_session(session)
        self._record_login_event(
            user=user,
            email=normalized_email,
            user_agent=user_agent,
            ip_address=ip_address,
            is_success=True,
        )
        self.db.commit()
        self.logger.info(
            "auth.login.success user_id=%s email=%s session_id=%s refresh_fp=%s ip=%s ua=%s",
            user.id,
            normalized_email,
            session.id,
            refresh_token_fingerprint,
            normalized_ip,
            self._normalize_optional_value(user_agent),
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": int((access_exp - datetime.now(UTC)).total_seconds()),
            "user": user,
            "has_employer_profile": (
                self.user_repo.has_employer_profile(user.id) if user.role == UserRole.EMPLOYER else False
            ),
        }

    def refresh(self, refresh_token: str, user_agent: str | None, ip_address: str | None) -> dict:
        normalized_ip = self._normalize_ip(ip_address)
        normalized_user_agent = self._normalize_optional_value(user_agent)
        refresh_token_fingerprint = self._fingerprint_token(refresh_token)

        self.logger.info(
            "auth.refresh.start refresh_fp=%s ip=%s ua=%s",
            refresh_token_fingerprint,
            normalized_ip,
            normalized_user_agent,
        )
        try:
            payload = ensure_token_type(decode_token(refresh_token), TokenType.REFRESH)
        except TokenPayloadError as exc:
            self.logger.warning(
                "auth.refresh.invalid_payload refresh_fp=%s ip=%s ua=%s reason=%s",
                refresh_token_fingerprint,
                normalized_ip,
                normalized_user_agent,
                str(exc),
            )
            raise AppError(code="AUTH_INVALID_REFRESH", message=str(exc), status_code=401) from exc

        token_hash_value = hash_token(refresh_token)
        active_session = self.auth_repo.get_active_session_by_hash(token_hash_value)
        if active_session is None:
            self.logger.warning(
                "auth.refresh.session_not_found refresh_fp=%s user_id=%s token_jti=%s ip=%s ua=%s",
                refresh_token_fingerprint,
                payload.get("sub"),
                payload.get("jti"),
                normalized_ip,
                normalized_user_agent,
            )
            raise AppError(
                code="AUTH_REFRESH_REVOKED",
                message="Сессия обновления недействительна или истекла",
                status_code=401,
            )

        if active_session.jti != payload.get("jti") or str(active_session.user_id) != str(payload.get("sub")):
            self.auth_repo.revoke_session(str(active_session.id))
            self.db.commit()
            self.logger.warning(
                "auth.refresh.session_mismatch session_id=%s session_user_id=%s payload_user_id=%s session_jti=%s payload_jti=%s refresh_fp=%s ip=%s ua=%s",
                active_session.id,
                active_session.user_id,
                payload.get("sub"),
                active_session.jti,
                payload.get("jti"),
                refresh_token_fingerprint,
                normalized_ip,
                normalized_user_agent,
            )
            raise AppError(
                code="AUTH_INVALID_REFRESH",
                message="Refresh token не соответствует активной сессии",
                status_code=401,
            )

        user = self.user_repo.get_by_id(str(payload.get("sub")), with_profiles=False)
        if user is None:
            self.logger.warning(
                "auth.refresh.user_not_found session_id=%s payload_user_id=%s refresh_fp=%s ip=%s ua=%s",
                active_session.id,
                payload.get("sub"),
                refresh_token_fingerprint,
                normalized_ip,
                normalized_user_agent,
            )
            raise AppError(code="AUTH_USER_NOT_FOUND", message="Пользователь не найден", status_code=404)

        self.auth_repo.revoke_session(str(active_session.id))

        new_refresh_token, refresh_exp, jti = create_refresh_token(subject=str(user.id))
        access_token, access_exp = create_access_token(
            subject=str(user.id),
            role=user.role.value,
            session_jti=jti,
            active_role=active_session.active_role.value if active_session.active_role is not None else user.role.value,
            active_employer_id=str(active_session.active_employer_id) if active_session.active_employer_id else None,
            active_membership_id=str(active_session.active_membership_id)
            if active_session.active_membership_id
            else None,
            active_permissions=self._resolve_active_permissions(active_session.active_membership_id),
        )
        new_refresh_token_fingerprint = self._fingerprint_token(new_refresh_token)

        session = RefreshSession(
            user_id=user.id,
            token_hash=hash_token(new_refresh_token),
            jti=jti,
            user_agent=user_agent,
            ip_address=ip_address,
            active_role=active_session.active_role or user.role,
            active_employer_id=active_session.active_employer_id,
            active_membership_id=active_session.active_membership_id,
            expires_at=refresh_exp,
        )
        self.auth_repo.create_session(session)
        self.db.commit()
        self.logger.info(
            "auth.refresh.success previous_session_id=%s new_session_id=%s user_id=%s old_refresh_fp=%s new_refresh_fp=%s ip=%s ua=%s",
            active_session.id,
            session.id,
            user.id,
            refresh_token_fingerprint,
            new_refresh_token_fingerprint,
            normalized_ip,
            normalized_user_agent,
        )

        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": int((access_exp - datetime.now(UTC)).total_seconds()),
            "user": user,
            "has_employer_profile": (
                self.user_repo.has_employer_profile(user.id) if user.role == UserRole.EMPLOYER else False
            ),
        }

    def logout(self, user_id: str, refresh_token: str) -> None:
        token_hash_value = hash_token(refresh_token)
        session = self.auth_repo.get_active_session_by_hash(token_hash_value)
        if session and str(session.user_id) == user_id:
            self.auth_repo.revoke_session(str(session.id))
            self.db.commit()
            self.logger.info("auth.logout.success user_id=%s session_id=%s", user_id, session.id)
            return

        self.logger.warning(
            "auth.logout.session_not_found user_id=%s refresh_fp=%s",
            user_id,
            self._fingerprint_token(refresh_token),
        )

    def logout_all(self, user_id: str) -> None:
        self.auth_repo.revoke_all_user_sessions(user_id)
        self.db.commit()
        self.logger.info("auth.logout_all.success user_id=%s", user_id)

    def logout_others(
        self,
        user_id: str,
        *,
        current_user_agent: str | None,
        current_ip_address: str | None,
    ) -> None:
        self.auth_repo.revoke_other_user_sessions(
            user_id,
            current_user_agent=current_user_agent,
            current_ip_address=current_ip_address,
        )
        self.db.commit()
        self.logger.info(
            "auth.logout_others.success user_id=%s ip=%s ua=%s",
            user_id,
            self._normalize_ip(current_ip_address),
            self._normalize_optional_value(current_user_agent),
        )

    def revoke_session(self, user_id: str, session_id: str) -> None:
        session = self.auth_repo.get_active_session_for_user(user_id, session_id)
        if session is None:
            self.logger.warning(
                "auth.revoke_session.not_found user_id=%s target_session_id=%s",
                user_id,
                session_id,
            )
            raise AppError(
                code="AUTH_SESSION_NOT_FOUND",
                message="Сессия не найдена или уже завершена",
                status_code=404,
            )

        self.auth_repo.revoke_session(session.id)
        self.db.commit()
        self.logger.info(
            "auth.revoke_session.success user_id=%s target_session_id=%s",
            user_id,
            session.id,
        )

    def list_sessions(
        self,
        current_user: User,
        *,
        current_session_jti: str | None,
        current_user_agent: str | None,
        current_ip_address: str | None,
    ) -> AuthSessionListResponse:
        sessions = self.auth_repo.list_active_sessions_for_user(current_user.id)
        normalized_current_ip = self._normalize_optional_value(current_ip_address)
        normalized_current_agent = self._normalize_optional_value(current_user_agent)
        current_session_id: str | None = None

        for session in sessions:
            if current_session_jti and session.jti == current_session_jti:
                current_session_id = str(session.id)
                break

            if (
                self._normalize_optional_value(session.ip_address) == normalized_current_ip
                and self._normalize_optional_value(session.user_agent) == normalized_current_agent
            ):
                current_session_id = str(session.id)
                break

        if sessions:
            self.logger.info(
                "auth.sessions.list user_id=%s total=%s current_session_id=%s request_ip=%s request_ua=%s",
                current_user.id,
                len(sessions),
                current_session_id,
                normalized_current_ip,
                normalized_current_agent,
            )
        else:
            self.logger.warning(
                "auth.sessions.list.empty user_id=%s request_ip=%s request_ua=%s",
                current_user.id,
                normalized_current_ip,
                normalized_current_agent,
            )

        items = [
            AuthSessionRead(
                id=str(session.id),
                user_agent=session.user_agent,
                ip_address=session.ip_address,
                created_at=session.created_at.isoformat(),
                expires_at=session.expires_at.isoformat(),
                is_current=str(session.id) == current_session_id,
            )
            for session in sessions
        ]
        return AuthSessionListResponse(items=items)

    def list_login_history(self, current_user: User) -> AuthLoginHistoryResponse:
        events = self.auth_repo.list_login_events_for_user(
            current_user.id,
            current_user.email,
        )
        return AuthLoginHistoryResponse(
            items=[
                AuthLoginHistoryItemRead(
                    id=str(event.id),
                    created_at=event.created_at.isoformat(),
                    is_success=event.is_success,
                    failure_reason=event.failure_reason,
                    user_agent=event.user_agent,
                    ip_address=event.ip_address,
                )
                for event in events
            ]
        )

    def list_account_contexts(
        self,
        current_user: User,
        *,
        current_session_jti: str | None,
    ) -> AccountContextListResponse:
        active_session = (
            self.auth_repo.get_active_session_by_jti(current_user.id, current_session_jti)
            if current_session_jti
            else None
        )
        active_context_id = self._build_context_id(
            active_role=(
                active_session.active_role.value if active_session and active_session.active_role else current_user.role.value
            ),
            membership_id=(
                str(active_session.active_membership_id)
                if active_session and active_session.active_membership_id
                else None
            ),
        )
        items = [self._build_base_context(current_user, active_context_id=active_context_id)]

        for membership, employer in self._list_user_memberships(current_user):
            context_id = self._build_context_id(
                active_role=UserRole.EMPLOYER.value,
                membership_id=str(membership.id),
            )
            items.append(
                AccountContextRead(
                    id=context_id,
                    role=UserRole.EMPLOYER,
                    label=employer.display_name,
                    company_name=employer.display_name,
                    employer_id=str(employer.id),
                    membership_id=str(membership.id),
                    is_default=False,
                    is_active=context_id == active_context_id,
                )
            )

        return AccountContextListResponse(items=items)

    def switch_account_context(
        self,
        current_user: User,
        *,
        current_session_jti: str,
        context_id: str,
    ) -> AccountContextSwitchResponse:
        session = self.auth_repo.get_active_session_by_jti(current_user.id, current_session_jti)
        if session is None:
            raise AppError(
                code="AUTH_SESSION_NOT_FOUND",
                message="Текущая сессия не найдена",
                status_code=404,
            )

        base_context_id = self._build_context_id(active_role=current_user.role.value, membership_id=None)

        if context_id == base_context_id:
            session.active_role = current_user.role
            session.active_employer_id = None
            session.active_membership_id = None
            active_context = self._build_base_context(current_user, active_context_id=context_id)
        else:
            matched_membership: EmployerMembership | None = None
            matched_employer: Employer | None = None

            for membership, employer in self._list_user_memberships(current_user):
                candidate_context_id = self._build_context_id(
                    active_role=UserRole.EMPLOYER.value,
                    membership_id=str(membership.id),
                )
                if candidate_context_id == context_id:
                    matched_membership = membership
                    matched_employer = employer
                    break

            if matched_membership is None or matched_employer is None:
                raise AppError(
                    code="AUTH_CONTEXT_NOT_FOUND",
                    message="Контекст не найден",
                    status_code=404,
                )

            session.active_role = UserRole.EMPLOYER
            session.active_employer_id = matched_employer.id
            session.active_membership_id = matched_membership.id
            active_context = AccountContextRead(
                id=context_id,
                role=UserRole.EMPLOYER,
                label=matched_employer.display_name,
                company_name=matched_employer.display_name,
                employer_id=str(matched_employer.id),
                membership_id=str(matched_membership.id),
                is_default=False,
                is_active=True,
            )

        access_token, access_exp = create_access_token(
            subject=str(current_user.id),
            role=current_user.role.value,
            session_jti=session.jti,
            active_role=session.active_role.value if session.active_role is not None else current_user.role.value,
            active_employer_id=str(session.active_employer_id) if session.active_employer_id else None,
            active_membership_id=str(session.active_membership_id) if session.active_membership_id else None,
            active_permissions=self._resolve_active_permissions(session.active_membership_id),
        )
        self.db.commit()

        return AccountContextSwitchResponse(
            access_token=access_token,
            expires_in=int((access_exp - datetime.now(UTC)).total_seconds()),
            user={
                "id": str(current_user.id),
                "email": current_user.email,
                "display_name": current_user.display_name,
                "role": current_user.role.value,
                "status": current_user.status.value,
                "has_employer_profile": (
                    self.user_repo.has_employer_profile(current_user.id)
                    if current_user.role == UserRole.EMPLOYER
                    else False
                ),
            },
            active_context=active_context,
        )

    def _ensure_login_allowed(self, email: str, ip_address: str) -> None:
        rate_limit_service.ensure_allowed(
            "auth_login_email",
            email,
            limit=settings.auth_login_attempt_limit,
            window_seconds=settings.auth_login_attempt_window_seconds,
            block_seconds=settings.auth_login_block_seconds,
            error_code="AUTH_LOGIN_RATE_LIMITED",
            error_message="Слишком много неудачных попыток входа. Попробуйте позже.",
        )
        rate_limit_service.ensure_allowed(
            "auth_login_ip",
            ip_address,
            limit=settings.auth_login_ip_attempt_limit,
            window_seconds=settings.auth_login_ip_attempt_window_seconds,
            block_seconds=settings.auth_login_ip_block_seconds,
            error_code="AUTH_LOGIN_RATE_LIMITED",
            error_message="Слишком много неудачных попыток входа. Попробуйте позже.",
        )

    def _register_login_failure(self, email: str, ip_address: str) -> None:
        rate_limit_service.register_failure(
            "auth_login_email",
            email,
            limit=settings.auth_login_attempt_limit,
            window_seconds=settings.auth_login_attempt_window_seconds,
            block_seconds=settings.auth_login_block_seconds,
        )
        rate_limit_service.register_failure(
            "auth_login_ip",
            ip_address,
            limit=settings.auth_login_ip_attempt_limit,
            window_seconds=settings.auth_login_ip_attempt_window_seconds,
            block_seconds=settings.auth_login_ip_block_seconds,
        )

    def _reset_login_failures(self, email: str, ip_address: str) -> None:
        rate_limit_service.clear("auth_login_email", email)
        rate_limit_service.clear("auth_login_ip", ip_address)

    @staticmethod
    def _normalize_ip(ip_address: str | None) -> str:
        return (ip_address or "unknown").strip().lower()

    @staticmethod
    def _normalize_optional_value(value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip().lower()
        return normalized_value or None

    def _build_base_context(self, user: User, *, active_context_id: str) -> AccountContextRead:
        role_label_map = {
            UserRole.APPLICANT: "Личный профиль",
            UserRole.EMPLOYER: "Основной профиль работодателя",
            UserRole.JUNIOR: "Профиль junior-куратора",
            UserRole.CURATOR: "Профиль куратора",
            UserRole.ADMIN: "Профиль администратора",
        }
        context_id = self._build_context_id(active_role=user.role.value, membership_id=None)
        return AccountContextRead(
            id=context_id,
            role=user.role,
            label=role_label_map.get(user.role, user.display_name),
            company_name=None,
            employer_id=None,
            membership_id=None,
            is_default=True,
            is_active=context_id == active_context_id,
        )

    def _list_user_memberships(self, user: User) -> list[tuple[EmployerMembership, Employer]]:
        return list(
            self.db.query(EmployerMembership, Employer)
            .join(Employer, Employer.id == EmployerMembership.employer_id)
            .filter(EmployerMembership.user_id == user.id)
            .order_by(EmployerMembership.created_at.asc())
            .all()
        )

    @staticmethod
    def _build_context_id(*, active_role: str, membership_id: str | None) -> str:
        return f"{active_role}:{membership_id or 'base'}"

    @staticmethod
    def _fingerprint_token(token: str) -> str:
        token_hash = hash_token(token)
        return token_hash[:12]

    def _ensure_email_is_available(self, email: str) -> None:
        if self.user_repo.get_by_email(email):
            self.logger.warning("auth.register.email_exists email=%s", email)
            self._raise_email_exists_error()

    @staticmethod
    def _raise_email_exists_error() -> None:
        raise AppError(
            code="AUTH_EMAIL_EXISTS",
            message="Аккаунт с такой почтой уже зарегистрирован",
            status_code=409,
        )

    def _record_login_event(
        self,
        *,
        user: User | None,
        email: str,
        user_agent: str | None,
        ip_address: str | None,
        is_success: bool,
        failure_reason: str | None = None,
    ) -> None:
        event = AuthLoginEvent(
            user_id=user.id if user is not None else None,
            email=email.lower(),
            user_agent=user_agent,
            ip_address=ip_address,
            is_success=is_success,
            failure_reason=failure_reason,
        )
        self.auth_repo.create_login_event(event)
