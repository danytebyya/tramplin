from pydantic import BaseModel, Field, field_validator, model_validator


class ChatUserKeyUpsertRequest(BaseModel):
    algorithm: str = Field(default="ECDH_P256", min_length=3, max_length=50)
    public_key_jwk: dict
    private_key_jwk: dict | None = None


class ChatParticipantRead(BaseModel):
    user_id: str
    public_id: str | None = None
    display_name: str
    role: str
    company_name: str | None = None
    company_id: str | None = None
    public_key_jwk: dict | None = None
    is_online: bool = False
    last_seen_at: str | None = None


class ChatConversationCreateRequest(BaseModel):
    recipient_user_id: str | None = None
    employer_id: str | None = None

    @field_validator("recipient_user_id", "employer_id")
    @classmethod
    def strip_optional_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        if not normalized_value:
            return None
        return normalized_value


class ChatMessageCreateRequest(BaseModel):
    conversation_id: str | None = None
    recipient_user_id: str | None = None
    employer_id: str | None = None
    ciphertext: str = Field(min_length=1)
    iv: str = Field(min_length=8, max_length=120)
    salt: str = Field(min_length=8, max_length=120)

    @field_validator("conversation_id", "recipient_user_id", "employer_id", "ciphertext", "iv", "salt")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("Значение не может быть пустым")
        return normalized_value

    @model_validator(mode="after")
    def validate_target(self) -> "ChatMessageCreateRequest":
        instance = self
        if not instance.conversation_id and not instance.recipient_user_id:
            raise ValueError("Нужно указать диалог или получателя")
        return instance


class ChatMessageUpdateRequest(BaseModel):
    ciphertext: str = Field(min_length=1)
    iv: str = Field(min_length=8, max_length=120)
    salt: str = Field(min_length=8, max_length=120)

    @field_validator("ciphertext", "iv", "salt")
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
    public_id: str | None = None
    role: str
    display_name: str
    company_name: str | None = None
    employer_id: str | None = None
    public_key_jwk: dict | None = None
    is_online: bool = False
    last_seen_at: str | None = None
    has_conversation: bool = False
    conversation_id: str | None = None


class ChatContactListResponse(BaseModel):
    items: list[ChatContactRead]


class ChatUserKeyRead(BaseModel):
    algorithm: str
    public_key_jwk: dict
    private_key_jwk: dict | None = None


class ChatReadReceiptResponse(BaseModel):
    conversation_id: str
    read_at: str


class ChatMessageDeleteResponse(BaseModel):
    id: str
    conversation_id: str
