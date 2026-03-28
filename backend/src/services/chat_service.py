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
    ChatMessageListResponse,
    ChatMessageRead,
    ChatParticipantRead,
    ChatReadReceiptResponse,
    ChatUserKeyRead,
    ChatUserKeyUpsertRequest,
)
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
        return ChatUserKeyRead(algorithm=item.algorithm, public_key_jwk=item.public_key_jwk)

    def upsert_my_key(self, current_user: User, payload: ChatUserKeyUpsertRequest) -> ChatUserKeyRead:
        item = self.repo.upsert_user_key(
            str(current_user.id),
            algorithm=payload.algorithm,
            public_key_jwk=payload.public_key_jwk,
        )
        self.db.commit()
        return ChatUserKeyRead(algorithm=item.algorithm, public_key_jwk=item.public_key_jwk)

    def list_contacts(self, current_user: User, *, access_payload: dict | None = None) -> ChatContactListResponse:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)

        if scope.profile_role == UserRole.APPLICANT.value:
            items: list[ChatContactRead] = []
            for user, employer, key, conversation in self.repo.list_applicant_contacts(str(current_user.id)):
                membership = self.repo.get_employer_membership(str(user.id), str(employer.id))
                if membership is None or not self._has_chat_permission(membership):
                    continue
                items.append(
                    ChatContactRead(
                        user_id=str(user.id),
                        role=user.role.value,
                        display_name=user.display_name,
                        company_name=employer.display_name,
                        employer_id=str(employer.id),
                        public_key_jwk=key.public_key_jwk if key else None,
                        is_online=presence_hub.is_user_online(user.id),
                        last_seen_at=user.last_seen_at.isoformat() if user.last_seen_at else None,
                        has_conversation=conversation is not None,
                        conversation_id=str(conversation.id) if conversation else None,
                    )
                )
            return ChatContactListResponse(items=items)

        items = [
            ChatContactRead(
                user_id=str(user.id),
                role=user.role.value,
                display_name=profile.full_name if profile and profile.full_name else user.display_name,
                employer_id=scope.employer_id,
                public_key_jwk=key.public_key_jwk if key else None,
                is_online=presence_hub.is_user_online(user.id),
                last_seen_at=user.last_seen_at.isoformat() if user.last_seen_at else None,
                has_conversation=conversation is not None,
                conversation_id=str(conversation.id) if conversation else None,
            )
            for user, profile, key, conversation in self.repo.list_employer_contacts(
                str(current_user.id),
                scope.employer_id or "",
            )
        ]
        return ChatContactListResponse(items=items)

    def list_conversations(self, current_user: User, *, access_payload: dict | None = None) -> ChatConversationListResponse:
        scope = self._resolve_scope(current_user=current_user, access_payload=access_payload)
        if scope.profile_role == UserRole.APPLICANT.value:
            rows = self.repo.list_conversations_for_applicant(str(current_user.id))
        else:
            rows = self.repo.list_conversations_for_employer(str(current_user.id), scope.employer_id or "")
        return ChatConversationListResponse(
            items=[self._map_conversation_row(scope=scope, current_user=current_user, row=row) for row in rows]
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
            "chat.create_conversation.started user_id=%s role=%s employer_id=%s applicant_user_id=%s employer_user_id=%s",
            current_user.id,
            scope.profile_role,
            scope.employer_id,
            payload.applicant_user_id,
            payload.employer_user_id,
        )

        if scope.profile_role == UserRole.APPLICANT.value:
            if payload.employer_user_id is None or payload.employer_id is None:
                raise AppError(code="CHAT_CONTACT_REQUIRED", message="Нужно выбрать работодателя", status_code=422)
            employer_user = self.repo.get_user(payload.employer_user_id)
            if employer_user is None or employer_user.role != UserRole.EMPLOYER:
                raise AppError(code="CHAT_CONTACT_NOT_FOUND", message="Работодатель не найден", status_code=404)
            membership = self.repo.get_employer_membership(payload.employer_user_id, payload.employer_id)
            if membership is None or not self._has_chat_permission(membership):
                raise AppError(
                    code="CHAT_CONTACT_FORBIDDEN",
                    message="У выбранного работодателя нет доступа к чату",
                    status_code=403,
                )
            applicant_user_id = str(current_user.id)
            employer_user_id = payload.employer_user_id
            employer_id = payload.employer_id
        else:
            if payload.applicant_user_id is None:
                raise AppError(code="CHAT_CONTACT_REQUIRED", message="Нужно выбрать соискателя", status_code=422)
            applicant_user = self.repo.get_user(payload.applicant_user_id)
            if applicant_user is None or applicant_user.role != UserRole.APPLICANT:
                raise AppError(code="CHAT_CONTACT_NOT_FOUND", message="Соискатель не найден", status_code=404)
            applicant_user_id = payload.applicant_user_id
            employer_user_id = str(current_user.id)
            employer_id = scope.employer_id or ""

        conversation = self.repo.find_conversation(
            applicant_user_id=applicant_user_id,
            employer_user_id=employer_user_id,
            employer_id=employer_id,
        )
        if conversation is None:
            conversation = self.repo.create_conversation(
                applicant_user_id=applicant_user_id,
                employer_user_id=employer_user_id,
                employer_id=employer_id,
                created_by_user_id=str(current_user.id),
            )
        self.db.commit()
        logger.info(
            "chat.create_conversation.succeeded user_id=%s conversation_id=%s applicant_user_id=%s employer_user_id=%s employer_id=%s",
            current_user.id,
            conversation.id,
            applicant_user_id,
            employer_user_id,
            employer_id,
        )

        row = self._load_conversation_row(conversation_id=str(conversation.id), current_user=current_user, scope=scope)
        return ChatConversationCreateResponse(
            conversation=self._map_conversation_row(scope=scope, current_user=current_user, row=row)
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
        conversation = self._ensure_conversation_access(payload.conversation_id, current_user, scope)
        logger.info(
            "chat.send_message.started user_id=%s conversation_id=%s role=%s ciphertext_len=%s iv_len=%s salt_len=%s",
            current_user.id,
            payload.conversation_id,
            scope.profile_role,
            len(payload.ciphertext),
            len(payload.iv),
            len(payload.salt),
        )

        message = self.repo.create_message(
            conversation_id=payload.conversation_id,
            sender_user_id=str(current_user.id),
            sender_role=scope.profile_role,
            ciphertext=payload.ciphertext,
            iv=payload.iv,
            salt=payload.salt,
        )
        self.repo.touch_conversation(conversation, message)
        own_read_state = self.repo.get_or_create_read_state(payload.conversation_id, str(current_user.id))
        own_read_state.last_read_message_id = message.id
        own_read_state.last_read_at = message.created_at
        self.db.add(own_read_state)
        self.db.commit()
        logger.info(
            "chat.send_message.succeeded user_id=%s conversation_id=%s message_id=%s created_at=%s",
            current_user.id,
            payload.conversation_id,
            message.id,
            message.created_at.isoformat(),
        )

        message_read = self._map_message(conversation=conversation, current_user=current_user, message=message)
        event = {
            "type": "chat_message_created",
            "conversation_id": payload.conversation_id,
            "message": message_read.model_dump(mode="json"),
        }
        self._publish_to_user(str(conversation.applicant_user_id), event)
        self._publish_to_user(str(conversation.employer_user_id), event)
        return message_read

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

        if scope.profile_role == UserRole.APPLICANT.value:
            if str(conversation.applicant_user_id) != str(current_user.id):
                raise AppError(code="CHAT_CONVERSATION_FORBIDDEN", message="Нет доступа к диалогу", status_code=403)
            return conversation

        if str(conversation.employer_user_id) != str(current_user.id) or str(conversation.employer_id) != str(scope.employer_id):
            raise AppError(code="CHAT_CONVERSATION_FORBIDDEN", message="Нет доступа к диалогу", status_code=403)
        return conversation

    def _map_conversation_row(self, *, scope: ChatScope, current_user: User, row: tuple) -> ChatConversationRead:
        conversation = row[0]
        last_message = row[4]
        own_read_state = row[5] if scope.profile_role == UserRole.APPLICANT.value else row[6]

        if scope.profile_role == UserRole.APPLICANT.value:
            employer_user = row[1]
            employer = row[2]
            key = row[3]
            counterpart = ChatParticipantRead(
                user_id=str(employer_user.id),
                display_name=employer_user.display_name,
                role=employer_user.role.value,
                company_name=employer.display_name,
                company_id=str(employer.id),
                public_key_jwk=key.public_key_jwk if key else None,
                is_online=presence_hub.is_user_online(employer_user.id),
                last_seen_at=employer_user.last_seen_at.isoformat() if employer_user.last_seen_at else None,
            )
        else:
            applicant_user = row[1]
            applicant_profile = row[2]
            key = row[3]
            counterpart = ChatParticipantRead(
                user_id=str(applicant_user.id),
                display_name=applicant_profile.full_name if applicant_profile and applicant_profile.full_name else applicant_user.display_name,
                role=applicant_user.role.value,
                public_key_jwk=key.public_key_jwk if key else None,
                is_online=presence_hub.is_user_online(applicant_user.id),
                last_seen_at=applicant_user.last_seen_at.isoformat() if applicant_user.last_seen_at else None,
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
            ciphertext=message.ciphertext,
            iv=message.iv,
            salt=message.salt,
            created_at=message.created_at.isoformat(),
            is_own=str(message.sender_user_id) == str(current_user.id),
            is_read_by_peer=is_read_by_peer,
        )

    def _load_conversation_row(self, *, conversation_id: str, current_user: User, scope: ChatScope) -> tuple:
        rows = (
            self.repo.list_conversations_for_applicant(str(current_user.id))
            if scope.profile_role == UserRole.APPLICANT.value
            else self.repo.list_conversations_for_employer(str(current_user.id), scope.employer_id or "")
        )
        for row in rows:
            if str(row[0].id) == conversation_id:
                return row
        raise AppError(code="CHAT_CONVERSATION_NOT_FOUND", message="Диалог не найден", status_code=404)

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
