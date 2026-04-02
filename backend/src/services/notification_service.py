from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.enums import UserRole
from src.enums.notifications import NotificationKind, NotificationSeverity
from src.models import Employer, EmployerMembership, Notification, User
from src.repositories.notification_repository import NotificationRepository
from src.schemas.notification import NotificationFeedResponse, NotificationRead, NotificationUnreadCountResponse
from src.utils.errors import AppError


class NotificationService:
    _WELCOME_SUPPRESSED_MARKER_TITLE = "__welcome_suppressed__"
    _STAFF_PERMISSION_LABELS = {
        "view_responses": "Просмотр откликов",
        "manage_opportunities": "Создание и редактирование возможностей",
        "manage_company_profile": "Управление профилем компании",
        "manage_staff": "Управление сотрудниками",
        "access_chat": "Общение в чате",
    }

    def __init__(self, db: Session) -> None:
        self.db = db
        self.notification_repo = NotificationRepository(db)

    def list_for_user(self, current_user: User, *, access_payload: dict | None = None) -> NotificationFeedResponse:
        profile_scope = self._resolve_profile_scope(current_user, access_payload=access_payload)
        self._seed_demo_notifications_if_needed(current_user, profile_scope=profile_scope)
        notifications = self.notification_repo.list_for_user(current_user.id, profile_scope=profile_scope)
        unread_count = self.notification_repo.count_unread_for_user(current_user.id, profile_scope=profile_scope)
        return NotificationFeedResponse(
            items=[NotificationRead.model_validate(notification) for notification in notifications],
            unread_count=unread_count,
        )

    def get_unread_count(
        self,
        current_user: User,
        *,
        access_payload: dict | None = None,
    ) -> NotificationUnreadCountResponse:
        profile_scope = self._resolve_profile_scope(current_user, access_payload=access_payload)
        self._seed_demo_notifications_if_needed(current_user, profile_scope=profile_scope)
        return NotificationUnreadCountResponse(
            unread_count=self.notification_repo.count_unread_for_user(current_user.id, profile_scope=profile_scope)
        )

    def mark_as_read(
        self,
        current_user: User,
        notification_id: str,
        *,
        access_payload: dict | None = None,
    ) -> NotificationUnreadCountResponse:
        profile_scope = self._resolve_profile_scope(current_user, access_payload=access_payload)
        notification = self.notification_repo.get_by_id_for_user(
            notification_id,
            current_user.id,
            profile_scope=profile_scope,
        )
        if notification is None:
            raise AppError(
                code="NOTIFICATION_NOT_FOUND",
                message="Уведомление не найдено",
                status_code=404,
            )

        self.notification_repo.mark_as_read(notification.id, current_user.id)
        self.db.commit()
        return NotificationUnreadCountResponse(
            unread_count=self.notification_repo.count_unread_for_user(current_user.id, profile_scope=profile_scope)
        )

    def clear_all(self, current_user: User, *, access_payload: dict | None = None) -> NotificationUnreadCountResponse:
        profile_scope = self._resolve_profile_scope(current_user, access_payload=access_payload)
        self.notification_repo.delete_all_for_user(current_user.id, profile_scope=profile_scope)
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.SYSTEM,
            severity=NotificationSeverity.INFO,
            title=self._WELCOME_SUPPRESSED_MARKER_TITLE,
            message="Welcome notification suppressed by user action.",
            payload={"system_key": "welcome_suppressed"},
            created_at=datetime.now(UTC),
            profile_scope=profile_scope,
        )
        self.db.commit()
        return NotificationUnreadCountResponse(
            unread_count=self.notification_repo.count_unread_for_user(current_user.id, profile_scope=profile_scope)
        )

    def hide(
        self,
        current_user: User,
        notification_id: str,
        *,
        access_payload: dict | None = None,
    ) -> NotificationUnreadCountResponse:
        profile_scope = self._resolve_profile_scope(current_user, access_payload=access_payload)
        notification = self.notification_repo.get_by_id_for_user(
            notification_id,
            current_user.id,
            profile_scope=profile_scope,
        )
        if notification is None:
            raise AppError(
                code="NOTIFICATION_NOT_FOUND",
                message="Уведомление не найдено",
                status_code=404,
            )

        self.notification_repo.hide(notification.id, current_user.id, profile_scope=profile_scope)
        self.db.commit()
        return NotificationUnreadCountResponse(
            unread_count=self.notification_repo.count_unread_for_user(current_user.id, profile_scope=profile_scope)
        )

    def create_notification(
        self,
        *,
        user_id: str | UUID,
        kind: NotificationKind,
        severity: NotificationSeverity,
        title: str,
        message: str,
        action_label: str | None = None,
        action_url: str | None = None,
        payload: dict | None = None,
        created_at: datetime | None = None,
        profile_scope: dict | None = None,
    ) -> Notification | None:
        next_payload = dict(payload or {})
        if profile_scope:
            next_payload["profile_scope"] = profile_scope

        candidate_notification = Notification(
            user_id=user_id,
            kind=kind,
            severity=severity,
            title=title,
            message=message,
            action_label=action_label,
            action_url=action_url,
            payload=next_payload or None,
            created_at=created_at,
            updated_at=created_at,
        )
        notification_signature = self.notification_repo.build_notification_signature(candidate_notification)
        if self.notification_repo.has_dismissed_signature(
            user_id,
            notification_signature,
            profile_scope=profile_scope,
        ):
            return None

        notification = candidate_notification
        self.notification_repo.add(notification)
        pending_notification_user_ids = self.db.info.setdefault("pending_notification_user_ids", set())
        pending_notification_user_ids.add(str(user_id))
        return notification

    def _seed_demo_notifications_if_needed(self, current_user: User, *, profile_scope: dict) -> None:
        has_any_notifications = self.notification_repo.has_any_for_user(current_user.id, profile_scope=profile_scope)
        has_welcome_suppressed = self.notification_repo.has_welcome_suppressed_marker(
            current_user.id,
            profile_scope=profile_scope,
        )
        has_welcome_notification = (
            True
            if has_welcome_suppressed
            else self._create_welcome_notification_if_missing(current_user, profile_scope=profile_scope)
        )

        if has_welcome_suppressed and not has_any_notifications:
            return

        if has_any_notifications:
            if not has_welcome_notification:
                self.db.commit()
            return

        seed_started_at = datetime.now(UTC)
        if profile_scope.get("profile_role") == UserRole.EMPLOYER.value:
            membership = self._get_membership_from_profile_scope(profile_scope)
            if membership is not None and not membership.is_primary:
                self._create_staff_employer_defaults(
                    current_user,
                    seed_started_at=seed_started_at,
                    profile_scope=profile_scope,
                    membership=membership,
                )
            else:
                self._create_employer_defaults(
                    current_user,
                    seed_started_at=seed_started_at,
                    profile_scope=profile_scope,
                )
        else:
            self._create_applicant_defaults(
                current_user,
                seed_started_at=seed_started_at,
                profile_scope=profile_scope,
            )

        self.db.commit()

    def _get_welcome_content(self, current_user: User, *, profile_scope: dict) -> tuple[str, str, str]:
        if profile_scope.get("profile_role") == UserRole.EMPLOYER.value:
            membership = self._get_membership_from_profile_scope(profile_scope)
            employer = self._get_employer_from_profile_scope(profile_scope)
            if membership is not None and not membership.is_primary:
                permission_labels = self._resolve_staff_permission_labels(membership.permissions)
                permissions_text = ", ".join(permission_labels) if permission_labels else "базовые рабочие доступы"
                company_name = employer.display_name if employer is not None else "вашей компании"
                return (
                    "Добро пожаловать в Трамплин!",
                    f"В рабочем профиле {company_name} вам доступны: {permissions_text}.",
                    "/settings",
                )

        role_message_map = {
            UserRole.APPLICANT: (
                "Добро пожаловать в Трамплин!",
                "Заполните профиль, чтобы работодатели видели ваш опыт, навыки и карьерные интересы. После этого вам будет проще откликаться на вакансии и получать релевантные предложения.",
                "/dashboard/applicant",
            ),
            UserRole.EMPLOYER: (
                "Добро пожаловать в Трамплин!",
                "Заполните профиль компании и добавьте подробную информацию о работодателе. Так соискатели смогут лучше понять вашу команду, а вы быстрее перейдёте к публикации вакансий и работе с откликами.",
                "/dashboard/employer",
            ),
            UserRole.JUNIOR: (
                "Добро пожаловать в Трамплин!",
                "Проверьте рабочий кабинет: здесь будут появляться заявки на верификацию работодателей, запросы по модерации и другие важные события платформы.",
                "/dashboard/curator#dashboard",
            ),
            UserRole.CURATOR: (
                "Добро пожаловать в Трамплин!",
                "Проверьте рабочий кабинет: здесь будут собираться заявки на проверку, задачи модерации и события, требующие вашего внимания.",
                "/dashboard/curator#dashboard",
            ),
            UserRole.ADMIN: (
                "Добро пожаловать в Трамплин!",
                "Проверьте рабочий кабинет: здесь собраны статусы модерации, системные события и критичные уведомления платформы.",
                "/dashboard/curator#dashboard",
            ),
        }
        title, message, action_url = role_message_map.get(
            current_user.role,
            (
                "Добро пожаловать в Трамплин!",
                "Заполните профиль и проверьте основные настройки, чтобы начать работу с платформой и получать персональные уведомления.",
                "/",
            ),
        )
        return title, message, action_url

    def _create_welcome_notification_if_missing(self, current_user: User, *, profile_scope: dict) -> bool:
        welcome_title, welcome_message, welcome_action_url = self._get_welcome_content(
            current_user,
            profile_scope=profile_scope,
        )
        has_welcome_notification = self.notification_repo.has_notification_with_title(
            current_user.id,
            welcome_title,
            profile_scope=profile_scope,
        )
        if has_welcome_notification:
            return True

        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.SYSTEM,
            severity=NotificationSeverity.INFO,
            title=welcome_title,
            message=welcome_message,
            action_label="Открыть",
            action_url=welcome_action_url,
            created_at=datetime.now(UTC) - timedelta(minutes=10),
            profile_scope=profile_scope,
        )
        return False

    def _create_applicant_defaults(
        self,
        current_user: User,
        *,
        seed_started_at: datetime,
        profile_scope: dict,
    ) -> None:
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.PROFILE,
            severity=NotificationSeverity.SUCCESS,
            title="Профиль создан",
            message="Заполните ключевые поля профиля, чтобы работодатели чаще находили вас в подборках.",
            action_label="Открыть профиль",
            action_url="/dashboard/applicant",
            created_at=seed_started_at - timedelta(minutes=6),
            profile_scope=profile_scope,
        )
        applicant_profile = current_user.applicant_profile
        has_filled_profile = applicant_profile is not None and bool(
            applicant_profile.full_name
            or applicant_profile.university
            or applicant_profile.graduation_year
            or applicant_profile.resume_url
            or applicant_profile.portfolio_url
        )
        if has_filled_profile:
            self.create_notification(
                user_id=current_user.id,
                kind=NotificationKind.OPPORTUNITY,
                severity=NotificationSeverity.INFO,
                title="Появились новые стажировки",
                message="Подборка по вашему профилю обновилась. Есть 3 новых предложения с гибким графиком.",
                action_label="Смотреть подборку",
                action_url="/",
                created_at=seed_started_at - timedelta(minutes=3),
                profile_scope=profile_scope,
            )

    def _create_employer_defaults(
        self,
        current_user: User,
        *,
        seed_started_at: datetime,
        profile_scope: dict,
    ) -> None:
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.EMPLOYER_VERIFICATION,
            severity=NotificationSeverity.WARNING,
            title="Подтвердите компанию",
            message="Загрузите документы и завершите верификацию, чтобы публиковать вакансии без ограничений.",
            action_label="Продолжить",
            action_url="/onboarding/employer",
            created_at=seed_started_at - timedelta(minutes=6),
            profile_scope=profile_scope,
        )
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.CANDIDATES,
            severity=NotificationSeverity.INFO,
            title="Появились новые кандидаты",
            message="Платформа подобрала 8 студентов, которые подходят под ваши направления стажировок.",
            action_label="Открыть дашборд",
            action_url="/dashboard/employer",
            created_at=seed_started_at - timedelta(minutes=3),
            profile_scope=profile_scope,
        )
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.SYSTEM,
            severity=NotificationSeverity.ATTENTION,
            title="Заполните карточку работодателя",
            message="Добавьте описание компании, стек и преимущества. Это повышает конверсию в отклики.",
            action_label="Заполнить данные",
            action_url="/onboarding/employer",
            created_at=seed_started_at - timedelta(minutes=1),
            profile_scope=profile_scope,
        )

    def _create_staff_employer_defaults(
        self,
        current_user: User,
        *,
        seed_started_at: datetime,
        profile_scope: dict,
        membership: EmployerMembership,
    ) -> None:
        employer = self._get_employer_from_profile_scope(profile_scope)
        permission_keys = membership.permissions or []
        company_name = employer.display_name if employer is not None else "компании"

        if "view_responses" in permission_keys:
            self.create_notification(
                user_id=current_user.id,
                kind=NotificationKind.CANDIDATES,
                severity=NotificationSeverity.INFO,
                title="Доступ к откликам активирован",
                message=f"В рабочем профиле {company_name} вы можете просматривать отклики и кандидатов.",
                action_label="Открыть профиль компании",
                action_url="/dashboard/employer",
                created_at=seed_started_at - timedelta(minutes=6),
                profile_scope=profile_scope,
            )

        if "manage_opportunities" in permission_keys:
            self.create_notification(
                user_id=current_user.id,
                kind=NotificationKind.OPPORTUNITY,
                severity=NotificationSeverity.INFO,
                title="Можно управлять возможностями компании",
                message=f"В рабочем профиле {company_name} вам доступно создание и редактирование вакансий и стажировок.",
                action_label="Открыть профиль компании",
                action_url="/dashboard/employer",
                created_at=seed_started_at - timedelta(minutes=3),
                profile_scope=profile_scope,
            )

        if "manage_company_profile" in permission_keys or "manage_staff" in permission_keys:
            self.create_notification(
                user_id=current_user.id,
                kind=NotificationKind.SYSTEM,
                severity=NotificationSeverity.INFO,
                title="Доступ к настройкам компании активирован",
                message=f"Вы можете управлять настройками рабочего профиля {company_name} в рамках выданных доступов.",
                action_label="Открыть настройки",
                action_url="/settings",
                created_at=seed_started_at - timedelta(minutes=1),
                profile_scope=profile_scope,
            )

    def _resolve_profile_scope(self, current_user: User, *, access_payload: dict | None) -> dict:
        active_role = (access_payload or {}).get("active_role") or current_user.role.value
        active_membership_id = (access_payload or {}).get("active_membership_id")
        active_employer_id = (access_payload or {}).get("active_employer_id")

        if active_role == UserRole.EMPLOYER.value:
            scope = {"profile_role": UserRole.EMPLOYER.value}
            if active_employer_id:
                scope["employer_id"] = str(active_employer_id)
            if active_membership_id:
                scope["membership_id"] = str(active_membership_id)
            elif "employer_id" not in scope:
                employer_id = self._resolve_owner_employer_id(current_user)
                if employer_id is not None:
                    scope["employer_id"] = employer_id
            return scope

        return {"profile_role": current_user.role.value}

    def _resolve_owner_employer_id(self, current_user: User) -> str | None:
        membership = self.db.execute(
            select(EmployerMembership)
            .where(EmployerMembership.user_id == current_user.id)
            .order_by(EmployerMembership.is_primary.desc(), EmployerMembership.created_at.asc())
            .limit(1)
        ).scalar_one_or_none()
        return str(membership.employer_id) if membership is not None else None

    def _get_membership_from_profile_scope(self, profile_scope: dict) -> EmployerMembership | None:
        membership_id = profile_scope.get("membership_id")
        if membership_id is None:
            return None

        return self.db.execute(
            select(EmployerMembership).where(EmployerMembership.id == UUID(str(membership_id)))
        ).scalar_one_or_none()

    def _get_employer_from_profile_scope(self, profile_scope: dict) -> Employer | None:
        employer_id = profile_scope.get("employer_id")
        if employer_id is None:
            membership = self._get_membership_from_profile_scope(profile_scope)
            if membership is None:
                return None
            employer_id = str(membership.employer_id)

        return self.db.execute(select(Employer).where(Employer.id == UUID(str(employer_id)))).scalar_one_or_none()

    def _resolve_staff_permission_labels(self, permission_keys: list[str] | None) -> list[str]:
        return [
            self._STAFF_PERMISSION_LABELS[item]
            for item in (permission_keys or [])
            if item in self._STAFF_PERMISSION_LABELS
        ]
