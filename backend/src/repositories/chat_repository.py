from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, and_, func, select
from sqlalchemy.orm import Session, aliased

from src.models import (
    ApplicantProfile,
    ChatConversation,
    ChatConversationReadState,
    ChatMessage,
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

    def upsert_user_key(self, user_id: str, *, algorithm: str, public_key_jwk: dict) -> ChatUserKey:
        item = self.get_user_key(user_id)
        if item is None:
            item = ChatUserKey(user_id=UUID(str(user_id)), algorithm=algorithm, public_key_jwk=public_key_jwk)
            self.db.add(item)
        else:
            item.algorithm = algorithm
            item.public_key_jwk = public_key_jwk
        self.db.flush()
        return item

    def list_conversations_for_applicant(self, applicant_user_id: str) -> Sequence[tuple]:
        employer_user = aliased(User)
        employer_key = aliased(ChatUserKey)
        employer_entity = aliased(Employer)
        last_message = aliased(ChatMessage)
        applicant_read_state = aliased(ChatConversationReadState)
        employer_read_state = aliased(ChatConversationReadState)

        query: Select = (
            select(
                ChatConversation,
                employer_user,
                employer_entity,
                employer_key,
                last_message,
                applicant_read_state,
                employer_read_state,
            )
            .join(employer_user, employer_user.id == ChatConversation.employer_user_id)
            .join(employer_entity, employer_entity.id == ChatConversation.employer_id)
            .outerjoin(employer_key, employer_key.user_id == employer_user.id)
            .outerjoin(last_message, last_message.id == ChatConversation.last_message_id)
            .outerjoin(
                applicant_read_state,
                and_(
                    applicant_read_state.conversation_id == ChatConversation.id,
                    applicant_read_state.user_id == UUID(str(applicant_user_id)),
                ),
            )
            .outerjoin(
                employer_read_state,
                and_(
                    employer_read_state.conversation_id == ChatConversation.id,
                    employer_read_state.user_id == ChatConversation.employer_user_id,
                ),
            )
            .where(ChatConversation.applicant_user_id == UUID(str(applicant_user_id)))
            .order_by(ChatConversation.last_message_at.desc().nullslast(), ChatConversation.created_at.desc())
        )
        return self.db.execute(query).all()

    def list_conversations_for_employer(self, employer_user_id: str, employer_id: str) -> Sequence[tuple]:
        applicant_user = aliased(User)
        applicant_profile = aliased(ApplicantProfile)
        applicant_key = aliased(ChatUserKey)
        last_message = aliased(ChatMessage)
        applicant_read_state = aliased(ChatConversationReadState)
        employer_read_state = aliased(ChatConversationReadState)

        query: Select = (
            select(
                ChatConversation,
                applicant_user,
                applicant_profile,
                applicant_key,
                last_message,
                applicant_read_state,
                employer_read_state,
            )
            .join(applicant_user, applicant_user.id == ChatConversation.applicant_user_id)
            .outerjoin(applicant_profile, applicant_profile.user_id == applicant_user.id)
            .outerjoin(applicant_key, applicant_key.user_id == applicant_user.id)
            .outerjoin(last_message, last_message.id == ChatConversation.last_message_id)
            .outerjoin(
                applicant_read_state,
                and_(
                    applicant_read_state.conversation_id == ChatConversation.id,
                    applicant_read_state.user_id == ChatConversation.applicant_user_id,
                ),
            )
            .outerjoin(
                employer_read_state,
                and_(
                    employer_read_state.conversation_id == ChatConversation.id,
                    employer_read_state.user_id == UUID(str(employer_user_id)),
                ),
            )
            .where(
                ChatConversation.employer_user_id == UUID(str(employer_user_id)),
                ChatConversation.employer_id == UUID(str(employer_id)),
            )
            .order_by(ChatConversation.last_message_at.desc().nullslast(), ChatConversation.created_at.desc())
        )
        return self.db.execute(query).all()

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
        applicant_user_id: str,
        employer_user_id: str,
        employer_id: str,
    ) -> ChatConversation | None:
        query = select(ChatConversation).where(
            ChatConversation.applicant_user_id == UUID(str(applicant_user_id)),
            ChatConversation.employer_user_id == UUID(str(employer_user_id)),
            ChatConversation.employer_id == UUID(str(employer_id)),
        )
        return self.db.execute(query).scalar_one_or_none()

    def create_conversation(
        self,
        *,
        applicant_user_id: str,
        employer_user_id: str,
        employer_id: str,
        created_by_user_id: str,
    ) -> ChatConversation:
        item = ChatConversation(
            applicant_user_id=UUID(str(applicant_user_id)),
            employer_user_id=UUID(str(employer_user_id)),
            employer_id=UUID(str(employer_id)),
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

    def list_applicant_contacts(self, applicant_user_id: str) -> Sequence[tuple]:
        employer_user = aliased(User)
        employer_key = aliased(ChatUserKey)
        existing_conversation = aliased(ChatConversation)

        query = (
            select(
                employer_user,
                Employer,
                employer_key,
                existing_conversation,
            )
            .join(EmployerMembership, EmployerMembership.user_id == employer_user.id)
            .join(Employer, Employer.id == EmployerMembership.employer_id)
            .outerjoin(employer_key, employer_key.user_id == employer_user.id)
            .outerjoin(
                existing_conversation,
                and_(
                    existing_conversation.employer_user_id == employer_user.id,
                    existing_conversation.employer_id == Employer.id,
                    existing_conversation.applicant_user_id == UUID(str(applicant_user_id)),
                ),
            )
            .where(employer_user.role == "employer")
            .order_by(Employer.display_name.asc(), employer_user.display_name.asc())
        )
        return self.db.execute(query).all()

    def list_employer_contacts(self, employer_user_id: str, employer_id: str) -> Sequence[tuple]:
        applicant_user = aliased(User)
        applicant_profile = aliased(ApplicantProfile)
        applicant_key = aliased(ChatUserKey)
        existing_conversation = aliased(ChatConversation)

        query = (
            select(
                applicant_user,
                applicant_profile,
                applicant_key,
                existing_conversation,
            )
            .outerjoin(applicant_profile, applicant_profile.user_id == applicant_user.id)
            .outerjoin(applicant_key, applicant_key.user_id == applicant_user.id)
            .outerjoin(
                existing_conversation,
                and_(
                    existing_conversation.applicant_user_id == applicant_user.id,
                    existing_conversation.employer_user_id == UUID(str(employer_user_id)),
                    existing_conversation.employer_id == UUID(str(employer_id)),
                ),
            )
            .where(applicant_user.role == "applicant")
            .order_by(
                func.coalesce(applicant_profile.full_name, applicant_user.display_name).asc(),
                applicant_user.created_at.desc(),
            )
        )
        return self.db.execute(query).all()

    def get_user(self, user_id: str) -> User | None:
        return self.db.get(User, UUID(str(user_id)))

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
