from uuid import UUID

from sqlalchemy.orm import Session

from src.enums import UserRole
from src.enums.notifications import NotificationKind, NotificationSeverity
from src.models import Notification, User
from src.repositories.notification_repository import NotificationRepository
from src.schemas.notification import NotificationFeedResponse, NotificationRead, NotificationUnreadCountResponse
from src.utils.errors import AppError


class NotificationService:
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

    def mark_all_as_read(self, current_user: User) -> NotificationUnreadCountResponse:
        self.notification_repo.mark_all_as_read(current_user.id)
        self.db.commit()
        return NotificationUnreadCountResponse(unread_count=0)

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
        )
        self.notification_repo.add(notification)
        return notification

    def _seed_demo_notifications_if_needed(self, current_user: User) -> None:
        if self.notification_repo.has_any_for_user(current_user.id):
            return

        if current_user.role == UserRole.APPLICANT:
            self._create_applicant_defaults(current_user)
        elif current_user.role == UserRole.EMPLOYER:
            self._create_employer_defaults(current_user)
        else:
            return

        self.db.commit()

    def _create_applicant_defaults(self, current_user: User) -> None:
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.PROFILE,
            severity=NotificationSeverity.SUCCESS,
            title="Профиль создан",
            message="Заполните ключевые поля профиля, чтобы работодатели чаще находили вас в подборках.",
            action_label="Открыть профиль",
            action_url="/dashboard/applicant",
        )
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.OPPORTUNITY,
            severity=NotificationSeverity.INFO,
            title="Появились новые стажировки",
            message="Подборка по вашему профилю обновилась. Есть 3 новых предложения с гибким графиком.",
            action_label="Смотреть подборку",
            action_url="/",
        )

    def _create_employer_defaults(self, current_user: User) -> None:
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.EMPLOYER_VERIFICATION,
            severity=NotificationSeverity.WARNING,
            title="Подтвердите компанию",
            message="Загрузите документы и завершите верификацию, чтобы публиковать вакансии без ограничений.",
            action_label="Продолжить",
            action_url="/onboarding/employer",
        )
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.CANDIDATES,
            severity=NotificationSeverity.INFO,
            title="Появились новые кандидаты",
            message="Платформа подобрала 8 студентов, которые подходят под ваши направления стажировок.",
            action_label="Открыть дашборд",
            action_url="/dashboard/employer",
        )
        self.create_notification(
            user_id=current_user.id,
            kind=NotificationKind.SYSTEM,
            severity=NotificationSeverity.ATTENTION,
            title="Заполните карточку работодателя",
            message="Добавьте описание компании, стек и преимущества. Это повышает конверсию в отклики.",
            action_label="Заполнить данные",
            action_url="/onboarding/employer",
        )
