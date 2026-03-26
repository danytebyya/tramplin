from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.orm import Session

from src.enums import UserRole
from src.enums.notifications import NotificationKind, NotificationSeverity
from src.models import Notification, User
from src.repositories.notification_repository import NotificationRepository
from src.realtime.notification_hub import notification_hub
from src.schemas.notification import NotificationFeedResponse, NotificationRead, NotificationUnreadCountResponse
from src.utils.errors import AppError


class NotificationService:
    _WELCOME_SUPPRESSED_MARKER_TITLE = "__welcome_suppressed__"

    def __init__(self, db: Session) -> None:
        self.db = db
        self.notification_repo = NotificationRepository(db)

    def list_for_user(self, current_user: User) -> NotificationFeedResponse:
        self._seed_demo_notifications_if_needed(current_user)
        notifications = self.notification_repo.list_for_user(current_user.id)
        unread_count = self.notification_repo.count_unread_for_user(current_user.id)
        return NotificationFeedResponse(
            items=[NotificationRead.model_validate(notification) for notification in notifications],
            unread_count=unread_count,
        )

    def get_unread_count(self, current_user: User) -> NotificationUnreadCountResponse:
        self._seed_demo_notifications_if_needed(current_user)
        return NotificationUnreadCountResponse(
            unread_count=self.notification_repo.count_unread_for_user(current_user.id)
        )

    def mark_as_read(self, current_user: User, notification_id: str) -> NotificationUnreadCountResponse:
        notification = self.notification_repo.get_by_id_for_user(notification_id, current_user.id)
        if notification is None:
            raise AppError(
                code="NOTIFICATION_NOT_FOUND",
                message="Уведомление не найдено",
                status_code=404,
            )

        self.notification_repo.mark_as_read(notification.id, current_user.id)
        self.db.commit()
        return NotificationUnreadCountResponse(
            unread_count=self.notification_repo.count_unread_for_user(current_user.id)
        )

    def clear_all(self, current_user: User) -> NotificationUnreadCountResponse:
        self.notification_repo.delete_all_for_user(current_user.id)
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.SYSTEM,
            severity=NotificationSeverity.INFO,
            title=self._WELCOME_SUPPRESSED_MARKER_TITLE,
            message="Welcome notification suppressed by user action.",
            payload={"system_key": "welcome_suppressed"},
            created_at=datetime.now(UTC),
        )
        self.db.commit()
        return NotificationUnreadCountResponse(
            unread_count=self.notification_repo.count_unread_for_user(current_user.id)
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
    ) -> Notification:
        notification = Notification(
            user_id=user_id,
            kind=kind,
            severity=severity,
            title=title,
            message=message,
            action_label=action_label,
            action_url=action_url,
            payload=payload,
            created_at=created_at,
            updated_at=created_at,
        )
        self.notification_repo.add(notification)
        pending_notification_user_ids = self.db.info.setdefault("pending_notification_user_ids", set())
        pending_notification_user_ids.add(str(user_id))
        return notification

    def _seed_demo_notifications_if_needed(self, current_user: User) -> None:
        has_any_notifications = self.notification_repo.has_any_for_user(current_user.id)
        has_welcome_suppressed = self.notification_repo.has_welcome_suppressed_marker(current_user.id)
        has_welcome_notification = (
            True
            if has_welcome_suppressed
            else self._create_welcome_notification_if_missing(current_user)
        )

        if has_any_notifications:
            if not has_welcome_notification:
                self.db.commit()
            return

        seed_started_at = datetime.now(UTC)

        if current_user.role == UserRole.APPLICANT:
            self._create_applicant_defaults(current_user, seed_started_at=seed_started_at)
        elif current_user.role == UserRole.EMPLOYER:
            self._create_employer_defaults(current_user, seed_started_at=seed_started_at)

        self.db.commit()

    def _get_welcome_content(self, current_user: User) -> tuple[str, str, str]:
        role_message_map = {
            UserRole.APPLICANT: (
                "Добро пожаловать в Трамплин!",
                "Здесь будут появляться новые вакансии, ответы работодателей и важные шаги по вашему профилю.",
                "/dashboard/applicant",
            ),
            UserRole.EMPLOYER: (
                "Добро пожаловать в Трамплин!",
                "Здесь будут собираться новые отклики, статусы верификации компании и рекомендации по кандидатам.",
                "/dashboard/employer",
            ),
            UserRole.CURATOR: (
                "Добро пожаловать в Трамплин!",
                "Здесь будут появляться новые заявки на проверку, задачи модерации и системные события платформы.",
                "/dashboard/curator",
            ),
            UserRole.ADMIN: (
                "Добро пожаловать в Трамплин!",
                "Здесь будут собираться системные события, статусы модерации и критичные уведомления платформы.",
                "/dashboard/curator",
            ),
        }
        title, message, action_url = role_message_map.get(
            current_user.role,
            (
                "Добро пожаловать в Трамплин!",
                "Здесь будут появляться важные события платформы и персональные уведомления.",
                "/",
            ),
        )
        return title, message, action_url

    def _create_welcome_notification_if_missing(self, current_user: User) -> bool:
        welcome_title, welcome_message, welcome_action_url = self._get_welcome_content(current_user)
        has_welcome_notification = self.notification_repo.has_notification_with_title(
            current_user.id,
            welcome_title,
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
        )
        return False

    def _create_applicant_defaults(self, current_user: User, *, seed_started_at: datetime) -> None:
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.PROFILE,
            severity=NotificationSeverity.SUCCESS,
            title="Профиль создан",
            message="Заполните ключевые поля профиля, чтобы работодатели чаще находили вас в подборках.",
            action_label="Открыть профиль",
            action_url="/dashboard/applicant",
            created_at=seed_started_at - timedelta(minutes=6),
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
            )

    def _create_employer_defaults(self, current_user: User, *, seed_started_at: datetime) -> None:
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.EMPLOYER_VERIFICATION,
            severity=NotificationSeverity.WARNING,
            title="Подтвердите компанию",
            message="Загрузите документы и завершите верификацию, чтобы публиковать вакансии без ограничений.",
            action_label="Продолжить",
            action_url="/onboarding/employer",
            created_at=seed_started_at - timedelta(minutes=6),
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
        )
