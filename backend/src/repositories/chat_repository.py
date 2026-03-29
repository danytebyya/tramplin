from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, String, and_, func, or_, select
from sqlalchemy.orm import Session, aliased

from src.models import (
    ApplicantProfile,
    ChatConversation,
    ChatConversationReadState,
    ChatMessage,
    ChatUnreadReminderState,
    ChatUserKey,
    Employer,
    EmployerMembership,
    User,
)


class ChatRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_user_key(self, user_id: str) -> ChatUserKey | None:
        return self.db.get(ChatUserKey, UUID(str(user_id)))

    def upsert_user_key(
        self,
        user_id: str,
        *,
        algorithm: str,
        public_key_jwk: dict,
        private_key_jwk: dict | None,
    ) -> ChatUserKey:
        item = self.get_user_key(user_id)
        if item is None:
            item = ChatUserKey(
                user_id=UUID(str(user_id)),
                algorithm=algorithm,
                public_key_jwk=public_key_jwk,
                private_key_jwk=private_key_jwk,
            )
            self.db.add(item)
        else:
            item.algorithm = algorithm
            item.public_key_jwk = public_key_jwk
            item.private_key_jwk = private_key_jwk
        self.db.flush()
        return item

    @staticmethod
    def _normalize_participants(left_user_id: str, right_user_id: str) -> tuple[str, str]:
        normalized_ids = sorted([str(left_user_id), str(right_user_id)])
        return normalized_ids[0], normalized_ids[1]

    def list_conversations_for_user(self, user_id: str, *, employer_id: str | None = None) -> Sequence[ChatConversation]:
        query: Select = (
            select(ChatConversation)
            .where(
                or_(
                    ChatConversation.applicant_user_id == UUID(str(user_id)),
                    ChatConversation.employer_user_id == UUID(str(user_id)),
                ),
                ChatConversation.last_message_id.is_not(None),
            )
            .order_by(ChatConversation.last_message_at.desc().nullslast(), ChatConversation.created_at.desc())
        )
        if employer_id is not None:
            query = query.where(ChatConversation.employer_id == UUID(str(employer_id)))
        return self.db.execute(query).scalars().all()

    def list_conversations_for_scope(
        self,
        user_id: str,
        *,
        profile_role: str,
        employer_id: str | None = None,
    ) -> Sequence[ChatConversation]:
        if profile_role == "employer":
            query: Select = select(ChatConversation).where(
                ChatConversation.employer_user_id == UUID(str(user_id)),
                ChatConversation.last_message_id.is_not(None),
            )
            if employer_id is not None:
                query = query.where(ChatConversation.employer_id == UUID(str(employer_id)))
            return self.db.execute(
                query.order_by(ChatConversation.last_message_at.desc().nullslast(), ChatConversation.created_at.desc())
            ).scalars().all()

        query = (
            select(ChatConversation)
            .where(
                ChatConversation.applicant_user_id == UUID(str(user_id)),
                ChatConversation.last_message_id.is_not(None),
            )
            .order_by(ChatConversation.last_message_at.desc().nullslast(), ChatConversation.created_at.desc())
        )
        return self.db.execute(query).scalars().all()

    def list_messages(self, conversation_id: str) -> Sequence[ChatMessage]:
        query = (
            select(ChatMessage)
            .where(ChatMessage.conversation_id == UUID(str(conversation_id)))
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        )
        return self.db.execute(query).scalars().all()

    def get_conversation(self, conversation_id: str) -> ChatConversation | None:
        return self.db.get(ChatConversation, UUID(str(conversation_id)))

    def find_conversation(
        self,
        *,
        participant_user_id: str,
        counterpart_user_id: str,
        employer_id: str,
    ) -> ChatConversation | None:
        applicant_user_id, employer_user_id = self._normalize_participants(participant_user_id, counterpart_user_id)
        query = select(ChatConversation).where(
            ChatConversation.applicant_user_id == UUID(str(applicant_user_id)),
            ChatConversation.employer_user_id == UUID(str(employer_user_id)),
        )
        if employer_id:
            query = query.where(ChatConversation.employer_id == UUID(str(employer_id)))
        else:
            query = query.where(ChatConversation.employer_id.is_(None))
        return self.db.execute(query).scalar_one_or_none()

    def create_conversation(
        self,
        *,
        participant_user_id: str,
        counterpart_user_id: str,
        employer_id: str | None,
        created_by_user_id: str,
    ) -> ChatConversation:
        applicant_user_id, employer_user_id = self._normalize_participants(participant_user_id, counterpart_user_id)
        item = ChatConversation(
            applicant_user_id=UUID(str(applicant_user_id)),
            employer_user_id=UUID(str(employer_user_id)),
            employer_id=UUID(str(employer_id)) if employer_id else None,
            created_by_user_id=UUID(str(created_by_user_id)),
        )
        self.db.add(item)
        self.db.flush()
        return item

    def create_message(
        self,
        *,
        conversation_id: str,
        sender_user_id: str,
        sender_role: str,
        ciphertext: str,
        iv: str,
        salt: str,
    ) -> ChatMessage:
        item = ChatMessage(
            conversation_id=UUID(str(conversation_id)),
            sender_user_id=UUID(str(sender_user_id)),
            sender_role=sender_role,
            ciphertext=ciphertext,
            iv=iv,
            salt=salt,
            created_at=datetime.now(UTC),
        )
        self.db.add(item)
        self.db.flush()
        return item

    def get_message(self, message_id: str) -> ChatMessage | None:
        return self.db.get(ChatMessage, UUID(str(message_id)))

    def update_message(self, message: ChatMessage, *, ciphertext: str, iv: str, salt: str) -> ChatMessage:
        message.ciphertext = ciphertext
        message.iv = iv
        message.salt = salt
        self.db.add(message)
        self.db.flush()
        return message

    def delete_message(self, message: ChatMessage) -> None:
        self.db.delete(message)
        self.db.flush()

    def get_latest_message_for_conversation(self, conversation_id: str) -> ChatMessage | None:
        query = (
            select(ChatMessage)
            .where(ChatMessage.conversation_id == UUID(str(conversation_id)))
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(1)
        )
        return self.db.execute(query).scalar_one_or_none()

    def touch_conversation(self, conversation: ChatConversation, message: ChatMessage) -> None:
        conversation.last_message_id = message.id
        conversation.last_message_at = message.created_at
        self.db.add(conversation)
        self.db.flush()

    def get_read_state(self, conversation_id: str, user_id: str) -> ChatConversationReadState | None:
        query = select(ChatConversationReadState).where(
            ChatConversationReadState.conversation_id == UUID(str(conversation_id)),
            ChatConversationReadState.user_id == UUID(str(user_id)),
        )
        return self.db.execute(query).scalar_one_or_none()

    def get_or_create_read_state(self, conversation_id: str, user_id: str) -> ChatConversationReadState:
        item = self.get_read_state(conversation_id, user_id)
        if item is None:
            item = ChatConversationReadState(
                conversation_id=UUID(str(conversation_id)),
                user_id=UUID(str(user_id)),
            )
            self.db.add(item)
            self.db.flush()
        return item

    def search_applicant_contacts(self, query_text: str, *, exclude_user_id: str) -> Sequence[tuple]:
        applicant_user = aliased(User)
        applicant_key = aliased(ChatUserKey)

        query = (
            select(
                applicant_user,
                applicant_key,
            )
            .outerjoin(applicant_key, applicant_key.user_id == applicant_user.id)
            .where(
                applicant_user.role == "applicant",
                applicant_user.id != UUID(str(exclude_user_id)),
                or_(
                    func.lower(func.coalesce(applicant_user.public_id, "")).contains(query_text.lower()),
                    func.lower(applicant_user.display_name).contains(query_text.lower()),
                ),
            )
            .order_by(
                applicant_user.display_name.asc(),
                applicant_user.created_at.desc(),
            )
        )
        return self.db.execute(query).all()

    def search_employer_contacts(self, query_text: str) -> Sequence[tuple]:
        employer_user = aliased(User)
        employer_key = aliased(ChatUserKey)

        query = (
            select(
                employer_user,
                Employer,
                employer_key,
                EmployerMembership,
            )
            .join(EmployerMembership, EmployerMembership.user_id == employer_user.id)
            .join(Employer, Employer.id == EmployerMembership.employer_id)
            .outerjoin(employer_key, employer_key.user_id == employer_user.id)
            .where(
                employer_user.role == "employer",
                or_(
                    func.lower(Employer.display_name).contains(query_text.lower()),
                    func.lower(employer_user.display_name).contains(query_text.lower()),
                    func.lower(employer_user.email).contains(query_text.lower()),
                ),
            )
            .order_by(Employer.display_name.asc(), EmployerMembership.is_primary.desc(), employer_user.display_name.asc())
        )
        return self.db.execute(query).all()

    def list_employer_contacts_by_employer_id(self, employer_id: str) -> Sequence[tuple]:
        employer_user = aliased(User)
        employer_key = aliased(ChatUserKey)

        query = (
            select(
                employer_user,
                Employer,
                employer_key,
                EmployerMembership,
            )
            .join(EmployerMembership, EmployerMembership.user_id == employer_user.id)
            .join(Employer, Employer.id == EmployerMembership.employer_id)
            .outerjoin(employer_key, employer_key.user_id == employer_user.id)
            .where(
                Employer.id == UUID(str(employer_id)),
                employer_user.role == "employer",
            )
            .order_by(EmployerMembership.is_primary.desc(), employer_user.display_name.asc())
        )
        return self.db.execute(query).all()

    def get_user(self, user_id: str) -> User | None:
        return self.db.get(User, UUID(str(user_id)))

    def get_applicant_profile(self, user_id: str) -> ApplicantProfile | None:
        query = select(ApplicantProfile).where(ApplicantProfile.user_id == UUID(str(user_id)))
        return self.db.execute(query).scalar_one_or_none()

    def get_employer_membership(self, user_id: str, employer_id: str | None = None) -> EmployerMembership | None:
        conditions = [EmployerMembership.user_id == UUID(str(user_id))]
        if employer_id is not None:
            conditions.append(EmployerMembership.employer_id == UUID(str(employer_id)))

        query = (
            select(EmployerMembership)
            .where(*conditions)
            .order_by(EmployerMembership.is_primary.desc(), EmployerMembership.created_at.asc())
        )
        return self.db.execute(query).scalar_one_or_none()

    def get_employer(self, employer_id: str) -> Employer | None:
        return self.db.get(Employer, UUID(str(employer_id)))

    def get_employer_for_user(self, user_id: str, employer_id: str | None = None) -> Employer | None:
        membership = self.get_employer_membership(user_id=user_id, employer_id=employer_id)
        if membership is None:
            return None
        return self.get_employer(str(membership.employer_id))

    def get_unread_reminder_state(
        self,
        *,
        user_id: str,
        scope_key: str,
    ) -> ChatUnreadReminderState | None:
        query = select(ChatUnreadReminderState).where(
            ChatUnreadReminderState.user_id == UUID(str(user_id)),
            ChatUnreadReminderState.scope_key == scope_key,
        )
        return self.db.execute(query).scalar_one_or_none()

    def get_or_create_unread_reminder_state(
        self,
        *,
        user_id: str,
        profile_role: str,
        employer_id: str | None,
        scope_key: str,
    ) -> ChatUnreadReminderState:
        item = self.get_unread_reminder_state(user_id=user_id, scope_key=scope_key)
        if item is not None:
            return item

        item = ChatUnreadReminderState(
            user_id=UUID(str(user_id)),
            profile_role=profile_role,
            employer_id=UUID(str(employer_id)) if employer_id else None,
            scope_key=scope_key,
        )
        self.db.add(item)
        self.db.flush()
        return item

    def list_due_unread_reminder_states(self, *, due_before: datetime) -> Sequence[ChatUnreadReminderState]:
        query = (
            select(ChatUnreadReminderState)
            .where(
                ChatUnreadReminderState.is_pending.is_(True),
                ChatUnreadReminderState.first_unread_message_at.is_not(None),
                ChatUnreadReminderState.first_unread_message_at <= due_before,
            )
            .order_by(ChatUnreadReminderState.first_unread_message_at.asc(), ChatUnreadReminderState.updated_at.asc())
        )
        return self.db.execute(query).scalars().all()
