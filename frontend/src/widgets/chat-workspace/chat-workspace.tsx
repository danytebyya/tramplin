import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ChatContact,
  ChatConversation,
  ChatMessage,
  createChatConversationRequest,
  decryptChatMessage,
  encryptChatMessage,
  ensureChatKeyPair,
  listChatContactsRequest,
  listChatConversationsRequest,
  listChatMessagesRequest,
  markChatConversationReadRequest,
  sendChatMessageRequest,
  upsertMyChatKeyRequest,
  useChatRealtime,
} from "../../features/chat";
import { Input, Button } from "../../shared/ui";
import "./chat-workspace.css";

type ChatWorkspaceProps = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyText: string;
  createConversationPayload: (contact: ChatContact) => {
    applicant_user_id?: string;
    employer_user_id?: string;
    employer_id?: string;
  };
};

type ConversationListItem = {
  id: string;
  counterpart: ChatConversation["counterpart"];
  unreadCount: number;
  previewText: string;
  updatedAt: string;
  isExistingConversation: boolean;
  conversationId: string | null;
  source: "conversation" | "contact";
  companyName: string | null;
};

function resolveInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase() ?? "")
    .join("");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ChatWorkspace({
  title,
  subtitle,
  emptyTitle,
  emptyText,
  createConversationPayload,
}: ChatWorkspaceProps) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [keyPair, setKeyPair] = useState<Awaited<ReturnType<typeof ensureChatKeyPair>> | null>(null);
  const [decryptedPreviewMap, setDecryptedPreviewMap] = useState<Record<string, string>>({});
  const [decryptedMessageMap, setDecryptedMessageMap] = useState<Record<string, string>>({});
  const [chatError, setChatError] = useState<string | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue);

  const conversationsQuery = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: listChatConversationsRequest,
    staleTime: 10_000,
  });
  const contactsQuery = useQuery({
    queryKey: ["chat", "contacts"],
    queryFn: listChatContactsRequest,
    staleTime: 30_000,
  });
  const messagesQuery = useQuery({
    queryKey: ["chat", "messages", activeConversationId],
    queryFn: () => listChatMessagesRequest(activeConversationId as string),
    enabled: Boolean(activeConversationId),
    staleTime: 5_000,
  });

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const pair = await ensureChatKeyPair();
      if (!isMounted) {
        return;
      }
      setKeyPair(pair);
      await upsertMyChatKeyRequest({
        algorithm: pair.algorithm,
        public_key_jwk: pair.publicKeyJwk,
      });
    })().catch(() => {
      if (isMounted) {
        setChatError("Не удалось инициализировать защищенный чат");
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useChatRealtime(() => {
    void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["chat", "contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["chat", "messages"] });
  });

  const createConversationMutation = useMutation({
    mutationFn: createChatConversationRequest,
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "contacts"] });
      setActiveConversationId(conversation.id);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: sendChatMessageRequest,
    onSuccess: () => {
      setMessageDraft("");
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeConversationId] });
    },
    onError: () => {
      setChatError("Не удалось отправить сообщение");
    },
  });

  const conversations = conversationsQuery.data ?? [];
  const contacts = contactsQuery.data ?? [];
  const messages = messagesQuery.data ?? [];

  const conversationMap = useMemo(
    () =>
      conversations.reduce<Record<string, ChatConversation>>((result, item) => {
        result[item.id] = item;
        return result;
      }, {}),
    [conversations],
  );

  const items = useMemo<ConversationListItem[]>(() => {
    const conversationItems = conversations.map((item) => ({
      id: item.id,
      counterpart: item.counterpart,
      unreadCount: item.unreadCount,
      previewText: decryptedPreviewMap[item.id] ?? "Защищенное сообщение",
      updatedAt: item.updatedAt,
      isExistingConversation: true,
      conversationId: item.id,
      source: "conversation" as const,
      companyName: item.counterpart.companyName,
    }));

    const contactItems = contacts
      .filter((item) => !item.hasConversation)
      .map((item) => ({
        id: item.userId,
        counterpart: {
          userId: item.userId,
          displayName: item.displayName,
          role: item.role,
          companyName: item.companyName,
          companyId: item.employerId,
          publicKeyJwk: item.publicKeyJwk,
          isOnline: item.isOnline,
        },
        unreadCount: 0,
        previewText: item.publicKeyJwk ? "Диалог еще не начат" : "Пользователь еще не активировал защищенный чат",
        updatedAt: "",
        isExistingConversation: false,
        conversationId: null,
        source: "contact" as const,
        companyName: item.companyName,
      }));

    return [...conversationItems, ...contactItems];
  }, [contacts, conversations, decryptedPreviewMap]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = deferredSearchValue.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => {
      const haystack = [item.counterpart.displayName, item.companyName ?? "", item.previewText]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [deferredSearchValue, items]);

  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
      return;
    }

    if (activeConversationId && !items.some((item) => item.conversationId === activeConversationId || item.id === activeConversationId)) {
      setActiveConversationId(conversations[0]?.id ?? null);
    }
  }, [activeConversationId, conversations, items]);

  const activeConversation = activeConversationId ? conversationMap[activeConversationId] ?? null : null;
  const activeItem = filteredItems.find((item) => item.conversationId === activeConversationId || item.id === activeConversationId) ?? null;
  const activeCounterpart = activeConversation?.counterpart ?? activeItem?.counterpart ?? null;
  const activeMessages = activeConversation ? messages : [];

  useEffect(() => {
    if (!keyPair) {
      return;
    }

    let isMounted = true;

    void (async () => {
      const nextPreviewMap: Record<string, string> = {};

      for (const item of conversations) {
        if (!item.lastMessage || !item.counterpart.publicKeyJwk) {
          continue;
        }

        try {
          nextPreviewMap[item.id] = await decryptChatMessage({
            ciphertext: item.lastMessage.ciphertext,
            iv: item.lastMessage.iv,
            salt: item.lastMessage.salt,
            ownPrivateKeyJwk: keyPair.privateKeyJwk,
            counterpartPublicKeyJwk: item.counterpart.publicKeyJwk,
            conversationId: item.id,
          });
        } catch {
          nextPreviewMap[item.id] = "Не удалось расшифровать сообщение";
        }
      }

      if (isMounted) {
        setDecryptedPreviewMap(nextPreviewMap);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [conversations, keyPair]);

  useEffect(() => {
    if (!keyPair || !activeConversation || !activeConversation.counterpart.publicKeyJwk) {
      return;
    }
    const counterpartPublicKeyJwk = activeConversation.counterpart.publicKeyJwk;

    let isMounted = true;

    void (async () => {
      const nextMessageMap: Record<string, string> = {};
      for (const item of activeMessages) {
        try {
          nextMessageMap[item.id] = await decryptChatMessage({
            ciphertext: item.ciphertext,
            iv: item.iv,
            salt: item.salt,
            ownPrivateKeyJwk: keyPair.privateKeyJwk,
            counterpartPublicKeyJwk,
            conversationId: item.conversationId,
          });
        } catch {
          nextMessageMap[item.id] = "Не удалось расшифровать сообщение";
        }
      }

      if (isMounted) {
        setDecryptedMessageMap(nextMessageMap);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [activeConversation, activeMessages, keyPair]);

  useEffect(() => {
    if (!activeConversationId || !activeConversation) {
      return;
    }

    void markChatConversationReadRequest(activeConversationId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeConversationId] });
    });
  }, [activeConversation, activeConversationId, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeMessages.length]);

  const handleSelectItem = (item: ConversationListItem) => {
    setChatError(null);
    if (item.conversationId) {
      setActiveConversationId(item.conversationId);
      return;
    }
    setActiveConversationId(item.id);
  };

  const handleSendMessage = async () => {
    if (!keyPair || !activeCounterpart || !activeCounterpart.publicKeyJwk) {
      setChatError("Невозможно отправить сообщение, пока второй участник не активировал защищенный чат");
      return;
    }
    const counterpartPublicKeyJwk = activeCounterpart.publicKeyJwk;

    const trimmedMessage = messageDraft.trim();
    if (!trimmedMessage) {
      return;
    }

    setChatError(null);

    let conversationId = activeConversationId && conversationMap[activeConversationId] ? activeConversationId : null;

    if (!conversationId) {
      const createdConversation = await createConversationMutation.mutateAsync(
        createConversationPayload({
          userId: activeCounterpart.userId,
          role: activeCounterpart.role,
          displayName: activeCounterpart.displayName,
          companyName: activeCounterpart.companyName,
          employerId: activeCounterpart.companyId,
          publicKeyJwk: activeCounterpart.publicKeyJwk,
          isOnline: activeCounterpart.isOnline,
          hasConversation: false,
          conversationId: null,
        }),
      );
      conversationId = createdConversation.id;
    }

    const encryptedMessage = await encryptChatMessage({
      plaintext: trimmedMessage,
      ownPrivateKeyJwk: keyPair.privateKeyJwk,
      counterpartPublicKeyJwk,
      conversationId,
    });

    await sendMessageMutation.mutateAsync({
      conversation_id: conversationId,
      ciphertext: encryptedMessage.ciphertext,
      iv: encryptedMessage.iv,
      salt: encryptedMessage.salt,
    });
  };

  return (
    <section className="chat-workspace">
      <aside className="chat-workspace__sidebar">
        <div className="chat-workspace__sidebar-header">
          <h1 className="chat-workspace__title">{title}</h1>
          <p className="chat-workspace__subtitle">{subtitle}</p>
        </div>

        <Input
          type="search"
          placeholder="Поиск"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
        />

        <div className="chat-workspace__list">
          {filteredItems.map((item) => {
            const isActive = item.conversationId
              ? item.conversationId === activeConversationId
              : item.id === activeConversationId;

            return (
              <button
                key={item.conversationId ?? item.id}
                type="button"
                className={`chat-workspace__list-item${isActive ? " chat-workspace__list-item--active" : ""}`}
                onClick={() => handleSelectItem(item)}
              >
                <span className="chat-workspace__avatar">{resolveInitials(item.counterpart.displayName || "Т")}</span>

                <span className="chat-workspace__list-content">
                  <span className="chat-workspace__list-name-row">
                    <span className={`chat-workspace__status${item.counterpart.isOnline ? " chat-workspace__status--online" : ""}`} />
                    <span className="chat-workspace__list-name">{item.counterpart.displayName}</span>
                  </span>
                  {item.companyName ? <span className="chat-workspace__list-company">{item.companyName}</span> : null}
                  <span className="chat-workspace__list-preview">{item.previewText}</span>
                </span>

                {item.unreadCount > 0 ? <span className="chat-workspace__unread">{item.unreadCount}</span> : null}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="chat-workspace__content">
        {activeCounterpart ? (
          <>
            <header className="chat-workspace__thread-header">
              <div className="chat-workspace__thread-title-group">
                <span className="chat-workspace__avatar">{resolveInitials(activeCounterpart.displayName || "Т")}</span>
                <div>
                  <h2 className="chat-workspace__thread-name">{activeCounterpart.displayName}</h2>
                  <p className="chat-workspace__thread-meta">
                    {activeCounterpart.companyName
                      ? `${activeCounterpart.companyName} · ${activeCounterpart.isOnline ? "online" : "offline"}`
                      : activeCounterpart.isOnline
                        ? "online"
                        : "offline"}
                  </p>
                </div>
              </div>
            </header>

            <div className="chat-workspace__messages">
              {activeConversation ? (
                activeMessages.map((item) => (
                  <div
                    key={item.id}
                    className={`chat-workspace__message${item.isOwn ? " chat-workspace__message--own" : ""}`}
                  >
                    {!item.isOwn ? (
                      <span className="chat-workspace__avatar">
                        {resolveInitials(activeCounterpart.displayName || "Т")}
                      </span>
                    ) : null}

                    <div className="chat-workspace__message-body">
                      <p className="chat-workspace__message-text">
                        {decryptedMessageMap[item.id] ?? "Расшифровка сообщения..."}
                      </p>
                      <div className="chat-workspace__message-meta">
                        <span>{formatTime(item.createdAt)}</span>
                        {item.isOwn ? <span>{item.isReadByPeer ? "Прочитано" : "Отправлено"}</span> : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="chat-workspace__placeholder">
                  <h2 className="chat-workspace__empty-title">{emptyTitle}</h2>
                  <p className="chat-workspace__empty-text">{emptyText}</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-workspace__composer">
              {chatError ? <div className="chat-workspace__hint">{chatError}</div> : null}
              <div className="chat-workspace__composer-row">
                <textarea
                  className="chat-workspace__textarea"
                  placeholder="Введите сообщение"
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  disabled={!activeCounterpart.publicKeyJwk || sendMessageMutation.isPending}
                />
                <Button
                  variant="primary"
                  onClick={() => void handleSendMessage()}
                  loading={sendMessageMutation.isPending || createConversationMutation.isPending}
                  disabled={!activeCounterpart.publicKeyJwk}
                >
                  Отправить
                </Button>
              </div>
              <div className="chat-workspace__hint">
                {activeCounterpart.publicKeyJwk
                  ? "Сообщения шифруются в браузере перед отправкой и хранятся на сервере только в виде ciphertext."
                  : "Собеседник еще не активировал защищенный чат на своем устройстве."}
              </div>
            </div>
          </>
        ) : (
          <div className="chat-workspace__placeholder">
            <h2 className="chat-workspace__empty-title">{emptyTitle}</h2>
            <p className="chat-workspace__empty-text">{emptyText}</p>
          </div>
        )}
      </div>
    </section>
  );
}
