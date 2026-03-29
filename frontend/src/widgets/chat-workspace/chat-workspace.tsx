import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import arrowIcon from "../../assets/icons/arrow.svg";
import clipIcon from "../../assets/icons/clip.svg";
import logoPrimaryBlack from "../../assets/icons/logo-primary-black.svg";
import { useAuthStore } from "../../features/auth";
import {
  canUseChatCrypto,
  ChatContact,
  ChatConversation,
  ChatMessage,
  ChatParticipant,
  createChatConversationRequest,
  deleteChatMessageRequest,
  decryptChatMessage,
  encryptChatMessage,
  ensureChatKeyPair,
  getMyChatKeyRequest,
  getStoredChatKeyPair,
  isPlaintextChatMessage,
  listChatConversationsRequest,
  listChatMessagesRequest,
  markChatConversationReadRequest,
  searchChatContactsRequest,
  sendChatMessageRequest,
  storeChatKeyPair,
  updateChatMessageRequest,
  upsertMyChatKeyRequest,
  useChatRealtime,
} from "../../features/chat";
import { abbreviateLegalEntityName, formatPresenceStatus, resolveAvatarIcon, resolveAvatarUrl } from "../../shared/lib";
import { Button, Input } from "../../shared/ui";
import "./chat-workspace.css";

type ChatWorkspaceProps = {
  title: string;
  subtitle?: string;
  emptyTitle: string;
  emptyText: string;
  preferredEmployerId?: string | null;
};

type ConversationListItem = {
  id: string;
  counterpart: ChatConversation["counterpart"];
  unreadCount: number;
  previewText: string;
  updatedAt: string;
};

type ChatMessageView = ChatMessage & {
  clientStatus?: "sending";
  clientText?: string;
};

const EMPTY_CONVERSATIONS: ChatConversation[] = [];
const EMPTY_CONTACTS: ChatContact[] = [];
const EMPTY_MESSAGES: ChatMessageView[] = [];
const CHAT_LIST_SKELETON_COUNT = 5;
const CHAT_MESSAGE_SKELETON_COUNT = 4;
const SYSTEM_CHAT_ID = "tramplin-notes";
const SYSTEM_WELCOME_MESSAGE_ID = "tramplin-welcome";
const SYSTEM_PARTICIPANT_ID = "tramplin-system";
const SYSTEM_NOTES_STORAGE_KEY_PREFIX = "tramplin.chat.notes";
const SYSTEM_WELCOME_AT_STORAGE_KEY_PREFIX = "tramplin.chat.welcome-at";

type LocalNoteRecord = {
  id: string;
  text: string;
  createdAt: string;
};

function readAccessTokenSubject(token: string | null) {
  if (!token || typeof window === "undefined") {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decodedPayload = window.atob(normalizedPayload);
    return (JSON.parse(decodedPayload) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

function getNotesStorageKey(subject: string | null, role: string | null) {
  return `${SYSTEM_NOTES_STORAGE_KEY_PREFIX}:${subject ?? "guest"}:${role ?? "unknown"}`;
}

function getWelcomeAtStorageKey(subject: string | null, role: string | null) {
  return `${SYSTEM_WELCOME_AT_STORAGE_KEY_PREFIX}:${subject ?? "guest"}:${role ?? "unknown"}`;
}

function readStoredNotes(subject: string | null, role: string | null): LocalNoteRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(getNotesStorageKey(subject, role));
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue) as LocalNoteRecord[];
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      (item): item is LocalNoteRecord =>
        typeof item?.id === "string" && typeof item?.text === "string" && typeof item?.createdAt === "string",
    );
  } catch {
    return [];
  }
}

function writeStoredNotes(subject: string | null, role: string | null, notes: LocalNoteRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getNotesStorageKey(subject, role), JSON.stringify(notes));
}

function readOrCreateWelcomeAt(subject: string | null, role: string | null) {
  if (typeof window === "undefined") {
    return new Date().toISOString();
  }

  const storageKey = getWelcomeAtStorageKey(subject, role);
  const existingValue = window.localStorage.getItem(storageKey);
  if (existingValue) {
    return existingValue;
  }

  const nextValue = new Date().toISOString();
  window.localStorage.setItem(storageKey, nextValue);
  return nextValue;
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
  unreadCount = 0,
}: {
  displayName: string;
  role: string;
  avatarUrl: string | null;
  unreadCount?: number;
}) {
  const imageSource = resolveAvatarUrl(avatarUrl) || resolveAvatarIcon(role);
  const isBrandAvatar = avatarUrl === logoPrimaryBlack;

  return (
    <span className="chat-workspace__avatar">
      <img
        src={imageSource}
        alt={displayName}
        className={
          avatarUrl
            ? isBrandAvatar
              ? "chat-workspace__avatar-image chat-workspace__avatar-image--brand"
              : "chat-workspace__avatar-image chat-workspace__avatar-image--uploaded"
            : "chat-workspace__avatar-image"
        }
      />
      {unreadCount > 0 ? <span className="chat-workspace__avatar-unread">{unreadCount}</span> : null}
    </span>
  );
}

function ChatWorkspaceSkeleton({ className }: { className: string }) {
  return <span className={`chat-workspace__skeleton ${className}`} aria-hidden="true" />;
}

export function ChatWorkspace({
  title,
  subtitle,
  emptyTitle,
  emptyText,
  preferredEmployerId = null,
}: ChatWorkspaceProps) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const currentRole = useAuthStore((state) => state.role);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeDraftContact, setActiveDraftContact] = useState<ChatContact | null>(null);
  const [messageMenu, setMessageMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [keyPair, setKeyPair] = useState<Awaited<ReturnType<typeof ensureChatKeyPair>> | null>(null);
  const [decryptedPreviewMap, setDecryptedPreviewMap] = useState<Record<string, string>>({});
  const [decryptedMessageMap, setDecryptedMessageMap] = useState<Record<string, string>>({});
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessageView[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState<LocalNoteRecord[]>([]);
  const [systemWelcomeAt, setSystemWelcomeAt] = useState(() => new Date().toISOString());
  const deferredSearchValue = useDeferredValue(searchValue);
  const currentUserId = useMemo(() => readAccessTokenSubject(accessToken), [accessToken]);

  useEffect(() => {
    setLocalNotes(readStoredNotes(currentUserId, currentRole ?? null));
  }, [currentRole, currentUserId]);

  useEffect(() => {
    setSystemWelcomeAt(readOrCreateWelcomeAt(currentUserId, currentRole ?? null));
  }, [currentRole, currentUserId]);

  const persistLocalNotes = (nextNotes: LocalNoteRecord[]) => {
    setLocalNotes(nextNotes);
    writeStoredNotes(currentUserId, currentRole ?? null, nextNotes);
  };

  const conversationsQuery = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: listChatConversationsRequest,
    enabled: isHydrated && Boolean(accessToken),
    staleTime: 10_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const normalizedSearchValue = deferredSearchValue.trim();
  const searchQuery = useQuery({
    queryKey: ["chat", "search", normalizedSearchValue, preferredEmployerId ?? ""],
    queryFn: () =>
      searchChatContactsRequest({
        query: normalizedSearchValue,
        employerId: preferredEmployerId,
      }),
    enabled: isHydrated && Boolean(accessToken) && (Boolean(normalizedSearchValue) || Boolean(preferredEmployerId)),
    staleTime: 5_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const storedPair = getStoredChatKeyPair();
      const remotePair = await getMyChatKeyRequest();
      if (!storedPair && remotePair?.publicKeyJwk && !remotePair.privateKeyJwk) {
        return;
      }

      const pair =
        storedPair ??
        (remotePair?.privateKeyJwk
          ? {
              algorithm: remotePair.algorithm,
              publicKeyJwk: remotePair.publicKeyJwk,
              privateKeyJwk: remotePair.privateKeyJwk,
            }
          : await ensureChatKeyPair());
      if (!isMounted) {
        return;
      }
      storeChatKeyPair(pair);
      setKeyPair(pair);
      await upsertMyChatKeyRequest({
        algorithm: pair.algorithm,
        public_key_jwk: pair.publicKeyJwk,
        private_key_jwk: pair.privateKeyJwk,
      });
    })().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  useChatRealtime(() => {
    void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["chat", "messages"] });
    void queryClient.invalidateQueries({ queryKey: ["chat", "search"] });
  });

  const conversations = conversationsQuery.data ?? EMPTY_CONVERSATIONS;
  const searchResults = searchQuery.data ?? EMPTY_CONTACTS;
  const isConversationListLoading = conversationsQuery.isLoading;
  const isSearchLoading = searchQuery.isLoading;

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
    enabled:
      isHydrated &&
      Boolean(accessToken && activeConversationId && activeConversationId !== SYSTEM_CHAT_ID && conversationMap[activeConversationId]),
    staleTime: 5_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const serverMessages = activeConversationId ? ((messagesQuery.data as ChatMessageView[] | undefined) ?? EMPTY_MESSAGES) : EMPTY_MESSAGES;
  const isMessagesLoading = messagesQuery.isLoading;
  const activeThreadKey = activeConversationId ?? (activeDraftContact ? `draft:${activeDraftContact.userId}:${activeDraftContact.employerId ?? "none"}` : null);
  const activeMessages = useMemo(() => {
    if (!activeThreadKey) {
      return EMPTY_MESSAGES;
    }

    const pendingMessages = optimisticMessages.filter((item) => item.conversationId === activeThreadKey);
    return [...serverMessages, ...pendingMessages].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
  }, [activeThreadKey, optimisticMessages, serverMessages]);

  const systemWelcomeMessage = useMemo<ChatMessageView>(
    () => ({
      id: SYSTEM_WELCOME_MESSAGE_ID,
      conversationId: SYSTEM_CHAT_ID,
      senderUserId: SYSTEM_PARTICIPANT_ID,
      senderRole: "admin",
      ciphertext: "",
      iv: "",
      salt: "",
      createdAt: systemWelcomeAt,
      isOwn: false,
      isReadByPeer: true,
      clientText:
        "👋 Привет! Это чат Трамплина.\n\nИспользуйте его как личные заметки: фиксируйте идеи, задачи, важные вакансии и всё, к чему хотите вернуться позже.",
    }),
    [systemWelcomeAt],
  );

  const systemMessages = useMemo<ChatMessageView[]>(
    () => [
      systemWelcomeMessage,
      ...localNotes.map((note) => ({
        id: note.id,
        conversationId: SYSTEM_CHAT_ID,
        senderUserId: currentUserId ?? "local-user",
        senderRole: currentRole ?? "applicant",
        ciphertext: "",
        iv: "",
        salt: "",
        createdAt: note.createdAt,
        isOwn: true,
        isReadByPeer: true,
        clientText: note.text,
      })),
    ],
    [currentRole, currentUserId, localNotes, systemWelcomeMessage],
  );

  const systemCounterpart = useMemo<ChatParticipant>(
    () => ({
      userId: SYSTEM_PARTICIPANT_ID,
      publicId: null,
      displayName: "Трамплин",
      role: "admin",
      avatarUrl: logoPrimaryBlack,
      companyName: null,
      companyId: null,
      publicKeyJwk: null,
      isOnline: true,
      lastSeenAt: null,
    }),
    [],
  );

  const systemConversationItem = useMemo<ConversationListItem>(() => {
    const lastSystemMessage = systemMessages[systemMessages.length - 1] ?? systemWelcomeMessage;

    return {
      id: SYSTEM_CHAT_ID,
      counterpart: systemCounterpart,
      unreadCount: 0,
      previewText: lastSystemMessage.clientText ?? "Ваши заметки",
      updatedAt: lastSystemMessage.createdAt,
    };
  }, [systemCounterpart, systemMessages, systemWelcomeMessage]);

  const conversationItems = useMemo<ConversationListItem[]>(
    () => [
      systemConversationItem,
      ...conversations.map((item) => ({
        id: item.id,
        counterpart: item.counterpart,
        unreadCount: item.unreadCount,
        previewText: item.lastMessage ? (decryptedPreviewMap[item.id] ?? "Сообщение") : "Нет сообщений",
        updatedAt: item.updatedAt,
      })),
    ],
    [conversations, decryptedPreviewMap, systemConversationItem],
  );

  const resolveExistingConversationId = (contact: Pick<ChatContact, "conversationId" | "userId" | "publicId" | "employerId" | "role">) => {
    if (contact.conversationId && conversationMap[contact.conversationId]) {
      return contact.conversationId;
    }

    const matchedConversation = conversations.find((item) => {
      if (item.counterpart.userId === contact.userId) {
        return true;
      }

      if (contact.publicId && item.counterpart.publicId === contact.publicId) {
        return true;
      }

      if (contact.role === "employer" && contact.employerId && item.counterpart.companyId === contact.employerId) {
        return true;
      }

      return false;
    });

    return matchedConversation?.id ?? null;
  };

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }
    if (activeConversationId === SYSTEM_CHAT_ID) {
      return;
    }
    if (conversationMap[activeConversationId]) {
      return;
    }
    setActiveConversationId(null);
  }, [activeConversationId, conversationMap]);

  useEffect(() => {
    if (activeConversationId || activeDraftContact || normalizedSearchValue) {
      return;
    }

    setActiveConversationId(SYSTEM_CHAT_ID);
  }, [activeConversationId, activeDraftContact, normalizedSearchValue]);

  useEffect(() => {
    if (!preferredEmployerId || normalizedSearchValue || activeConversationId || activeDraftContact) {
      return;
    }

    const preferredContact = searchResults.find((item) => item.employerId === preferredEmployerId);
    if (!preferredContact) {
      return;
    }

    const existingConversationId = resolveExistingConversationId(preferredContact);
    if (existingConversationId) {
      setActiveConversationId(existingConversationId);
      setActiveDraftContact(null);
      return;
    }

    setActiveDraftContact(preferredContact);
  }, [
    activeConversationId,
    activeDraftContact,
    normalizedSearchValue,
    preferredEmployerId,
    searchResults,
  ]);

  useEffect(() => {
    if (!messageMenu) {
      return;
    }

    const handlePointerDown = () => setMessageMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMessageMenu(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [messageMenu]);

  const activeSystemConversation = activeConversationId === SYSTEM_CHAT_ID;
  const activeConversation = activeConversationId && !activeSystemConversation ? conversationMap[activeConversationId] ?? null : null;
  const activeCounterpart: ChatParticipant | null = useMemo(() => {
    if (activeSystemConversation) {
      return systemCounterpart;
    }
    if (activeConversation) {
      return activeConversation.counterpart;
    }
    if (!activeDraftContact) {
      return null;
    }
    return {
      userId: activeDraftContact.userId,
      publicId: activeDraftContact.publicId,
      displayName: activeDraftContact.displayName,
      role: activeDraftContact.role,
      avatarUrl: activeDraftContact.avatarUrl,
      companyName: activeDraftContact.companyName,
      companyId: activeDraftContact.employerId,
      publicKeyJwk: activeDraftContact.publicKeyJwk,
      isOnline: activeDraftContact.isOnline,
      lastSeenAt: activeDraftContact.lastSeenAt,
    };
  }, [activeConversation, activeDraftContact, activeSystemConversation, systemCounterpart]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const nextPreviewMap: Record<string, string> = {};
      for (const item of conversations) {
        if (!item.lastMessage) {
          continue;
        }

        try {
          if (isPlaintextChatMessage(item.lastMessage.ciphertext)) {
            nextPreviewMap[item.id] = await decryptChatMessage({
              ciphertext: item.lastMessage.ciphertext,
              iv: item.lastMessage.iv,
              salt: item.lastMessage.salt,
              conversationId: item.id,
            });
            continue;
          }

          if (!keyPair) {
            nextPreviewMap[item.id] = "Сообщение";
            continue;
          }

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
    if (activeSystemConversation) {
      return;
    }

    if (!activeConversation || !activeCounterpart) {
      return;
    }

    let isMounted = true;

    void (async () => {
      const nextMessageMap: Record<string, string> = {};
      for (const item of activeMessages) {
        if (item.clientText) {
          nextMessageMap[item.id] = item.clientText;
          continue;
        }

        try {
          if (isPlaintextChatMessage(item.ciphertext)) {
            nextMessageMap[item.id] = await decryptChatMessage({
              ciphertext: item.ciphertext,
              iv: item.iv,
              salt: item.salt,
              conversationId: item.conversationId,
            });
            continue;
          }

          if (!keyPair) {
            nextMessageMap[item.id] = "Сообщение";
            continue;
          }

          nextMessageMap[item.id] = await decryptChatMessage({
            ciphertext: item.ciphertext,
            iv: item.iv,
            salt: item.salt,
            ownPrivateKeyJwk: keyPair.privateKeyJwk,
            counterpartPublicKeyJwk: activeCounterpart.publicKeyJwk,
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
  }, [activeConversation, activeCounterpart, activeMessages, activeSystemConversation, keyPair]);

  useEffect(() => {
    if (!activeConversationId || !activeConversation || activeConversation.unreadCount <= 0) {
      return;
    }

    void markChatConversationReadRequest(activeConversationId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeConversationId] });
    });
  }, [activeConversation, activeConversationId, queryClient]);

  const messageDayGroups = useMemo(() => {
    const sourceMessages = activeSystemConversation ? systemMessages : activeMessages;
    const groups: Array<{
      dayKey: string;
      dateLabel: string;
      messages: ChatMessageView[];
    }> = [];

    sourceMessages.forEach((message) => {
      const dayKey = startOfDay(new Date(message.createdAt)).toISOString();
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.dayKey !== dayKey) {
        groups.push({
          dayKey,
          dateLabel: formatChatDateLabel(message.createdAt),
          messages: [message],
        });
        return;
      }
      lastGroup.messages.push(message);
    });

    return groups;
  }, [activeMessages, activeSystemConversation, systemMessages]);

  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [activeConversationId, messageDayGroups.length, activeMessages.length, systemMessages.length]);

  const handleSelectConversation = (conversationId: string) => {
    setEditingMessageId(null);
    setMessageDraft("");
    setComposerError(null);
    setActiveDraftContact(null);
    setActiveConversationId(conversationId);
  };

  const handleSelectSearchContact = (contact: ChatContact) => {
    setMessageDraft("");
    setEditingMessageId(null);
    setComposerError(null);
    const existingConversationId = resolveExistingConversationId(contact);
    if (existingConversationId) {
      setActiveDraftContact(null);
      setActiveConversationId(existingConversationId);
      return;
    }
    setActiveConversationId(null);
    setActiveDraftContact(contact);
  };

  const handleStartEditMessage = (message: ChatMessageView) => {
    setMessageMenu(null);
    setEditingMessageId(message.id);
    setMessageDraft(decryptedMessageMap[message.id] ?? message.clientText ?? "");
  };

  const handleCancelEditing = () => {
    setEditingMessageId(null);
    setMessageDraft("");
    setComposerError(null);
  };

  const handleDeleteMessage = async (message: ChatMessageView) => {
    setMessageMenu(null);
    if (activeSystemConversation) {
      const nextNotes = localNotes.filter((item) => item.id !== message.id);
      persistLocalNotes(nextNotes);
      setDecryptedMessageMap((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[message.id];
        return nextValue;
      });

      if (editingMessageId === message.id) {
        handleCancelEditing();
      }
      return;
    }

    if (!activeConversation) {
      return;
    }

    await deleteChatMessageRequest(message.id);
    setDecryptedMessageMap((currentValue) => {
      const nextValue = { ...currentValue };
      delete nextValue[message.id];
      return nextValue;
    });

    if (editingMessageId === message.id) {
      handleCancelEditing();
    }

    void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeConversation.id] });
  };

  const handleSendMessage = async () => {
    if (!activeCounterpart || isSendingMessage) {
      return;
    }

    const trimmedMessage = messageDraft.trim();
    if (!trimmedMessage) {
      return;
    }

    setComposerError(null);

    if (activeSystemConversation) {
      if (editingMessageId) {
        const nextNotes = localNotes.map((item) => (item.id === editingMessageId ? { ...item, text: trimmedMessage } : item));
        persistLocalNotes(nextNotes);
        setDecryptedMessageMap((currentValue) => ({
          ...currentValue,
          [editingMessageId]: trimmedMessage,
        }));
        handleCancelEditing();
        return;
      }

      const noteId = `tramplin-note:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date().toISOString();
      persistLocalNotes([...localNotes, { id: noteId, text: trimmedMessage, createdAt }]);
      setDecryptedMessageMap((currentValue) => ({
        ...currentValue,
        [noteId]: trimmedMessage,
      }));
      setMessageDraft("");
      return;
    }

    let activeKeyPair = keyPair;
    if (canUseChatCrypto() && !activeKeyPair) {
      try {
        activeKeyPair = await ensureChatKeyPair();
        storeChatKeyPair(activeKeyPair);
        setKeyPair(activeKeyPair);
        await upsertMyChatKeyRequest({
          algorithm: activeKeyPair.algorithm,
          public_key_jwk: activeKeyPair.publicKeyJwk,
          private_key_jwk: activeKeyPair.privateKeyJwk,
        });
      } catch (error) {
        console.error("chat.send.bootstrap_failed", error);
        setComposerError("Не удалось подготовить чат для отправки сообщения.");
        return;
      }
    }

    if (editingMessageId && activeConversation) {
      setIsSendingMessage(true);
      try {
        const encryptedMessage = await encryptChatMessage({
          plaintext: trimmedMessage,
          ownPrivateKeyJwk: activeKeyPair?.privateKeyJwk ?? null,
          counterpartPublicKeyJwk: activeCounterpart.publicKeyJwk,
          conversationId: activeConversation.id,
        });

        const updatedMessage = await updateChatMessageRequest(editingMessageId, {
          ciphertext: encryptedMessage.ciphertext,
          iv: encryptedMessage.iv,
          salt: encryptedMessage.salt,
        });

        setDecryptedMessageMap((currentValue) => ({
          ...currentValue,
          [updatedMessage.id]: trimmedMessage,
        }));
        setDecryptedPreviewMap((currentValue) => ({
          ...currentValue,
          [activeConversation.id]:
            activeConversation.lastMessage?.id === updatedMessage.id ? trimmedMessage : currentValue[activeConversation.id],
        }));
        handleCancelEditing();
        void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeConversation.id] });
      } catch (error) {
        console.error("chat.update.failed", error);
        setComposerError("Не удалось обновить сообщение.");
      } finally {
        setIsSendingMessage(false);
      }
      return;
    }

    const createdAt = new Date().toISOString();
    const optimisticMessageId = `optimistic:${createdAt}:${Math.random().toString(36).slice(2, 8)}`;
    const optimisticConversationId = activeConversation?.id ?? `draft:${activeCounterpart.userId}:${activeCounterpart.companyId ?? "none"}`;

    setOptimisticMessages((currentValue) => [
      ...currentValue,
      {
        id: optimisticMessageId,
        conversationId: optimisticConversationId,
        senderUserId: "",
        senderRole: currentRole ?? activeCounterpart.role,
        ciphertext: "",
        iv: "",
        salt: "",
        createdAt,
        isOwn: true,
        isReadByPeer: false,
        clientStatus: "sending",
        clientText: trimmedMessage,
      },
    ]);
    setDecryptedMessageMap((currentValue) => ({
      ...currentValue,
      [optimisticMessageId]: trimmedMessage,
    }));
    setMessageDraft("");

    setIsSendingMessage(true);

    try {
      const targetConversation =
        activeConversation ??
        (await createChatConversationRequest({
          recipient_user_id: activeCounterpart.userId,
          employer_id: activeCounterpart.companyId ?? undefined,
        }));

      const encryptedMessage = await encryptChatMessage({
        plaintext: trimmedMessage,
        ownPrivateKeyJwk: activeKeyPair?.privateKeyJwk ?? null,
        counterpartPublicKeyJwk: activeCounterpart.publicKeyJwk,
        conversationId: targetConversation.id,
      });

      const sentMessage = await sendChatMessageRequest({
        conversation_id: targetConversation.id,
        ciphertext: encryptedMessage.ciphertext,
        iv: encryptedMessage.iv,
        salt: encryptedMessage.salt,
      });

      setOptimisticMessages((currentValue) => currentValue.filter((item) => item.id !== optimisticMessageId));
      setActiveDraftContact(null);
      setActiveConversationId(sentMessage.conversationId);
      setDecryptedMessageMap((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[optimisticMessageId];
        nextValue[sentMessage.id] = trimmedMessage;
        return nextValue;
      });
      setDecryptedPreviewMap((currentValue) => ({
        ...currentValue,
        [sentMessage.conversationId]: trimmedMessage,
      }));
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "messages", sentMessage.conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "search"] });
    } catch (error) {
      console.error("chat.send.failed", error);
      setOptimisticMessages((currentValue) => currentValue.filter((item) => item.id !== optimisticMessageId));
      setDecryptedMessageMap((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[optimisticMessageId];
        return nextValue;
      });
      setMessageDraft(trimmedMessage);
      setComposerError("Не удалось отправить сообщение. Попробуйте ещё раз.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  const showSearchResults = Boolean(normalizedSearchValue);
  const activeCounterpartTitle = activeCounterpart ? resolveParticipantTitle(activeCounterpart) : null;
  const visibleMessages = activeSystemConversation ? systemMessages : activeMessages;

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
          <label className="chat-workspace__search header__search" aria-label="Поиск пользователей">
            <Input
              type="search"
              placeholder={currentRole === "employer" ? "Поиск соискателей" : "Поиск пользователей"}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className="input--sm chat-workspace__search-input"
            />
          </label>

          {showSearchResults ? (
            <div className="chat-workspace__list chat-workspace__list--search">
              {isSearchLoading
                ? Array.from({ length: 3 }, (_, index) => (
                    <div key={`chat-search-skeleton-${index}`} className="chat-workspace__list-item chat-workspace__list-item--skeleton">
                      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--avatar" />
                      <span className="chat-workspace__list-content">
                        <span className="chat-workspace__list-main">
                          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--list-name" />
                          <span className="chat-workspace__presence-row">
                            <ChatWorkspaceSkeleton className="chat-workspace__skeleton--status-dot" />
                            <ChatWorkspaceSkeleton className="chat-workspace__skeleton--presence" />
                          </span>
                        </span>
                        <span className="chat-workspace__list-meta">
                          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--preview" />
                        </span>
                      </span>
                    </div>
                  ))
                : null}
              {!isSearchLoading && searchResults.length === 0 ? (
                <div className="chat-workspace__hint">Ничего не нашлось</div>
              ) : null}
              {searchResults.map((item) => {
                const isActive =
                  item.conversationId === activeConversationId ||
                  (!item.conversationId && activeDraftContact?.userId === item.userId && activeDraftContact?.employerId === item.employerId);
                const counterpartTitle =
                  item.role === "employer" && item.companyName
                    ? abbreviateLegalEntityName(item.companyName)
                    : item.displayName;

                return (
                  <button
                    key={`${item.userId}:${item.employerId ?? "none"}`}
                    type="button"
                    className={`chat-workspace__list-item${isActive ? " chat-workspace__list-item--active" : ""}`}
                    onClick={() => handleSelectSearchContact(item)}
                  >
                    <ChatAvatar displayName={item.displayName} role={item.role} avatarUrl={item.avatarUrl} />
                    <span className="chat-workspace__list-content">
                      <span className="chat-workspace__list-main">
                        <span className="chat-workspace__list-name">{counterpartTitle}</span>
                        <span className="chat-workspace__presence-row">
                          <span className={`chat-workspace__status${item.isOnline ? " chat-workspace__status--online" : ""}`} />
                          <span className="chat-workspace__presence-text">
                            {formatPresenceStatus({
                              isOnline: item.isOnline,
                              lastSeenAt: item.lastSeenAt,
                            })}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="chat-workspace__list">
            {isConversationListLoading ? (
              Array.from({ length: CHAT_LIST_SKELETON_COUNT }, (_, index) => (
                <div key={`chat-list-skeleton-${index}`} className="chat-workspace__list-item chat-workspace__list-item--skeleton">
                  <ChatWorkspaceSkeleton className="chat-workspace__skeleton--avatar" />
                  <span className="chat-workspace__list-content">
                    <span className="chat-workspace__list-main">
                      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--list-name" />
                      <span className="chat-workspace__presence-row">
                        <ChatWorkspaceSkeleton className="chat-workspace__skeleton--status-dot" />
                        <ChatWorkspaceSkeleton className="chat-workspace__skeleton--presence" />
                      </span>
                    </span>
                    <span className="chat-workspace__list-meta">
                      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--preview" />
                      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--time" />
                    </span>
                  </span>
                </div>
              ))
            ) : conversationItems.length === 0 ? (
              <div className="chat-workspace__hint">Пока нет чатов</div>
            ) : (
              conversationItems.map((item) => {
                const isActive = item.id === activeConversationId;
                const counterpartTitle = resolveParticipantTitle(item.counterpart);

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`chat-workspace__list-item${isActive ? " chat-workspace__list-item--active" : ""}`}
                    onClick={() => handleSelectConversation(item.id)}
                  >
                    <ChatAvatar
                      displayName={item.counterpart.displayName}
                      role={item.counterpart.role}
                      avatarUrl={item.counterpart.avatarUrl}
                      unreadCount={item.unreadCount}
                    />
                    <span className="chat-workspace__list-content">
                      <span className="chat-workspace__list-main">
                        <span className="chat-workspace__list-name">{counterpartTitle}</span>
                        <span className="chat-workspace__presence-row">
                          <span
                            className={`chat-workspace__status${item.counterpart.isOnline ? " chat-workspace__status--online" : ""}`}
                          />
                          <span className="chat-workspace__presence-text">
                            {item.id === SYSTEM_CHAT_ID
                              ? "Личные заметки"
                              : formatPresenceStatus({
                                  isOnline: item.counterpart.isOnline,
                                  lastSeenAt: item.counterpart.lastSeenAt,
                                })}
                          </span>
                        </span>
                      </span>
                      <span className="chat-workspace__list-meta">
                        <span className="chat-workspace__list-preview">{item.previewText}</span>
                        <span className="chat-workspace__list-time">{formatTime(item.updatedAt)}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="chat-workspace__content">
          {activeCounterpart && activeCounterpartTitle ? (
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
                      <span className={`chat-workspace__status${activeCounterpart.isOnline ? " chat-workspace__status--online" : ""}`} />
                      <span>
                        {activeSystemConversation
                          ? "Чат-помощник и заметки"
                          : formatPresenceStatus({
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
                  {activeConversation && isMessagesLoading ? (
                    <div className="chat-workspace__messages-skeleton">
                      {Array.from({ length: CHAT_MESSAGE_SKELETON_COUNT }, (_, index) => {
                        const isOwn = index % 2 === 1;

                        return (
                          <div
                            key={`chat-message-skeleton-${index}`}
                            className={`chat-workspace__message-skeleton-row${isOwn ? " chat-workspace__message-skeleton-row--own" : ""}`}
                          >
                            {!isOwn ? (
                              <ChatWorkspaceSkeleton className="chat-workspace__skeleton--avatar chat-workspace__skeleton--avatar-small" />
                            ) : null}
                            <div className="chat-workspace__message-skeleton-bubble">
                              <ChatWorkspaceSkeleton className="chat-workspace__skeleton--message-line" />
                              <ChatWorkspaceSkeleton className={`chat-workspace__skeleton--message-line${index % 2 === 0 ? " chat-workspace__skeleton--message-line-short" : ""}`} />
                              <ChatWorkspaceSkeleton className="chat-workspace__skeleton--message-meta" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : activeSystemConversation || activeConversation || activeMessages.length > 0 ? (
                    messageDayGroups.map((group) => (
                      <div key={group.dayKey} className="chat-workspace__day-group">
                        <div className="chat-workspace__date-divider">
                          <span className="chat-workspace__date-divider-label">{group.dateLabel}</span>
                        </div>
                        {group.messages.map((item) => (
                          <div key={item.id} className="chat-workspace__message-entry">
                            <div
                              className={`chat-workspace__message${item.isOwn ? " chat-workspace__message--own" : ""}`}
                              onContextMenu={(event) => {
                                if (!item.isOwn || item.clientStatus) {
                                  return;
                                }
                                event.preventDefault();
                                setMessageMenu({
                                  messageId: item.id,
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                            >
                              {!item.isOwn ? (
                                <ChatAvatar
                                  displayName={activeCounterpart.displayName}
                                  role={activeCounterpart.role}
                                  avatarUrl={activeCounterpart.avatarUrl}
                                />
                              ) : null}
                              <div className="chat-workspace__message-body">
                                <p className="chat-workspace__message-text">
                                  {decryptedMessageMap[item.id] ?? item.clientText ?? "Расшифровка сообщения..."}
                                </p>
                                <div className="chat-workspace__message-meta">
                                  <span>{formatTime(item.createdAt)}</span>
                                  {item.isOwn ? (
                                    <span
                                      className={`chat-workspace__message-status${item.clientStatus === "sending" ? " chat-workspace__message-status--sending" : item.isReadByPeer ? " chat-workspace__message-status--read" : " chat-workspace__message-status--delivered"}`}
                                    >
                                      <span
                                        className={`chat-workspace__message-status-icon${item.clientStatus === "sending" ? " chat-workspace__message-status-icon--spinner" : item.isReadByPeer ? " chat-workspace__message-status-icon--read" : " chat-workspace__message-status-icon--check"}`}
                                        aria-hidden="true"
                                      />
                                    </span>
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
                      <h2 className="chat-workspace__empty-title">Новый диалог</h2>
                      <p className="chat-workspace__empty-text">
                        Диалог появится в списке только после первого отправленного сообщения.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="chat-workspace__composer">
                {editingMessageId ? (
                  <div className="chat-workspace__composer-editing">
                    <div className="chat-workspace__composer-editing-copy">
                      <span className="chat-workspace__composer-editing-label">Редактирование сообщения</span>
                      <span className="chat-workspace__composer-editing-text">
                        {decryptedMessageMap[editingMessageId] ?? visibleMessages.find((item) => item.id === editingMessageId)?.clientText ?? ""}
                      </span>
                    </div>
                    <button type="button" className="chat-workspace__composer-editing-cancel" onClick={handleCancelEditing}>
                      Отменить
                    </button>
                  </div>
                ) : null}
                {composerError ? <div className="chat-workspace__composer-error">{composerError}</div> : null}
                <div className="chat-workspace__composer-row">
                  <button type="button" className="chat-workspace__composer-attach" aria-label="Прикрепить файл" disabled>
                    <img src={clipIcon} alt="" aria-hidden="true" className="chat-workspace__composer-attach-icon" />
                  </button>
                  <Input
                    type="text"
                    className="chat-workspace__composer-input input--sm"
                    placeholder="Сообщение..."
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.nativeEvent.isComposing || messagesQuery.isFetching || isSendingMessage) {
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
                    disabled={!messageDraft.trim() || isSendingMessage}
                    loading={isSendingMessage}
                  >
                    <img src={arrowIcon} alt="" aria-hidden="true" className="chat-workspace__composer-send-icon" />
                  </Button>
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
      </div>
      {messageMenu ? (
        <div
          className="chat-workspace__message-menu"
          style={{ top: messageMenu.y, left: messageMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="chat-workspace__message-menu-item"
            onClick={() => {
              const targetMessage = visibleMessages.find((item) => item.id === messageMenu.messageId);
              if (targetMessage) {
                handleStartEditMessage(targetMessage);
              }
            }}
          >
            Редактировать
          </button>
          <button
            type="button"
            className="chat-workspace__message-menu-item chat-workspace__message-menu-item--danger"
            onClick={() => {
              const targetMessage = visibleMessages.find((item) => item.id === messageMenu.messageId);
              if (targetMessage) {
                void handleDeleteMessage(targetMessage);
              }
            }}
          >
            Удалить
          </button>
        </div>
      ) : null}
    </section>
  );
}
