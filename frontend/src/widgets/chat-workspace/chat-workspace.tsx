import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "../../features/auth";
import {
  ChatContact,
  ChatConversation,
  ChatMessage,
  ChatParticipant,
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
import arrowIcon from "../../assets/icons/arrow.svg";
import clipIcon from "../../assets/icons/clip.svg";
import { abbreviateLegalEntityName, formatPresenceStatus, resolveAvatarIcon } from "../../shared/lib";
import { Input, Button } from "../../shared/ui";
import "./chat-workspace.css";

type ChatWorkspaceProps = {
  title: string;
  subtitle?: string;
  emptyTitle: string;
  emptyText: string;
  preferredEmployerId?: string | null;
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

type ClientMessageStatus = "sending" | "failed";

type ChatMessageView = ChatMessage & {
  clientStatus?: ClientMessageStatus;
  clientText?: string;
};

const EMPTY_CONVERSATIONS: ChatConversation[] = [];
const EMPTY_CONTACTS: ChatContact[] = [];
const EMPTY_MESSAGES: ChatMessageView[] = [];

function logChatDebug(event: string, payload?: Record<string, unknown>) {
  console.info(`[chat] ${event}`, payload ?? {});
}

function logChatError(event: string, payload?: Record<string, unknown>) {
  console.error(`[chat] ${event}`, payload ?? {});
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function startOfDay(value: Date) {
  const nextDate = new Date(value);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function isSameDay(left: Date, right: Date) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

function startOfWeek(value: Date) {
  const nextDate = startOfDay(value);
  const day = nextDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  nextDate.setDate(nextDate.getDate() + diff);
  return nextDate;
}

function formatChatDateLabel(value: string) {
  const messageDate = new Date(value);
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(messageDate, today)) {
    return "Сегодня";
  }

  if (isSameDay(messageDate, yesterday)) {
    return "Вчера";
  }

  const currentWeekStart = startOfWeek(now);
  const messageWeekStart = startOfWeek(messageDate);

  if (messageWeekStart.getTime() === currentWeekStart.getTime()) {
    const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(messageDate);
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }

  const options: Intl.DateTimeFormatOptions =
    messageDate.getFullYear() === now.getFullYear()
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" };

  return new Intl.DateTimeFormat("ru-RU", options).format(messageDate);
}

function isCompactMessageGap(previousMessage: ChatMessageView | null, currentMessage: ChatMessageView | null) {
  if (!previousMessage || !currentMessage) {
    return false;
  }

  if (previousMessage.isOwn !== currentMessage.isOwn) {
    return false;
  }

  const previousTimestamp = Date.parse(previousMessage.createdAt);
  const currentTimestamp = Date.parse(currentMessage.createdAt);
  return currentTimestamp - previousTimestamp <= 3 * 60 * 1000;
}

function resolveParticipantTitle(participant: ChatParticipant) {
  if (participant.role === "employer" && participant.companyName) {
    return abbreviateLegalEntityName(participant.companyName);
  }

  return participant.displayName;
}

function ChatAvatar({
  displayName,
  role,
  avatarUrl,
}: {
  displayName: string;
  role: string;
  avatarUrl: string | null;
}) {
  const imageSource = avatarUrl || resolveAvatarIcon(role);

  return (
    <span className="chat-workspace__avatar">
      <img
        src={imageSource}
        alt={displayName}
        className={
          avatarUrl
            ? "chat-workspace__avatar-image chat-workspace__avatar-image--uploaded"
            : "chat-workspace__avatar-image"
        }
      />
    </span>
  );
}

export function ChatWorkspace({
  title,
  subtitle,
  emptyTitle,
  emptyText,
  preferredEmployerId = null,
  createConversationPayload,
}: ChatWorkspaceProps) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const currentRole = useAuthStore((state) => state.role);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [keyPair, setKeyPair] = useState<Awaited<ReturnType<typeof ensureChatKeyPair>> | null>(null);
  const [decryptedPreviewMap, setDecryptedPreviewMap] = useState<Record<string, string>>({});
  const [decryptedMessageMap, setDecryptedMessageMap] = useState<Record<string, string>>({});
  const deferredSearchValue = useDeferredValue(searchValue);

  const conversationsQuery = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: listChatConversationsRequest,
    enabled: isHydrated && Boolean(accessToken),
    staleTime: 10_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const contactsQuery = useQuery({
    queryKey: ["chat", "contacts"],
    queryFn: listChatContactsRequest,
    enabled: isHydrated && Boolean(accessToken),
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
    })().catch(() => undefined);

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
  });

  const conversations = conversationsQuery.data ?? EMPTY_CONVERSATIONS;
  const contacts = contactsQuery.data ?? EMPTY_CONTACTS;

  const conversationMap = useMemo(
    () =>
      conversations.reduce<Record<string, ChatConversation>>((result, item) => {
        result[item.id] = item;
        return result;
      }, {}),
    [conversations],
  );

  const messagesQuery = useQuery({
    queryKey: ["chat", "messages", activeConversationId],
    queryFn: () => listChatMessagesRequest(activeConversationId as string),
    enabled: isHydrated && Boolean(accessToken && activeConversationId && conversationMap[activeConversationId]),
    staleTime: 5_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const messages = (messagesQuery.data ?? EMPTY_MESSAGES) as ChatMessageView[];

  const upsertCachedMessage = (conversationId: string, nextMessage: ChatMessageView) => {
    queryClient.setQueryData<ChatMessageView[]>(["chat", "messages", conversationId], (currentValue) => {
      const nextItems = [...(currentValue ?? [])];
      const existingIndex = nextItems.findIndex((item) => item.id === nextMessage.id);
      if (existingIndex >= 0) {
        nextItems[existingIndex] = nextMessage;
      } else {
        nextItems.push(nextMessage);
      }

      nextItems.sort((firstItem, secondItem) => {
        const firstTimestamp = Date.parse(firstItem.createdAt);
        const secondTimestamp = Date.parse(secondItem.createdAt);
        if (firstTimestamp !== secondTimestamp) {
          return firstTimestamp - secondTimestamp;
        }
        return firstItem.id.localeCompare(secondItem.id);
      });

      return nextItems;
    });
  };

  const removeCachedMessage = (conversationId: string, messageId: string) => {
    queryClient.setQueryData<ChatMessageView[]>(["chat", "messages", conversationId], (currentValue) =>
      (currentValue ?? []).filter((item) => item.id !== messageId),
    );
  };

  const upsertCachedConversation = (conversation: ChatConversation, message: ChatMessageView, updatedAt: string) => {
    queryClient.setQueryData<ChatConversation[]>(["chat", "conversations"], (currentValue) => {
      const nextItems = [...(currentValue ?? [])];
      const nextConversation: ChatConversation = {
        ...conversation,
        updatedAt,
        lastMessage: message,
      };
      const existingIndex = nextItems.findIndex((item) => item.id === conversation.id);
      if (existingIndex >= 0) {
        nextItems[existingIndex] = {
          ...nextItems[existingIndex],
          ...nextConversation,
        };
      } else {
        nextItems.unshift(nextConversation);
      }

      nextItems.sort((firstItem, secondItem) => Date.parse(secondItem.updatedAt) - Date.parse(firstItem.updatedAt));
      return nextItems;
    });
  };

  const resolveCounterpartKey = async ({
    conversationId,
    counterpartUserId,
    fallbackKey,
  }: {
    conversationId: string;
    counterpartUserId: string;
    fallbackKey: JsonWebKey | null;
  }) => {
    if (fallbackKey) {
      return fallbackKey;
    }

    const [freshConversations, freshContacts] = await Promise.all([
      queryClient.fetchQuery({
        queryKey: ["chat", "conversations"],
        queryFn: listChatConversationsRequest,
        staleTime: 0,
      }),
      queryClient.fetchQuery({
        queryKey: ["chat", "contacts"],
        queryFn: listChatContactsRequest,
        staleTime: 0,
      }),
    ]);

    return (
      freshConversations.find((item) => item.id === conversationId)?.counterpart.publicKeyJwk ??
      freshContacts.find((item) => item.userId === counterpartUserId)?.publicKeyJwk ??
      null
    );
  };

  const items = useMemo<ConversationListItem[]>(() => {
    const conversationItems = conversations.map((item) => ({
      id: item.id,
      counterpart: item.counterpart,
      unreadCount: item.unreadCount,
      previewText: item.lastMessage
        ? (decryptedPreviewMap[item.id] ?? "Сообщение")
        : item.unreadCount > 0
          ? "Новое сообщение"
          : "Нет сообщений",
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
          avatarUrl: item.avatarUrl,
          companyName: item.companyName,
          companyId: item.employerId,
          publicKeyJwk: item.publicKeyJwk,
          isOnline: item.isOnline,
          lastSeenAt: item.lastSeenAt,
        },
        unreadCount: 0,
        previewText: "Нет сообщений",
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
      const haystack = [resolveParticipantTitle(item.counterpart), item.counterpart.displayName, item.companyName ?? "", item.previewText]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [deferredSearchValue, items]);

  const availableConversationIds = useMemo(() => conversations.map((item) => item.id), [conversations]);
  const availableContactIds = useMemo(
    () => contacts.filter((item) => !item.hasConversation).map((item) => item.userId),
    [contacts],
  );
  const firstAvailableItemId = availableConversationIds[0] ?? availableContactIds[0] ?? null;
  const availableConversationIdsKey = availableConversationIds.join("|");
  const availableContactIdsKey = availableContactIds.join("|");
  const preferredItemId = useMemo(() => {
    if (!preferredEmployerId) {
      return null;
    }

    const matchingConversation = items.find(
      (item) => item.counterpart.companyId === preferredEmployerId && item.conversationId,
    );
    if (matchingConversation?.conversationId) {
      return matchingConversation.conversationId;
    }

    const matchingContact = items.find(
      (item) => item.counterpart.companyId === preferredEmployerId && !item.conversationId,
    );
    return matchingContact?.id ?? null;
  }, [items, preferredEmployerId]);

  useEffect(() => {
    if (!preferredItemId) {
      return;
    }

    setActiveConversationId((currentValue) => (currentValue === preferredItemId ? currentValue : preferredItemId));
  }, [preferredItemId]);

  useEffect(() => {
    if (!activeConversationId) {
      if (preferredItemId) {
        setActiveConversationId(preferredItemId);
        return;
      }

      if (firstAvailableItemId) {
        setActiveConversationId(firstAvailableItemId);
      }
      return;
    }

    if (
      availableConversationIds.includes(activeConversationId) ||
      availableContactIds.includes(activeConversationId)
    ) {
      return;
    }

    const fallbackItemId = preferredItemId ?? firstAvailableItemId;
    if (activeConversationId !== fallbackItemId) {
      setActiveConversationId(fallbackItemId);
    }
  }, [
    activeConversationId,
    availableContactIds,
    availableContactIdsKey,
    availableConversationIds,
    availableConversationIdsKey,
    firstAvailableItemId,
    preferredItemId,
  ]);

  const activeConversation = activeConversationId ? conversationMap[activeConversationId] ?? null : null;
  const activeItem = filteredItems.find((item) => item.conversationId === activeConversationId || item.id === activeConversationId) ?? null;
  const activeCounterpart = activeConversation?.counterpart ?? activeItem?.counterpart ?? null;
  const activeMessages = activeConversation ? messages : [];
  const decoratedActiveMessages = useMemo(
    () =>
      activeMessages.map((item, index) => ({
        item,
        isCompactGap: isCompactMessageGap(index > 0 ? activeMessages[index - 1] : null, item),
        shouldShowAvatar:
          !item.isOwn &&
          !isCompactMessageGap(item, index < activeMessages.length - 1 ? activeMessages[index + 1] : null),
      })),
    [activeMessages],
  );

  useEffect(() => {
    if (!isHydrated || !accessToken) {
      return;
    }

    void Promise.allSettled([
      queryClient.fetchQuery({
        queryKey: ["chat", "conversations"],
        queryFn: listChatConversationsRequest,
        staleTime: 0,
      }),
      queryClient.fetchQuery({
        queryKey: ["chat", "contacts"],
        queryFn: listChatContactsRequest,
        staleTime: 0,
      }),
    ]);
  }, [accessToken, isHydrated, queryClient]);
  const messageDayGroups = useMemo(() => {
    const groups: Array<{
      dayKey: string;
      dateLabel: string;
      messages: typeof decoratedActiveMessages;
    }> = [];

    decoratedActiveMessages.forEach((entry) => {
      const dayKey = startOfDay(new Date(entry.item.createdAt)).toISOString();
      const lastGroup = groups[groups.length - 1];

      if (!lastGroup || lastGroup.dayKey !== dayKey) {
        groups.push({
          dayKey,
          dateLabel: formatChatDateLabel(entry.item.createdAt),
          messages: [entry],
        });
        return;
      }

      lastGroup.messages.push(entry);
    });

    return groups;
  }, [decoratedActiveMessages]);
  const activeMessagesRenderKey = useMemo(
    () =>
      activeMessages
        .map((item) => `${item.id}:${decryptedMessageMap[item.id] ?? item.clientText ?? ""}`)
        .join("|"),
    [activeMessages, decryptedMessageMap],
  );

  const scrollMessagesToBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  };

  const scheduleScrollMessagesToBottom = () => {
    scrollMessagesToBottom();
    window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
      window.requestAnimationFrame(() => {
        scrollMessagesToBottom();
      });
    });
  };

  useEffect(() => {
    if (!keyPair) {
      return;
    }

    let isMounted = true;

    void (async () => {
      const nextPreviewMap: Record<string, string> = {};

      for (const item of conversations) {
        if (!item.lastMessage) {
          continue;
        }

        const localLastMessage = item.lastMessage as ChatMessageView;
        if (localLastMessage.clientText) {
          nextPreviewMap[item.id] = localLastMessage.clientText;
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
        setDecryptedPreviewMap((currentValue) => {
          const currentKeys = Object.keys(currentValue);
          const nextKeys = Object.keys(nextPreviewMap);
          const isSameLength = currentKeys.length === nextKeys.length;
          const isSameContent =
            isSameLength &&
            nextKeys.every((key) => currentValue[key] === nextPreviewMap[key]);

          return isSameContent ? currentValue : nextPreviewMap;
        });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [conversations, keyPair]);

  useEffect(() => {
    if (!keyPair || !activeConversation) {
      return;
    }
    const counterpartPublicKeyJwk = activeConversation.counterpart.publicKeyJwk;

    let isMounted = true;

    void (async () => {
      const nextMessageMap: Record<string, string> = {};
      for (const item of activeMessages) {
        if (item.clientText) {
          nextMessageMap[item.id] = item.clientText;
          continue;
        }

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
        setDecryptedMessageMap((currentValue) => {
          const currentKeys = Object.keys(currentValue);
          const nextKeys = Object.keys(nextMessageMap);
          const isSameLength = currentKeys.length === nextKeys.length;
          const isSameContent =
            isSameLength &&
            nextKeys.every((key) => currentValue[key] === nextMessageMap[key]);

          return isSameContent ? currentValue : nextMessageMap;
        });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [activeConversation, activeMessages, keyPair]);

  useEffect(() => {
    if (!activeConversationId || !activeConversation || activeConversation.unreadCount <= 0) {
      return;
    }

    void markChatConversationReadRequest(activeConversationId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeConversationId] });
    });
  }, [activeConversation?.unreadCount, activeConversationId, queryClient]);

  useLayoutEffect(() => {
    scheduleScrollMessagesToBottom();
  }, [activeConversationId, activeMessages.length, messageDayGroups.length, activeMessagesRenderKey]);

  const handleSelectItem = (item: ConversationListItem) => {
    if (item.conversationId) {
      setActiveConversationId(item.conversationId);
      return;
    }
    setActiveConversationId(item.id);
  };

  const handleSendMessage = async (payload?: { messageId?: string; text?: string; createdAt?: string }) => {
    if (!keyPair || !activeCounterpart) {
      logChatError("send.aborted.missing_context", {
        hasKeyPair: Boolean(keyPair),
        hasActiveCounterpart: Boolean(activeCounterpart),
      });
      return;
    }

    const trimmedMessage = (payload?.text ?? messageDraft).trim();
    if (!trimmedMessage) {
      logChatDebug("send.aborted.empty_message");
      return;
    }

    logChatDebug("send.started", {
      messageId: payload?.messageId ?? null,
      activeConversationId,
      counterpartUserId: activeCounterpart.userId,
      counterpartRole: activeCounterpart.role,
    });

    let conversationId = activeConversationId && conversationMap[activeConversationId] ? activeConversationId : null;
    let counterpartPublicKeyJwk = activeConversation?.counterpart.publicKeyJwk ?? activeCounterpart.publicKeyJwk;
    let conversation = activeConversation;

    if (!conversationId) {
      logChatDebug("conversation.create.started", {
        counterpartUserId: activeCounterpart.userId,
        counterpartRole: activeCounterpart.role,
      });
      try {
        const createdConversation = await createConversationMutation.mutateAsync(
          createConversationPayload({
            userId: activeCounterpart.userId,
            role: activeCounterpart.role,
            displayName: activeCounterpart.displayName,
            avatarUrl: activeCounterpart.avatarUrl,
            companyName: activeCounterpart.companyName,
            employerId: activeCounterpart.companyId,
            publicKeyJwk: activeCounterpart.publicKeyJwk,
            isOnline: activeCounterpart.isOnline,
            lastSeenAt: activeCounterpart.lastSeenAt,
            hasConversation: false,
            conversationId: null,
          }),
        );
        conversationId = createdConversation.id;
        counterpartPublicKeyJwk = createdConversation.counterpart.publicKeyJwk;
        conversation = createdConversation;
        logChatDebug("conversation.create.succeeded", {
          conversationId,
          hasCounterpartKey: Boolean(counterpartPublicKeyJwk),
        });
        upsertCachedConversation(
          createdConversation,
          {
            id: payload?.messageId ?? `draft-${createdConversation.id}`,
            conversationId: createdConversation.id,
            senderUserId: "",
            senderRole: activeCounterpart.role === "applicant" ? "employer" : "applicant",
            ciphertext: "",
            iv: "",
            salt: "",
            createdAt: payload?.createdAt ?? new Date().toISOString(),
            isOwn: true,
            isReadByPeer: false,
          },
          createdConversation.updatedAt,
        );
      } catch (error) {
        logChatError("conversation.create.failed", {
          counterpartUserId: activeCounterpart.userId,
          error,
        });
        if (!payload?.messageId) {
          setMessageDraft(trimmedMessage);
        }
        return;
      }
    }

    if (!conversationId || !conversation) {
      logChatError("send.aborted.missing_conversation", {
        conversationId,
        hasConversation: Boolean(conversation),
      });
      return;
    }

    const messageId = payload?.messageId ?? `optimistic-${conversationId}-${Date.now()}`;
    const createdAt = payload?.createdAt ?? new Date().toISOString();
    const optimisticMessage: ChatMessageView = {
      id: messageId,
      conversationId,
      senderUserId: "",
      senderRole: activeCounterpart.role === "applicant" ? "employer" : "applicant",
      ciphertext: "",
      iv: "",
      salt: "",
      createdAt,
      isOwn: true,
      isReadByPeer: false,
      clientStatus: "sending",
      clientText: trimmedMessage,
    };

    if (!payload?.messageId) {
      setMessageDraft("");
    }
    setDecryptedMessageMap((currentValue) => ({
      ...currentValue,
      [messageId]: trimmedMessage,
    }));
    setDecryptedPreviewMap((currentValue) => ({
      ...currentValue,
      [conversationId]: trimmedMessage,
    }));
    upsertCachedMessage(conversationId, optimisticMessage);
    upsertCachedConversation(conversation, optimisticMessage, createdAt);

    try {
      counterpartPublicKeyJwk = await resolveCounterpartKey({
        conversationId,
        counterpartUserId: activeCounterpart.userId,
        fallbackKey: counterpartPublicKeyJwk,
      });
      logChatDebug("counterpart_key.resolved", {
        conversationId,
        counterpartUserId: activeCounterpart.userId,
        hasCounterpartKey: Boolean(counterpartPublicKeyJwk),
      });
    } catch (error) {
      logChatError("counterpart_key.resolve_failed", {
        conversationId,
        counterpartUserId: activeCounterpart.userId,
        error,
      });
      counterpartPublicKeyJwk = null;
    }

    const encryptedMessage = await encryptChatMessage({
      plaintext: trimmedMessage,
      ownPrivateKeyJwk: keyPair.privateKeyJwk,
      counterpartPublicKeyJwk,
      conversationId,
    });
    logChatDebug("message.encrypted", {
      conversationId,
      messageId,
      transportMode: counterpartPublicKeyJwk ? "ecdh" : "plain",
      ciphertextLength: encryptedMessage.ciphertext.length,
    });

    try {
      logChatDebug("message.send.attempt", {
        conversationId,
        messageId,
        attempt: 1,
        totalAttempts: 1,
      });
      const sentMessage = await sendMessageMutation.mutateAsync({
        conversation_id: conversationId,
        ciphertext: encryptedMessage.ciphertext,
        iv: encryptedMessage.iv,
        salt: encryptedMessage.salt,
      });
      logChatDebug("message.send.succeeded", {
        conversationId,
        messageId,
        persistedMessageId: sentMessage.id,
      });

      setDecryptedMessageMap((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[messageId];
        nextValue[sentMessage.id] = trimmedMessage;
        return nextValue;
      });
      removeCachedMessage(conversationId, messageId);
      upsertCachedMessage(conversationId, sentMessage);
      upsertCachedConversation(conversation, sentMessage, sentMessage.createdAt);
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "messages", conversationId] });
    } catch (error) {
      logChatError("message.send.failed_final", {
        conversationId,
        messageId,
        counterpartUserId: activeCounterpart.userId,
        hasCounterpartKey: Boolean(counterpartPublicKeyJwk),
        error,
      });
      upsertCachedMessage(conversationId, {
        ...optimisticMessage,
        clientStatus: "failed",
      });
      upsertCachedConversation(
        conversation,
        {
          ...optimisticMessage,
          clientStatus: "failed",
        },
        createdAt,
      );
    }
  };

  return (
    <section
      className={`chat-workspace__section${currentRole === "applicant" ? " chat-workspace__section--applicant" : ""}${currentRole === "employer" ? " chat-workspace__section--employer" : ""}`}
    >
      <div className="chat-workspace__header">
        <div className="chat-workspace__header-copy">
          <h1 className="chat-workspace__title">{title}</h1>
          {subtitle ? <p className="chat-workspace__subtitle">{subtitle}</p> : null}
        </div>
      </div>

      <div className="chat-workspace">
        <aside className="chat-workspace__sidebar">

          <label className="chat-workspace__search header__search" aria-label="Поиск по чатам">
            <Input
              type="search"
              placeholder="Поиск"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className="input--sm chat-workspace__search-input"
            />
          </label>

          <div className="chat-workspace__list">
            {filteredItems.map((item) => {
              const isActive = item.conversationId
                ? item.conversationId === activeConversationId
                : item.id === activeConversationId;
              const counterpartTitle = resolveParticipantTitle(item.counterpart);

              return (
                <button
                  key={item.conversationId ?? item.id}
                  type="button"
                  className={`chat-workspace__list-item${isActive ? " chat-workspace__list-item--active" : ""}`}
                  onClick={() => handleSelectItem(item)}
                >
                  <ChatAvatar
                    displayName={item.counterpart.displayName}
                    role={item.counterpart.role}
                    avatarUrl={item.counterpart.avatarUrl}
                  />

                  <span className="chat-workspace__list-content">
                    <span className="chat-workspace__list-main">
                      <span className="chat-workspace__list-name">{counterpartTitle}</span>
                      <span className="chat-workspace__presence-row">
                        <span
                          className={`chat-workspace__status${item.counterpart.isOnline ? " chat-workspace__status--online" : ""}`}
                        />
                        <span className="chat-workspace__presence-text">
                          {formatPresenceStatus({
                            isOnline: item.counterpart.isOnline,
                            lastSeenAt: item.counterpart.lastSeenAt,
                          })}
                        </span>
                      </span>
                    </span>
                    <span className="chat-workspace__list-meta">
                      <span className="chat-workspace__list-preview">{item.previewText}</span>
                      <span
                        className={
                          item.updatedAt
                            ? "chat-workspace__list-time"
                            : "chat-workspace__list-time chat-workspace__list-time--empty"
                        }
                      >
                        {item.updatedAt ? formatTime(item.updatedAt) : "00:00"}
                      </span>
                    </span>
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
              {(() => {
                const activeCounterpartTitle = resolveParticipantTitle(activeCounterpart);

                return (
                  <>
              <header className="chat-workspace__thread-header">
                <div className="chat-workspace__thread-title-group">
                  <ChatAvatar
                    displayName={activeCounterpartTitle}
                    role={activeCounterpart.role}
                    avatarUrl={activeCounterpart.avatarUrl}
                  />
                  <div>
                    <h2 className="chat-workspace__thread-name">{activeCounterpartTitle}</h2>
                    <p className="chat-workspace__thread-meta">
                      <span
                        className={`chat-workspace__status${activeCounterpart.isOnline ? " chat-workspace__status--online" : ""}`}
                      />
                      <span>
                        {formatPresenceStatus({
                          isOnline: activeCounterpart.isOnline,
                          lastSeenAt: activeCounterpart.lastSeenAt,
                        })}
                      </span>
                    </p>
                  </div>
                </div>
              </header>

              <div className="chat-workspace__messages" ref={messagesContainerRef}>
                <div className="chat-workspace__messages-inner">
                  {activeConversation ? (
                    messageDayGroups.map((group) => (
                      <div key={group.dayKey} className="chat-workspace__day-group">
                        <div className="chat-workspace__date-divider">
                          <span className="chat-workspace__date-divider-label">{group.dateLabel}</span>
                        </div>
                        {group.messages.map(({ item, isCompactGap, shouldShowAvatar }) => (
                          <div key={item.id} className="chat-workspace__message-entry">
                            <div
                              className={`chat-workspace__message${item.isOwn ? " chat-workspace__message--own" : ""}${item.clientStatus === "failed" ? " chat-workspace__message--failed" : ""}${isCompactGap ? " chat-workspace__message--compact" : ""}${item.isOwn && currentRole === "applicant" ? " chat-workspace__message--own-applicant" : ""}${item.isOwn && currentRole === "employer" ? " chat-workspace__message--own-employer" : ""}`}
                            >
                              {!item.isOwn && shouldShowAvatar ? (
                                <ChatAvatar
                                  displayName={activeCounterpart.displayName}
                                  role={activeCounterpart.role}
                                  avatarUrl={activeCounterpart.avatarUrl}
                                />
                              ) : !item.isOwn ? (
                                <span className="chat-workspace__avatar chat-workspace__avatar--spacer" aria-hidden="true" />
                              ) : null}

                              <div className="chat-workspace__message-body">
                                <p className="chat-workspace__message-text">
                                  {decryptedMessageMap[item.id] ?? "Расшифровка сообщения..."}
                                </p>
                                <div className="chat-workspace__message-meta">
                                  <span>{formatTime(item.createdAt)}</span>
                                  {item.isOwn ? (
                                    item.clientStatus === "failed" ? (
                                      <button
                                        type="button"
                                        className="chat-workspace__message-retry"
                                        onClick={() =>
                                          void handleSendMessage({
                                            messageId: item.id,
                                            text: item.clientText,
                                            createdAt: item.createdAt,
                                          })
                                        }
                                      >
                                        Не отправлено. Повторить
                                      </button>
                                    ) : (
                                      <span
                                        className={`chat-workspace__message-status${item.clientStatus === "sending" ? " chat-workspace__message-status--sending" : item.isReadByPeer ? " chat-workspace__message-status--read" : " chat-workspace__message-status--delivered"}`}
                                        aria-label={
                                          item.clientStatus === "sending"
                                            ? "Отправляется"
                                            : item.isReadByPeer
                                              ? "Прочитано"
                                              : "Доставлено"
                                        }
                                        title={
                                          item.clientStatus === "sending"
                                            ? "Отправляется"
                                            : item.isReadByPeer
                                              ? "Прочитано"
                                              : "Доставлено"
                                        }
                                      >
                                        <span
                                          className={`chat-workspace__message-status-icon${item.isReadByPeer ? " chat-workspace__message-status-icon--read" : " chat-workspace__message-status-icon--check"}`}
                                          aria-hidden="true"
                                        />
                                      </span>
                                    )
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <div className="chat-workspace__placeholder">
                      <h2 className="chat-workspace__empty-title">{emptyTitle}</h2>
                      <p className="chat-workspace__empty-text">{emptyText}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="chat-workspace__composer">
                <div className="chat-workspace__composer-row">
                  <button
                    type="button"
                    className="chat-workspace__composer-attach"
                    aria-label="Прикрепить файл"
                  >
                    <img src={clipIcon} alt="" aria-hidden="true" className="chat-workspace__composer-attach-icon" />
                  </button>
                  <Input
                    type="text"
                    className="chat-workspace__composer-input input--sm"
                    placeholder="Сообщение..."
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.nativeEvent.isComposing) {
                        return;
                      }
                      event.preventDefault();
                      void handleSendMessage();
                    }}
                    clearable={false}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="chat-workspace__composer-send"
                    onClick={() => void handleSendMessage()}
                    aria-label="Отправить сообщение"
                  >
                    <img src={arrowIcon} alt="" aria-hidden="true" className="chat-workspace__composer-send-icon" />
                  </Button>
                </div>
              </div>
                  </>
                );
              })()}
            </>
          ) : (
            <div className="chat-workspace__placeholder">
              <h2 className="chat-workspace__empty-title">{emptyTitle}</h2>
              <p className="chat-workspace__empty-text">{emptyText}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
