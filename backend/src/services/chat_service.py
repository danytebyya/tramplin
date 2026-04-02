import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import anyio

from src.enums import UserRole
from src.models import ChatConversation, ChatConversationReadState, ChatMessage, EmployerMembership, User
from src.realtime.chat_hub import chat_hub
from src.realtime.presence_hub import presence_hub
from src.repositories.chat_repository import ChatRepository
from src.schemas.chat import (
    ChatContactListResponse,
    ChatContactRead,
    ChatConversationCreateRequest,
    ChatConversationCreateResponse,
    ChatConversationListResponse,
    ChatConversationRead,
    ChatMessageCreateRequest,
    ChatMessageDeleteResponse,
    ChatMessageListResponse,
    ChatMessageRead,
    ChatMessageUpdateRequest,
    ChatParticipantRead,
    ChatReadReceiptResponse,
    ChatUserKeyRead,
    ChatUserKeyUpsertRequest,
)
from src.services.chat_reminder_service import ChatReminderService
from src.utils.errors import AppError

logger = logging.getLogger(__name__)


@dataclass
class ChatScope:
    profile_role: str
    employer_id: str | None = None
    membership: EmployerMembership | None = None


class ChatService:
    def __init__(self, db) -> None:
        self.repo = ChatRepository(db)
        self.db = db

    def get_my_key(self, current_user: User) -> ChatUserKeyRead | None:
        item = self.repo.get_user_key(str(current_user.id))
        if item is None:
            return None
        return ChatUserKeyRead(
            algorithm=item.algorithm,
            public_key_jwk=item.public_key_jwk,
            private_key_jwk=item.private_key_jwk,
        )

    def upsert_my_key(self, current_user: User, payload: ChatUserKeyUpsertRequest) -> ChatUserKeyRead:
        item = self.repo.upsert_user_key(
            str(current_user.id),
            algorithm=payload.algorithm,
            public_key_jwk=payload.public_key_jwk,
            private_key_jwk=payload.private_key_jwk,
        )
        self.db.commit()
        return ChatUserKeyRead(
            algorithm=item.algorithm,
            public_key_jwk=item.public_key_jwk,
            private_key_jwk=item.private_key_jwk,
        )

    def list_contacts(self, current_user: User, *, access_payload: dict | None = None) -> ChatContactListResponse:
        self._resolve_scope(current_user=current_user, access_payload=access_payload)
        return ChatContactListResponse(items=[])

    def search_contacts(
        self,
        current_user: User,
        query_text: str,
        *,
        employer_id: str | None = None,
        access_payload: dict | None = None,
    ) -> ChatContactListResponse:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)
        normalized_query = query_text.strip()
        items: list[ChatContactRead] = []
        seen_keys: set[tuple[str, str | None]] = set()

        if scope.profile_role == UserRole.APPLICANT.value and employer_id and not normalized_query:
            for user, employer, key, membership in self.repo.list_employer_contacts_by_employer_id(employer_id):
                if not self._has_chat_permission(membership):
                    continue
                contact_key = (str(user.id), str(employer.id))
                if contact_key in seen_keys:
                    continue
                seen_keys.add(contact_key)
                conversation = self.repo.find_conversation(
                    participant_user_id=str(current_user.id),
                    counterpart_user_id=str(user.id),
                    employer_id=str(employer.id),
                )
                items.append(
                    ChatContactRead(
                        user_id=str(user.id),
                        public_id=user.public_id,
                        role=user.role.value,
                        display_name=user.display_name,
                        company_name=employer.display_name,
                        employer_id=str(employer.id),
                        public_key_jwk=key.public_key_jwk if key else None,
                        is_online=presence_hub.is_user_online(user.id),
                        last_seen_at=user.last_seen_at.isoformat() if user.last_seen_at else None,
                        has_conversation=bool(conversation and conversation.last_message_id),
                        conversation_id=str(conversation.id) if conversation and conversation.last_message_id else None,
                    )
                )

        if not normalized_query:
            return ChatContactListResponse(items=items)

        if scope.profile_role == UserRole.APPLICANT.value:
            for user, key in self.repo.search_applicant_contacts(normalized_query, exclude_user_id=str(current_user.id)):
                contact_key = (str(user.id), None)
                if contact_key in seen_keys:
                    continue
                seen_keys.add(contact_key)
                conversation = self.repo.find_conversation(
                    participant_user_id=str(current_user.id),
                    counterpart_user_id=str(user.id),
                    employer_id="",
                )
                items.append(
                    ChatContactRead(
                        user_id=str(user.id),
                        public_id=user.public_id,
                        role=user.role.value,
                        display_name=user.display_name,
                        public_key_jwk=key.public_key_jwk if key else None,
                        is_online=presence_hub.is_user_online(user.id),
                        last_seen_at=user.last_seen_at.isoformat() if user.last_seen_at else None,
                        has_conversation=bool(conversation and conversation.last_message_id),
                        conversation_id=str(conversation.id) if conversation and conversation.last_message_id else None,
                    )
                )
            return ChatContactListResponse(items=items)

        for user, key in self.repo.search_applicant_contacts(normalized_query, exclude_user_id=str(current_user.id)):
            conversation = self.repo.find_conversation(
                participant_user_id=str(current_user.id),
                counterpart_user_id=str(user.id),
                employer_id=scope.employer_id or "",
            )
            items.append(
                ChatContactRead(
                    user_id=str(user.id),
                    public_id=user.public_id,
                    role=user.role.value,
                    display_name=user.display_name,
                    employer_id=scope.employer_id,
                    public_key_jwk=key.public_key_jwk if key else None,
                    is_online=presence_hub.is_user_online(user.id),
                    last_seen_at=user.last_seen_at.isoformat() if user.last_seen_at else None,
                    has_conversation=bool(conversation and conversation.last_message_id),
                    conversation_id=str(conversation.id) if conversation and conversation.last_message_id else None,
                )
            )
        return ChatContactListResponse(items=items)

    def list_conversations(self, current_user: User, *, access_payload: dict | None = None) -> ChatConversationListResponse:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)
        rows = self.repo.list_conversations_for_user(
            str(current_user.id),
            employer_id=scope.employer_id if scope.profile_role == UserRole.EMPLOYER.value else None,
        )
        items: list[ChatConversationRead] = []
        for row in rows:
            counterpart_user_id = self._resolve_counterpart_user_id(conversation=row, current_user=current_user)
            if self.repo.get_user(counterpart_user_id) is None:
                continue
            items.append(self._map_conversation_row(scope=scope, current_user=current_user, conversation=row))
        return ChatConversationListResponse(
            items=items
        )

    def create_conversation(
        self,
        current_user: User,
        payload: ChatConversationCreateRequest,
        *,
        access_payload: dict | None = None,
    ) -> ChatConversationCreateResponse:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)
        logger.info(
            "chat.create_conversation.started user_id=%s role=%s employer_id=%s recipient_user_id=%s",
            current_user.id,
            scope.profile_role,
            scope.employer_id,
            payload.recipient_user_id,
        )

        if payload.recipient_user_id is None:
            raise AppError(code="CHAT_CONTACT_REQUIRED", message="Нужно выбрать пользователя", status_code=422)
        recipient_user, conversation_employer_id = self._resolve_recipient(
            current_user=current_user,
            recipient_user_id=payload.recipient_user_id,
            scope=scope,
            employer_id=payload.employer_id,
        )

        conversation = self.repo.find_conversation(
            participant_user_id=str(current_user.id),
            counterpart_user_id=str(recipient_user.id),
            employer_id=conversation_employer_id or "",
        )
        if conversation is None:
            conversation = self.repo.create_conversation(
                participant_user_id=str(current_user.id),
                counterpart_user_id=str(recipient_user.id),
                employer_id=conversation_employer_id,
                created_by_user_id=str(current_user.id),
            )
        self.db.commit()
        logger.info(
            "chat.create_conversation.succeeded user_id=%s conversation_id=%s recipient_user_id=%s employer_id=%s",
            current_user.id,
            conversation.id,
            recipient_user.id,
            conversation_employer_id,
        )

        return ChatConversationCreateResponse(
            conversation=self._map_conversation_row(scope=scope, current_user=current_user, conversation=conversation)
        )

    def list_messages(
        self,
        current_user: User,
        conversation_id: str,
        *,
        access_payload: dict | None = None,
    ) -> ChatMessageListResponse:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)
        conversation = self._ensure_conversation_access(conversation_id, current_user, scope)
        messages = self.repo.list_messages(conversation_id)
        return ChatMessageListResponse(
            items=[self._map_message(conversation=conversation, current_user=current_user, message=item) for item in messages]
        )

    def send_message(
        self,
        current_user: User,
        payload: ChatMessageCreateRequest,
        *,
        access_payload: dict | None = None,
    ) -> ChatMessageRead:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)
        conversation, _ = self._resolve_conversation_for_message(current_user=current_user, payload=payload, scope=scope)
        logger.info(
            "chat.send_message.started user_id=%s conversation_id=%s role=%s ciphertext_len=%s iv_len=%s salt_len=%s",
            current_user.id,
            conversation.id,
            scope.profile_role,
            len(payload.ciphertext),
            len(payload.iv),
            len(payload.salt),
        )

        sender_key = self.repo.get_user_key(str(current_user.id))
        recipient_user_id = self._resolve_counterpart_user_id(conversation=conversation, current_user=current_user)
        recipient_key = self.repo.get_user_key(recipient_user_id)

        message = self.repo.create_message(
            conversation_id=str(conversation.id),
            sender_user_id=str(current_user.id),
            sender_role=scope.profile_role,
            sender_public_key_jwk=sender_key.public_key_jwk if sender_key else None,
            recipient_public_key_jwk=recipient_key.public_key_jwk if recipient_key else None,
            ciphertext=payload.ciphertext,
            iv=payload.iv,
            salt=payload.salt,
        )
        self.repo.touch_conversation(conversation, message)
        own_read_state = self.repo.get_or_create_read_state(payload.conversation_id, str(current_user.id))
        own_read_state.last_read_message_id = message.id
        own_read_state.last_read_at = message.created_at
        self.db.add(own_read_state)
        recipient_user_id, recipient_profile_role, recipient_employer_id = self._resolve_reminder_recipient_scope(
            conversation=conversation,
            sender_user_id=str(current_user.id),
        )
        ChatReminderService(self.db).mark_incoming_message_pending(
            recipient_user_id=recipient_user_id,
            profile_role=recipient_profile_role,
            employer_id=recipient_employer_id,
            message_created_at=message.created_at,
        )
        self.db.commit()
        logger.info(
            "chat.send_message.succeeded user_id=%s conversation_id=%s message_id=%s created_at=%s",
            current_user.id,
            conversation.id,
            message.id,
            message.created_at.isoformat(),
        )

        message_read = self._map_message(conversation=conversation, current_user=current_user, message=message)
        event = {
            "type": "chat_message_created",
            "conversation_id": str(conversation.id),
            "message": message_read.model_dump(mode="json"),
        }
        self._publish_to_user(str(conversation.applicant_user_id), event)
        self._publish_to_user(str(conversation.employer_user_id), event)
        return message_read

    def update_message(
        self,
        current_user: User,
        message_id: str,
        payload: ChatMessageUpdateRequest,
        *,
        access_payload: dict | None = None,
    ) -> ChatMessageRead:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)
        message = self.repo.get_message(message_id)
        if message is None:
            raise AppError(code="CHAT_MESSAGE_NOT_FOUND", message="Сообщение не найдено", status_code=404)

        conversation = self._ensure_conversation_access(str(message.conversation_id), current_user, scope)
        if str(message.sender_user_id) != str(current_user.id):
            raise AppError(code="CHAT_MESSAGE_FORBIDDEN", message="Можно редактировать только свои сообщения", status_code=403)

        sender_key = self.repo.get_user_key(str(current_user.id))
        recipient_user_id = self._resolve_counterpart_user_id(conversation=conversation, current_user=current_user)
        recipient_key = self.repo.get_user_key(recipient_user_id)

        message = self.repo.update_message(
            message,
            sender_public_key_jwk=sender_key.public_key_jwk if sender_key else None,
            recipient_public_key_jwk=recipient_key.public_key_jwk if recipient_key else None,
            ciphertext=payload.ciphertext,
            iv=payload.iv,
            salt=payload.salt,
        )
        self.db.commit()

        message_read = self._map_message(conversation=conversation, current_user=current_user, message=message)
        event = {
            "type": "chat_message_updated",
            "conversation_id": str(conversation.id),
            "message": message_read.model_dump(mode="json"),
        }
        self._publish_to_user(str(conversation.applicant_user_id), event)
        self._publish_to_user(str(conversation.employer_user_id), event)
        return message_read

    def delete_message(
        self,
        current_user: User,
        message_id: str,
        *,
        access_payload: dict | None = None,
    ) -> ChatMessageDeleteResponse:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)
        message = self.repo.get_message(message_id)
        if message is None:
            raise AppError(code="CHAT_MESSAGE_NOT_FOUND", message="Сообщение не найдено", status_code=404)

        conversation = self._ensure_conversation_access(str(message.conversation_id), current_user, scope)
        if str(message.sender_user_id) != str(current_user.id):
            raise AppError(code="CHAT_MESSAGE_FORBIDDEN", message="Можно удалять только свои сообщения", status_code=403)

        conversation_id = str(conversation.id)
        self.repo.delete_message(message)
        latest_message = self.repo.get_latest_message_for_conversation(conversation_id)
        conversation.last_message_id = latest_message.id if latest_message else None
        conversation.last_message_at = latest_message.created_at if latest_message else None
        self.db.add(conversation)
        self.db.commit()

        event = {
            "type": "chat_message_deleted",
            "conversation_id": conversation_id,
            "message_id": message_id,
        }
        self._publish_to_user(str(conversation.applicant_user_id), event)
        self._publish_to_user(str(conversation.employer_user_id), event)
        return ChatMessageDeleteResponse(id=message_id, conversation_id=conversation_id)

    def mark_conversation_read(
        self,
        current_user: User,
        conversation_id: str,
        *,
        access_payload: dict | None = None,
    ) -> ChatReadReceiptResponse:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)
        conversation = self._ensure_conversation_access(conversation_id, current_user, scope)
        latest_message = self.repo.list_messages(conversation_id)
        read_at = latest_message[-1].created_at if latest_message else datetime.now(UTC)

        state = self.repo.get_or_create_read_state(conversation_id, str(current_user.id))
        state.last_read_message_id = conversation.last_message_id
        state.last_read_at = read_at
        self.db.add(state)
        ChatReminderService(self.db).sync_scope_read_state(
            user_id=str(current_user.id),
            profile_role=scope.profile_role,
            employer_id=scope.employer_id,
        )
        self.db.commit()

        event = {
            "type": "chat_conversation_read",
            "conversation_id": conversation_id,
            "user_id": str(current_user.id),
            "read_at": read_at.isoformat(),
        }
        self._publish_to_user(str(conversation.applicant_user_id), event)
        self._publish_to_user(str(conversation.employer_user_id), event)
        return ChatReadReceiptResponse(conversation_id=conversation_id, read_at=read_at.isoformat())

    def _resolve_scope(self, *, current_user: User, access_payload: dict | None) -> ChatScope:
        active_role = (access_payload or {}).get("active_role") or current_user.role.value
        if active_role == UserRole.APPLICANT.value and current_user.role == UserRole.APPLICANT:
            return ChatScope(profile_role=UserRole.APPLICANT.value)

        if active_role != UserRole.EMPLOYER.value:
            raise AppError(code="CHAT_FORBIDDEN", message="Чат доступен только работодателям и соискателям", status_code=403)

        active_employer_id = (access_payload or {}).get("active_employer_id")
        membership = self.repo.get_employer_membership(str(current_user.id), employer_id=active_employer_id)
        if membership is None and active_employer_id is None:
            membership = self.repo.get_employer_membership(str(current_user.id))
        if membership is None:
            raise AppError(code="CHAT_EMPLOYER_CONTEXT_REQUIRED", message="Выберите профиль компании", status_code=403)
        if not self._has_chat_permission(membership):
            raise AppError(code="CHAT_FORBIDDEN", message="У вас нет доступа к корпоративному чату", status_code=403)

        return ChatScope(
            profile_role=UserRole.EMPLOYER.value,
            employer_id=str(membership.employer_id),
            membership=membership,
        )

    @staticmethod
    def _has_chat_permission(membership: EmployerMembership) -> bool:
        permissions = membership.permissions or []
        return membership.is_primary or "access_chat" in permissions

    def _ensure_conversation_access(self, conversation_id: str, current_user: User, scope: ChatScope) -> ChatConversation:
        conversation = self.repo.get_conversation(conversation_id)
        if conversation is None:
            raise AppError(code="CHAT_CONVERSATION_NOT_FOUND", message="Диалог не найден", status_code=404)

        participant_ids = {str(conversation.applicant_user_id), str(conversation.employer_user_id)}
        if str(current_user.id) not in participant_ids:
            raise AppError(code="CHAT_CONVERSATION_FORBIDDEN", message="Нет доступа к диалогу", status_code=403)
        if scope.profile_role == UserRole.EMPLOYER.value and str(conversation.employer_id or "") != str(scope.employer_id or ""):
            raise AppError(code="CHAT_CONVERSATION_FORBIDDEN", message="Нет доступа к диалогу", status_code=403)
        return conversation

    def _map_conversation_row(self, *, scope: ChatScope, current_user: User, conversation: ChatConversation) -> ChatConversationRead:
        last_message = self.repo.get_latest_message_for_conversation(str(conversation.id))
        counterpart_user_id = self._resolve_counterpart_user_id(conversation=conversation, current_user=current_user)
        counterpart_user = self.repo.get_user(counterpart_user_id)
        if counterpart_user is None:
            raise AppError(code="CHAT_CONTACT_NOT_FOUND", message="Пользователь не найден", status_code=404)
        counterpart_profile = self.repo.get_applicant_profile(counterpart_user_id)
        counterpart_key = self.repo.get_user_key(counterpart_user_id)
        counterpart_employer = self.repo.get_employer(str(conversation.employer_id)) if conversation.employer_id else None
        own_read_state = self.repo.get_read_state(str(conversation.id), str(current_user.id))

        display_name = (
            counterpart_profile.full_name
            if counterpart_profile and counterpart_profile.full_name and counterpart_user.role == UserRole.APPLICANT
            else counterpart_user.display_name
        )
        counterpart = ChatParticipantRead(
            user_id=str(counterpart_user.id),
            public_id=counterpart_user.public_id,
            display_name=display_name,
            role=counterpart_user.role.value,
            company_name=counterpart_employer.display_name if counterpart_user.role == UserRole.EMPLOYER and counterpart_employer else None,
            company_id=str(counterpart_employer.id) if counterpart_user.role == UserRole.EMPLOYER and counterpart_employer else None,
            public_key_jwk=counterpart_key.public_key_jwk if counterpart_key else None,
            is_online=presence_hub.is_user_online(counterpart_user.id),
            last_seen_at=counterpart_user.last_seen_at.isoformat() if counterpart_user.last_seen_at else None,
        )

        messages = self.repo.list_messages(str(conversation.id))
        unread_count = len(messages) if own_read_state is None or own_read_state.last_read_at is None else sum(
            1 for item in messages if item.created_at > own_read_state.last_read_at
        )
        return ChatConversationRead(
            id=str(conversation.id),
            updated_at=(conversation.last_message_at or conversation.created_at).isoformat(),
            unread_count=unread_count,
            counterpart=counterpart,
            last_message=self._map_message(conversation=conversation, current_user=current_user, message=last_message) if last_message else None,
        )

    def _map_message(self, *, conversation: ChatConversation, current_user: User, message: ChatMessage) -> ChatMessageRead:
        counterpart_user_id = (
            str(conversation.employer_user_id)
            if str(current_user.id) == str(conversation.applicant_user_id)
            else str(conversation.applicant_user_id)
        )
        counterpart_read_state = self.repo.get_read_state(str(conversation.id), counterpart_user_id)
        is_read_by_peer = bool(counterpart_read_state and counterpart_read_state.last_read_at and counterpart_read_state.last_read_at >= message.created_at)
        return ChatMessageRead(
            id=str(message.id),
            conversation_id=str(conversation.id),
            sender_user_id=str(message.sender_user_id),
            sender_role=message.sender_role.value if hasattr(message.sender_role, "value") else str(message.sender_role),
            sender_public_key_jwk=message.sender_public_key_jwk,
            recipient_public_key_jwk=message.recipient_public_key_jwk,
            ciphertext=message.ciphertext,
            iv=message.iv,
            salt=message.salt,
            created_at=message.created_at.isoformat(),
            is_own=str(message.sender_user_id) == str(current_user.id),
            is_read_by_peer=is_read_by_peer,
        )

    def _load_conversation_row(self, *, conversation_id: str, current_user: User, scope: ChatScope) -> tuple:
        rows = self.repo.list_conversations_for_user(
            str(current_user.id),
            employer_id=scope.employer_id if scope.profile_role == UserRole.EMPLOYER.value else None,
        )
        for row in rows:
            if str(row.id) == conversation_id:
                return row
        raise AppError(code="CHAT_CONVERSATION_NOT_FOUND", message="Диалог не найден", status_code=404)

    @staticmethod
    def _resolve_counterpart_user_id(*, conversation: ChatConversation, current_user: User) -> str:
        return (
            str(conversation.employer_user_id)
            if str(current_user.id) == str(conversation.applicant_user_id)
            else str(conversation.applicant_user_id)
        )

    def _resolve_recipient(
        self,
        *,
        current_user: User,
        recipient_user_id: str,
        scope: ChatScope,
        employer_id: str | None,
    ) -> tuple[User, str | None]:
        recipient_user = self.repo.get_user(recipient_user_id)
        if recipient_user is None:
            raise AppError(code="CHAT_CONTACT_NOT_FOUND", message="Пользователь не найден", status_code=404)
        if str(recipient_user.id) == str(current_user.id):
            raise AppError(code="CHAT_CONTACT_FORBIDDEN", message="Нельзя писать самому себе", status_code=403)

        if scope.profile_role == UserRole.EMPLOYER.value:
            if recipient_user.role != UserRole.APPLICANT:
                raise AppError(code="CHAT_CONTACT_FORBIDDEN", message="Работодатель может писать только соискателям", status_code=403)
            return recipient_user, scope.employer_id

        if recipient_user.role == UserRole.APPLICANT:
            return recipient_user, None

        if recipient_user.role != UserRole.EMPLOYER or not employer_id:
            raise AppError(code="CHAT_CONTACT_FORBIDDEN", message="Нельзя начать этот диалог", status_code=403)
        membership = self.repo.get_employer_membership(str(recipient_user.id), employer_id)
        if membership is None or not self._has_chat_permission(membership):
            raise AppError(code="CHAT_CONTACT_FORBIDDEN", message="У выбранного работодателя нет доступа к чату", status_code=403)
        return recipient_user, employer_id

    def _resolve_conversation_for_message(
        self,
        *,
        current_user: User,
        payload: ChatMessageCreateRequest,
        scope: ChatScope,
    ) -> tuple[ChatConversation, bool]:
        if payload.conversation_id:
            return self._ensure_conversation_access(payload.conversation_id, current_user, scope), False

        if payload.recipient_user_id is None:
            raise AppError(code="CHAT_CONTACT_REQUIRED", message="Нужно выбрать пользователя", status_code=422)
        recipient_user, employer_id = self._resolve_recipient(
            current_user=current_user,
            recipient_user_id=payload.recipient_user_id,
            scope=scope,
            employer_id=payload.employer_id,
        )
        conversation = self.repo.find_conversation(
            participant_user_id=str(current_user.id),
            counterpart_user_id=str(recipient_user.id),
            employer_id=employer_id or "",
        )
        if conversation is None:
            conversation = self.repo.create_conversation(
                participant_user_id=str(current_user.id),
                counterpart_user_id=str(recipient_user.id),
                employer_id=employer_id,
                created_by_user_id=str(current_user.id),
            )
        return conversation, True

    @staticmethod
    def _resolve_reminder_recipient_scope(
        *,
        conversation: ChatConversation,
        sender_user_id: str,
    ) -> tuple[str, str, str | None]:
        if str(conversation.applicant_user_id) == sender_user_id:
            return (
                str(conversation.employer_user_id),
                UserRole.EMPLOYER.value,
                str(conversation.employer_id) if conversation.employer_id else None,
            )

        return (
            str(conversation.applicant_user_id),
            UserRole.APPLICANT.value,
            None,
        )

    @staticmethod
    def _publish_to_user(user_id: str, payload: dict) -> None:
        try:
            anyio.from_thread.run(chat_hub.publish_to_user, user_id, payload)
            return
        except RuntimeError:
            pass

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(chat_hub.publish_to_user(user_id, payload))
