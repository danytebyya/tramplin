from pydantic import BaseModel, Field, field_validator


class ChatUserKeyUpsertRequest(BaseModel):
    algorithm: str = Field(default="ECDH_P256", min_length=3, max_length=50)
    public_key_jwk: dict


class ChatParticipantRead(BaseModel):
    user_id: str
    display_name: str
    role: str
    company_name: str | None = None
    company_id: str | None = None
    public_key_jwk: dict | None = None
    is_online: bool = False


class ChatConversationCreateRequest(BaseModel):
    applicant_user_id: str | None = None
    employer_user_id: str | None = None
    employer_id: str | None = None


class ChatMessageCreateRequest(BaseModel):
    conversation_id: str
    ciphertext: str = Field(min_length=1)
    iv: str = Field(min_length=8, max_length=120)
    salt: str = Field(min_length=8, max_length=120)

    @field_validator("conversation_id", "ciphertext", "iv", "salt")
    @classmethod
    def strip_fields(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("Значение не может быть пустым")
        return normalized_value


class ChatMessageRead(BaseModel):
    id: str
    conversation_id: str
    sender_user_id: str
    sender_role: str
    ciphertext: str
    iv: str
    salt: str
    created_at: str
    is_own: bool
    is_read_by_peer: bool


class ChatConversationRead(BaseModel):
    id: str
    updated_at: str
    unread_count: int
    counterpart: ChatParticipantRead
    last_message: ChatMessageRead | None = None


class ChatConversationListResponse(BaseModel):
    items: list[ChatConversationRead]


class ChatConversationCreateResponse(BaseModel):
    conversation: ChatConversationRead


class ChatMessageListResponse(BaseModel):
    items: list[ChatMessageRead]


class ChatContactRead(BaseModel):
    user_id: str
    role: str
    display_name: str
    company_name: str | None = None
    employer_id: str | None = None
    public_key_jwk: dict | None = None
    is_online: bool = False
    has_conversation: bool = False
    conversation_id: str | None = None


class ChatContactListResponse(BaseModel):
    items: list[ChatContactRead]


class ChatUserKeyRead(BaseModel):
    algorithm: str
    public_key_jwk: dict


class ChatReadReceiptResponse(BaseModel):
    conversation_id: str
    read_at: str
