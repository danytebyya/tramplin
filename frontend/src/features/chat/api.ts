import { apiClient } from "../../shared/api/client";
import { env } from "../../shared/config/env";

export type ChatKey = {
  algorithm: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey | null;
};

type ChatKeyApi = {
  algorithm: string;
  public_key_jwk: JsonWebKey;
  private_key_jwk?: JsonWebKey | null;
};

export type ChatParticipant = {
  userId: string;
  publicId: string | null;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  companyName: string | null;
  companyId: string | null;
  publicKeyJwk: JsonWebKey | null;
  isOnline: boolean;
  lastSeenAt: string | null;
};

type ChatParticipantApi = {
  user_id: string;
  public_id?: string | null;
  display_name: string;
  role: string;
  avatar_url?: string | null;
  company_name?: string | null;
  company_id?: string | null;
  public_key_jwk?: JsonWebKey | null;
  is_online?: boolean;
  last_seen_at?: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderRole: string;
  ciphertext: string;
  iv: string;
  salt: string;
  createdAt: string;
  isOwn: boolean;
  isReadByPeer: boolean;
};

type ChatMessageApi = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_role: string;
  ciphertext: string;
  iv: string;
  salt: string;
  created_at: string;
  is_own: boolean;
  is_read_by_peer: boolean;
};

export type ChatConversation = {
  id: string;
  updatedAt: string;
  unreadCount: number;
  counterpart: ChatParticipant;
  lastMessage: ChatMessage | null;
};

type ChatConversationApi = {
  id: string;
  updated_at: string;
  unread_count: number;
  counterpart: ChatParticipantApi;
  last_message?: ChatMessageApi | null;
};

export type ChatContact = {
  userId: string;
  publicId: string | null;
  role: string;
  displayName: string;
  avatarUrl: string | null;
  companyName: string | null;
  employerId: string | null;
  publicKeyJwk: JsonWebKey | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  hasConversation: boolean;
  conversationId: string | null;
};

type ChatContactApi = {
  user_id: string;
  public_id?: string | null;
  role: string;
  display_name: string;
  avatar_url?: string | null;
  company_name?: string | null;
  employer_id?: string | null;
  public_key_jwk?: JsonWebKey | null;
  is_online?: boolean;
  last_seen_at?: string | null;
  has_conversation?: boolean;
  conversation_id?: string | null;
};

function mapKey(item?: ChatKeyApi | null): ChatKey | null {
  if (!item) {
    return null;
  }

  return {
    algorithm: item.algorithm,
    publicKeyJwk: item.public_key_jwk,
    privateKeyJwk: item.private_key_jwk ?? null,
  };
}

function mapParticipant(item: ChatParticipantApi): ChatParticipant {
  return {
    userId: item.user_id,
    publicId: item.public_id ?? null,
    displayName: item.display_name,
    role: item.role,
    avatarUrl: item.avatar_url ?? null,
    companyName: item.company_name ?? null,
    companyId: item.company_id ?? null,
    publicKeyJwk: item.public_key_jwk ?? null,
    isOnline: Boolean(item.is_online),
    lastSeenAt: item.last_seen_at ?? null,
  };
}

function mapMessage(item: ChatMessageApi): ChatMessage {
  return {
    id: item.id,
    conversationId: item.conversation_id,
    senderUserId: item.sender_user_id,
    senderRole: item.sender_role,
    ciphertext: item.ciphertext,
    iv: item.iv,
    salt: item.salt,
    createdAt: item.created_at,
    isOwn: item.is_own,
    isReadByPeer: item.is_read_by_peer,
  };
}

function mapConversation(item: ChatConversationApi): ChatConversation {
  return {
    id: item.id,
    updatedAt: item.updated_at,
    unreadCount: item.unread_count,
    counterpart: mapParticipant(item.counterpart),
    lastMessage: item.last_message ? mapMessage(item.last_message) : null,
  };
}

function mapContact(item: ChatContactApi): ChatContact {
  return {
    userId: item.user_id,
    publicId: item.public_id ?? null,
    role: item.role,
    displayName: item.display_name,
    avatarUrl: item.avatar_url ?? null,
    companyName: item.company_name ?? null,
    employerId: item.employer_id ?? null,
    publicKeyJwk: item.public_key_jwk ?? null,
    isOnline: Boolean(item.is_online),
    lastSeenAt: item.last_seen_at ?? null,
    hasConversation: Boolean(item.has_conversation),
    conversationId: item.conversation_id ?? null,
  };
}

export function getChatWebSocketUrl(accessToken: string) {
  const apiOrigin = env.apiBaseUrl.replace(/\/api\/v1$/, "");
  const wsOrigin = apiOrigin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${wsOrigin}/api/v1/chat/stream?token=${encodeURIComponent(accessToken)}`;
}

export async function getMyChatKeyRequest() {
  const response = await apiClient.get<{ data?: ChatKeyApi | null }>("/chat/keys/me");
  return mapKey(response.data?.data);
}

export async function upsertMyChatKeyRequest(payload: {
  algorithm: string;
  public_key_jwk: JsonWebKey;
  private_key_jwk?: JsonWebKey | null;
}) {
  const response = await apiClient.put<{ data?: ChatKeyApi }>("/chat/keys/me", payload);
  return mapKey(response.data?.data);
}

export async function listChatContactsRequest() {
  const response = await apiClient.get<{ data?: { items?: ChatContactApi[] } }>("/chat/contacts");
  return (response.data?.data?.items ?? []).map(mapContact);
}

export async function searchChatContactsRequest(payload: { query?: string; employerId?: string | null }) {
  const response = await apiClient.get<{ data?: { items?: ChatContactApi[] } }>("/chat/search", {
    params: {
      q: payload.query?.trim() || undefined,
      employer_id: payload.employerId || undefined,
    },
  });
  return (response.data?.data?.items ?? []).map(mapContact);
}

export async function listChatConversationsRequest() {
  const response = await apiClient.get<{ data?: { items?: ChatConversationApi[] } }>("/chat/conversations");
  return (response.data?.data?.items ?? []).map(mapConversation);
}

export async function createChatConversationRequest(payload: {
  recipient_user_id?: string;
  employer_id?: string;
}) {
  const response = await apiClient.post<{ data?: { conversation?: ChatConversationApi } }>("/chat/conversations", payload);
  const conversation = response.data?.data?.conversation;
  if (!conversation) {
    throw new Error("Не удалось создать диалог");
  }
  return mapConversation(conversation);
}

export async function listChatMessagesRequest(conversationId: string) {
  const response = await apiClient.get<{ data?: { items?: ChatMessageApi[] } }>(`/chat/conversations/${conversationId}/messages`);
  return (response.data?.data?.items ?? []).map(mapMessage);
}

export async function sendChatMessageRequest(payload: {
  conversation_id?: string;
  recipient_user_id?: string;
  employer_id?: string;
  ciphertext: string;
  iv: string;
  salt: string;
}) {
  const response = await apiClient.post<{ data?: ChatMessageApi }>("/chat/messages", payload, {
    timeout: 2500,
  });
  if (!response.data?.data) {
    throw new Error("Не удалось отправить сообщение");
  }
  return mapMessage(response.data.data);
}

export async function updateChatMessageRequest(
  messageId: string,
  payload: {
    ciphertext: string;
    iv: string;
    salt: string;
  },
) {
  const response = await apiClient.put<{ data?: ChatMessageApi }>(`/chat/messages/${messageId}`, payload, {
    timeout: 2500,
  });
  if (!response.data?.data) {
    throw new Error("Не удалось обновить сообщение");
  }
  return mapMessage(response.data.data);
}

export async function deleteChatMessageRequest(messageId: string) {
  const response = await apiClient.delete<{ data?: { id?: string; conversation_id?: string } }>(`/chat/messages/${messageId}`, {
    timeout: 2500,
  });
  return response.data?.data ?? null;
}

export async function markChatConversationReadRequest(conversationId: string) {
  const response = await apiClient.post<{ data?: { conversation_id?: string; read_at?: string } }>(
    `/chat/conversations/${conversationId}/read`,
  );
  return response.data?.data ?? null;
}
