import logging
import threading
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from src.core.config import settings
from src.db.session import SessionLocal
from src.enums import UserRole
from src.enums.notifications import NotificationKind, NotificationSeverity
from src.models import ChatConversation, ChatUnreadReminderState, User
from src.repositories.chat_repository import ChatRepository
from src.repositories.user_repository import UserRepository
from src.services.email_service import send_email
from src.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


@dataclass
class ChatReminderScope:
    user_id: str
    profile_role: str
    employer_id: str | None = None

    @property
    def scope_key(self) -> str:
        if self.profile_role == UserRole.EMPLOYER.value and self.employer_id:
            return f"{self.profile_role}:{self.employer_id}"
        return self.profile_role


@dataclass
class ChatUnreadSummary:
    first_unread_message_at: datetime
    last_unread_message_at: datetime
    unread_messages_count: int
    unread_conversations_count: int
    counterpart_titles: list[str]
    sender_roles: set[str]


class ChatReminderService:
    def __init__(self, db) -> None:
        self.db = db
        self.chat_repo = ChatRepository(db)
        self.user_repo = UserRepository(db)
        self.notification_service = NotificationService(db)

    @staticmethod
    def build_scope(*, user_id: str, profile_role: str, employer_id: str | None = None) -> ChatReminderScope:
        return ChatReminderScope(
            user_id=str(user_id),
            profile_role=profile_role,
            employer_id=str(employer_id) if employer_id else None,
        )

    def mark_incoming_message_pending(
        self,
        *,
        recipient_user_id: str,
        profile_role: str,
        employer_id: str | None,
        message_created_at: datetime,
    ) -> None:
        scope = self.build_scope(
            user_id=recipient_user_id,
            profile_role=profile_role,
            employer_id=employer_id,
        )
        state = self.chat_repo.get_or_create_unread_reminder_state(
            user_id=scope.user_id,
            profile_role=scope.profile_role,
            employer_id=scope.employer_id,
            scope_key=scope.scope_key,
        )

        if not state.is_pending or state.first_unread_message_at is None:
            state.first_unread_message_at = message_created_at

        state.is_pending = True
        state.last_unread_message_at = message_created_at
        self.db.add(state)

    def sync_scope_read_state(
        self,
        *,
        user_id: str,
        profile_role: str,
        employer_id: str | None,
    ) -> None:
        scope = self.build_scope(user_id=user_id, profile_role=profile_role, employer_id=employer_id)
        state = self.chat_repo.get_or_create_unread_reminder_state(
            user_id=scope.user_id,
            profile_role=scope.profile_role,
            employer_id=scope.employer_id,
            scope_key=scope.scope_key,
        )
        summary = self._build_unread_summary(scope)

        if summary is None:
            state.is_pending = False
            state.first_unread_message_at = None
            state.last_unread_message_at = None
        else:
            state.is_pending = True
            state.first_unread_message_at = summary.first_unread_message_at
            state.last_unread_message_at = summary.last_unread_message_at

        self.db.add(state)

    def process_due_reminders(self, *, now: datetime | None = None) -> int:
        current_time = self._as_utc_datetime(now or datetime.now(UTC))
        due_before = current_time - timedelta(minutes=settings.chat_unread_email_delay_minutes)
        processed_count = 0

        for state in self.chat_repo.list_due_unread_reminder_states(due_before=due_before):
            scope = self.build_scope(
                user_id=str(state.user_id),
                profile_role=state.profile_role.value if hasattr(state.profile_role, "value") else str(state.profile_role),
                employer_id=str(state.employer_id) if state.employer_id else None,
            )
            summary = self._build_unread_summary(scope)

            if summary is None:
                state.is_pending = False
                state.first_unread_message_at = None
                state.last_unread_message_at = None
                self.db.add(state)
                continue

            if (
                state.last_notified_message_at is not None
                and summary.last_unread_message_at <= state.last_notified_message_at
            ):
                state.first_unread_message_at = summary.first_unread_message_at
                state.last_unread_message_at = summary.last_unread_message_at
                state.is_pending = True
                self.db.add(state)
                continue

            if (
                state.last_notified_at is not None
                and current_time
                < self._as_utc_datetime(state.last_notified_at)
                + timedelta(hours=settings.chat_unread_notification_cooldown_hours)
            ):
                state.first_unread_message_at = summary.first_unread_message_at
                state.last_unread_message_at = summary.last_unread_message_at
                state.is_pending = True
                self.db.add(state)
                continue

            user = self.user_repo.get_by_id(scope.user_id, with_profiles=False)
            if user is None:
                continue

            self._deliver_reminder(user=user, scope=scope, summary=summary, current_time=current_time)
            state.is_pending = True
            state.first_unread_message_at = summary.first_unread_message_at
            state.last_unread_message_at = summary.last_unread_message_at
            state.last_notified_at = current_time
            state.last_notified_message_at = summary.last_unread_message_at
            self.db.add(state)
            processed_count += 1

        self.db.commit()
        return processed_count

    @staticmethod
    def _as_utc_datetime(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _build_unread_summary(self, scope: ChatReminderScope) -> ChatUnreadSummary | None:
        conversations = self.chat_repo.list_conversations_for_scope(
            scope.user_id,
            profile_role=scope.profile_role,
            employer_id=scope.employer_id,
        )
        unread_messages_count = 0
        unread_conversations_count = 0
        first_unread_message_at: datetime | None = None
        last_unread_message_at: datetime | None = None
        counterpart_titles: list[str] = []
        sender_roles: set[str] = set()

        for conversation in conversations:
            read_state = self.chat_repo.get_read_state(str(conversation.id), scope.user_id)
            messages = self.chat_repo.list_messages(str(conversation.id))
            unread_incoming_messages = [
                item
                for item in messages
                if str(item.sender_user_id) != scope.user_id
                and (read_state is None or read_state.last_read_at is None or item.created_at > read_state.last_read_at)
            ]

            if not unread_incoming_messages:
                continue

            unread_conversations_count += 1
            unread_messages_count += len(unread_incoming_messages)
            first_message = unread_incoming_messages[0]
            last_message = unread_incoming_messages[-1]
            first_unread_message_at = (
                first_message.created_at
                if first_unread_message_at is None
                else min(first_unread_message_at, first_message.created_at)
            )
            last_unread_message_at = (
                last_message.created_at
                if last_unread_message_at is None
                else max(last_unread_message_at, last_message.created_at)
            )

            counterpart_title, sender_role = self._resolve_counterpart_identity(conversation=conversation, scope=scope)
            if counterpart_title and counterpart_title not in counterpart_titles:
                counterpart_titles.append(counterpart_title)
            if sender_role:
                sender_roles.add(sender_role)

        if (
            unread_messages_count == 0
            or unread_conversations_count == 0
            or first_unread_message_at is None
            or last_unread_message_at is None
        ):
            return None

        return ChatUnreadSummary(
            first_unread_message_at=first_unread_message_at,
            last_unread_message_at=last_unread_message_at,
            unread_messages_count=unread_messages_count,
            unread_conversations_count=unread_conversations_count,
            counterpart_titles=counterpart_titles,
            sender_roles=sender_roles,
        )

    def _resolve_counterpart_identity(
        self,
        *,
        conversation: ChatConversation,
        scope: ChatReminderScope,
    ) -> tuple[str | None, str | None]:
        if scope.profile_role == UserRole.EMPLOYER.value:
            counterpart_user = self.chat_repo.get_user(str(conversation.applicant_user_id))
            counterpart_profile = self.chat_repo.get_applicant_profile(str(conversation.applicant_user_id))
            title = (
                counterpart_profile.full_name
                if counterpart_profile and counterpart_profile.full_name
                else counterpart_user.display_name if counterpart_user else None
            )
            return title, UserRole.APPLICANT.value

        counterpart_user = self.chat_repo.get_user(str(conversation.employer_user_id))
        counterpart_employer = self.chat_repo.get_employer(str(conversation.employer_id)) if conversation.employer_id else None
        if counterpart_employer is not None:
            return counterpart_employer.display_name, UserRole.EMPLOYER.value
        return counterpart_user.display_name if counterpart_user else None, UserRole.EMPLOYER.value

    def _deliver_reminder(
        self,
        *,
        user: User,
        scope: ChatReminderScope,
        summary: ChatUnreadSummary,
        current_time: datetime,
    ) -> None:
        preferences = self.user_repo.get_notification_preferences(user.id)
        if preferences is None:
            preferences = self.user_repo.create_notification_preferences(user.id)
            self.notification_service.db.flush()

        title, message = self._build_notification_text(scope=scope, summary=summary)
        action_url = "/employer/chat" if scope.profile_role == UserRole.EMPLOYER.value else "/networking"
        profile_scope = {"profile_role": scope.profile_role}
        if scope.employer_id:
            profile_scope["employer_id"] = scope.employer_id

        payload = {
            "category": "chat_unread_reminder",
            "scope_key": scope.scope_key,
            "unread_messages_count": summary.unread_messages_count,
            "unread_conversations_count": summary.unread_conversations_count,
            "last_unread_message_at": summary.last_unread_message_at.isoformat(),
        }

        if preferences.push_chat_reminders:
            self.notification_service.create_notification(
                user_id=user.id,
                kind=NotificationKind.CHAT,
                severity=NotificationSeverity.INFO,
                title=title,
                message=message,
                action_label="Открыть чат",
                action_url=action_url,
                payload=payload,
                created_at=current_time,
                profile_scope=profile_scope,
            )

        if preferences.email_chat_reminders:
            subject, body = self._build_email_text(scope=scope, summary=summary, action_url=action_url)
            send_email(user.email, subject, body)

    def _build_notification_text(self, *, scope: ChatReminderScope, summary: ChatUnreadSummary) -> tuple[str, str]:
        if len(summary.counterpart_titles) == 1 and len(summary.sender_roles) == 1:
            counterpart_title = summary.counterpart_titles[0]
            sender_role = next(iter(summary.sender_roles))
            if sender_role == UserRole.APPLICANT.value:
                return "Вам написал соискатель", f"{counterpart_title} ждет вашего ответа в чате Трамплина."
            if sender_role == UserRole.EMPLOYER.value:
                return "Вам написал работодатель", f"{counterpart_title} ждет вашего ответа в чате Трамплина."

        if summary.sender_roles == {UserRole.APPLICANT.value}:
            title = "Вам написали несколько соискателей"
        elif summary.sender_roles == {UserRole.EMPLOYER.value}:
            title = "Вам написали несколько работодателей"
        else:
            title = "У вас непрочитанные сообщения"

        message = (
            f"У вас {summary.unread_messages_count} непрочитанных сообщений "
            f"в {summary.unread_conversations_count} чатах."
        )
        return title, message

    def _build_email_text(
        self,
        *,
        scope: ChatReminderScope,
        summary: ChatUnreadSummary,
        action_url: str,
    ) -> tuple[str, str]:
        title, message = self._build_notification_text(scope=scope, summary=summary)
        full_action_url = f"{settings.frontend_base_url.rstrip('/')}{action_url}"
        subject = "У вас непрочитанные сообщения в Трамплине"
        body = "\n".join(
            [
                title,
                "",
                message,
                "",
                f"Перейдите в чат: {full_action_url}",
            ]
        )
        return subject, body


class ChatReminderWorker:
    def __init__(self) -> None:
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if not settings.chat_reminder_worker_enabled or self._thread is not None:
            return

        self._thread = threading.Thread(
            target=self._run,
            name="chat-reminder-worker",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None

    def _run(self) -> None:
        while not self._stop_event.is_set():
            db = SessionLocal()
            try:
                processed_count = ChatReminderService(db).process_due_reminders()
                if processed_count:
                    logger.info("chat_reminder_worker.processed count=%s", processed_count)
            except Exception:
                logger.exception("chat_reminder_worker.failed")
                db.rollback()
            finally:
                db.close()

            self._stop_event.wait(settings.chat_reminder_worker_interval_seconds)
