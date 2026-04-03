import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import arrowIcon from "../../assets/icons/arrow.svg";
import checkMarkIcon from "../../assets/icons/check-mark.svg";
import clipIcon from "../../assets/icons/clip.svg";
import contactsIcon from "../../assets/icons/contacts.png";
import jobIcon from "../../assets/icons/job.svg";
import locationIcon from "../../assets/icons/location.svg";
import sadSearchIcon from "../../assets/icons/sad-search.png";
import timeIcon from "../../assets/icons/time.svg";
import { useAuthStore } from "../../features/auth";
import {
  addChatContactRequest,
  areChatKeysEqual,
  canUseChatCrypto,
  ChatContact,
  ChatConversation,
  ChatMessage,
  ChatParticipant,
  clearStoredChatKeyPair,
  createChatConversationRequest,
  deleteChatMessageRequest,
  decryptChatMessage,
  encryptChatMessage,
  ensureChatKeyPair,
  getMyChatKeyRequest,
  listChatContactsRequest,
  getStoredChatKeyPair,
  isPlaintextChatMessage,
  listChatConversationsRequest,
  listChatMessagesRequest,
  migrateLegacyStoredChatKeyPair,
  markChatConversationReadRequest,
  rejectChatContactRequest,
  searchChatContactsRequest,
  sendChatMessageRequest,
  storeChatKeyPair,
  updateChatMessageRequest,
  upsertMyChatKeyRequest,
  useChatRealtime,
} from "../../features/chat";
import {
  abbreviateLegalEntityName,
  formatPresenceStatus,
  resolveAvatarIcon,
  resolveAvatarUrl,
} from "../../shared/lib";
import { Button, Input } from "../../shared/ui";
import "./chat-workspace.css";

type ChatWorkspaceProps = {
  title: string;
  subtitle?: string;
  emptyTitle: string;
  emptyText: string;
  preferredEmployerId?: string | null;
  preferredRecipientUserId?: string | null;
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

type ContactDirectoryItem = {
  key: string;
  userId: string;
  publicId: string | null;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  conversationId: string | null;
  employerId: string | null;
  kind: "contact" | "request-incoming" | "request-outgoing";
  subtitle: string;
  levelLabel: string | null;
  tags: string[];
  city: string | null;
  salaryLabel: string | null;
  formatLabel: string | null;
  employmentLabel: string | null;
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
const ACTIVE_CONVERSATION_STORAGE_KEY_PREFIX = "tramplin.chat.active-conversation";
const CHAT_DECRYPTION_ERROR_TEXT = "Не удалось расшифровать сообщение. Скорее всего, оно было зашифровано старым ключом.";
const SYSTEM_BRAND_AVATAR_URL = "/favicon.svg";

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

function getActiveConversationStorageKey(subject: string | null, role: string | null) {
  return `${ACTIVE_CONVERSATION_STORAGE_KEY_PREFIX}:${subject ?? "guest"}:${role ?? "unknown"}`;
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

function readStoredActiveConversationId(subject: string | null, role: string | null) {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(getActiveConversationStorageKey(subject, role));
  return storedValue?.trim() || null;
}

function writeStoredActiveConversationId(subject: string | null, role: string | null, conversationId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getActiveConversationStorageKey(subject, role), conversationId);
}

function clearStoredActiveConversationId(subject: string | null, role: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getActiveConversationStorageKey(subject, role));
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

function isCompactMessageSpacing(previousCreatedAt: string, currentCreatedAt: string) {
  const previousTime = new Date(previousCreatedAt).getTime();
  const currentTime = new Date(currentCreatedAt).getTime();

  if (Number.isNaN(previousTime) || Number.isNaN(currentTime)) {
    return false;
  }

  return currentTime - previousTime < 3 * 60 * 1000;
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
  const imageSource =
    avatarUrl === SYSTEM_BRAND_AVATAR_URL
      ? SYSTEM_BRAND_AVATAR_URL
      : resolveAvatarUrl(avatarUrl) || resolveAvatarIcon(role);
  const isBrandAvatar = avatarUrl === SYSTEM_BRAND_AVATAR_URL;

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

function ChatWorkspaceDirectorySkeleton({ detailed = false }: { detailed?: boolean }) {
  if (detailed) {
    return (
      <div className="chat-workspace__directory-card chat-workspace__directory-card--new contact-profile-card chat-workspace__conversation-card--skeleton">
        <div className="chat-workspace__directory-card-badge contact-profile-card__badge">
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-id" />
        </div>
        <div className="chat-workspace__directory-card-primary contact-profile-card__primary">
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-avatar" />
          <div className="chat-workspace__directory-copy contact-profile-card__primary-copy">
            <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-name" />
            <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-subtitle" />
            <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-subtitle chat-workspace__skeleton--contact-subtitle-short" />
            <ChatWorkspaceSkeleton className="chat-workspace__skeleton--presence" />
          </div>
        </div>
        <div className="chat-workspace__directory-tags contact-profile-card__tags">
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-tag" />
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-tag" />
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-tag" />
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-tag chat-workspace__skeleton--contact-tag-short" />
        </div>
        <div className="chat-workspace__directory-facts contact-profile-card__facts">
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-fact" />
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-fact" />
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-fact" />
          <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-fact" />
        </div>
        <ChatWorkspaceSkeleton className="chat-workspace__skeleton--button" />
      </div>
    );
  }

  return (
    <div className="chat-workspace__directory-card chat-workspace__conversation-card--skeleton">
      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-id" />
      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--avatar" />
      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--contact-name" />
      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--presence" />
      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--button" />
    </div>
  );
}

function resolveMessageCounterpartKey(message: ChatMessageView, fallbackCounterpartKey?: JsonWebKey | null) {
  if (message.isOwn) {
    return message.recipientPublicKeyJwk ?? fallbackCounterpartKey ?? null;
  }

  return message.senderPublicKeyJwk ?? fallbackCounterpartKey ?? null;
}

function resolveDirectoryLevelTagClass(levelLabel: string | null) {
  const normalizedLevel = levelLabel?.trim().toLowerCase();

  if (normalizedLevel === "middle" || normalizedLevel === "мидл") {
    return "chat-workspace__directory-tag--warning";
  }

  if (normalizedLevel === "senior" || normalizedLevel === "сеньор") {
    return "chat-workspace__directory-tag--danger";
  }

  return "chat-workspace__directory-tag--success";
}

export function ChatWorkspace({
  title,
  subtitle,
  emptyTitle,
  emptyText,
  preferredEmployerId = null,
  preferredRecipientUserId = null,
}: ChatWorkspaceProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const currentRole = useAuthStore((state) => state.role);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [contactSearchValue, setContactSearchValue] = useState("");
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
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactActionKey, setContactActionKey] = useState<string | null>(null);
  const [recentContactEvent, setRecentContactEvent] = useState<{
    actorUserId: string;
    targetUserId: string;
    relationStatus: string;
  } | null>(null);
  const hasRestoredActiveConversationRef = useRef(false);
  const appliedPreferredEmployerIdRef = useRef<string | null>(null);
  const appliedPreferredRecipientUserIdRef = useRef<string | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue);
  const deferredContactSearchValue = useDeferredValue(contactSearchValue);
  const currentUserId = useMemo(() => readAccessTokenSubject(accessToken), [accessToken]);

  const openPublicProfile = (publicId: string | null | undefined) => {
    if (!publicId) {
      return;
    }

    navigate(`/profiles/${publicId}`);
  };

  useEffect(() => {
    setLocalNotes(readStoredNotes(currentUserId, currentRole ?? null));
  }, [currentRole, currentUserId]);

  useEffect(() => {
    setSystemWelcomeAt(readOrCreateWelcomeAt(currentUserId, currentRole ?? null));
  }, [currentRole, currentUserId]);

  useEffect(() => {
    hasRestoredActiveConversationRef.current = false;
  }, [currentRole, currentUserId]);

  useEffect(() => {
    appliedPreferredEmployerIdRef.current = null;
  }, [preferredEmployerId]);

  useEffect(() => {
    appliedPreferredRecipientUserIdRef.current = null;
  }, [preferredRecipientUserId]);

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
  const normalizedContactSearchValue = deferredContactSearchValue.trim();
  const searchQuery = useQuery({
    queryKey: ["chat", "search", normalizedContactSearchValue, preferredEmployerId ?? "", preferredRecipientUserId ?? ""],
    queryFn: () =>
      searchChatContactsRequest({
        query: normalizedContactSearchValue,
        employerId: preferredEmployerId,
      }),
    enabled:
      isHydrated &&
      Boolean(accessToken) &&
      (Boolean(normalizedContactSearchValue) || Boolean(preferredEmployerId) || Boolean(preferredRecipientUserId)),
    staleTime: 5_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const contactsQuery = useQuery({
    queryKey: ["chat", "contacts"],
    queryFn: listChatContactsRequest,
    enabled: isHydrated && Boolean(accessToken) && currentRole === "applicant",
    staleTime: 10_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!isHydrated || !accessToken || !currentUserId || !canUseChatCrypto()) {
      return;
    }

    let isMounted = true;

    void (async () => {
      const remotePair = await getMyChatKeyRequest();
      let storedPair =
        migrateLegacyStoredChatKeyPair(currentUserId, remotePair?.publicKeyJwk) ??
        getStoredChatKeyPair(currentUserId);

      if (
        storedPair &&
        remotePair?.privateKeyJwk &&
        !areChatKeysEqual(storedPair.publicKeyJwk, remotePair.publicKeyJwk)
      ) {
        clearStoredChatKeyPair(currentUserId);
        storedPair = null;
      }

      if (!storedPair && remotePair?.publicKeyJwk && !remotePair.privateKeyJwk) {
        return;
      }

      const pair =
        remotePair?.privateKeyJwk
          ? {
              algorithm: remotePair.algorithm,
              publicKeyJwk: remotePair.publicKeyJwk,
              privateKeyJwk: remotePair.privateKeyJwk,
            }
          : storedPair ?? (await ensureChatKeyPair(currentUserId));
      if (!isMounted) {
        return;
      }
      storeChatKeyPair(pair, currentUserId);
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
  }, [accessToken, currentUserId, isHydrated]);

  useChatRealtime((event) => {
    if (
      event.type === "chat_contacts_updated" &&
      typeof event.actor_user_id === "string" &&
      typeof event.target_user_id === "string" &&
      typeof event.relation_status === "string"
    ) {
      setRecentContactEvent({
        actorUserId: event.actor_user_id,
        targetUserId: event.target_user_id,
        relationStatus: event.relation_status,
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["chat", "contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["chat", "messages"] });
    void queryClient.invalidateQueries({ queryKey: ["chat", "search"] });
  });

  const conversations = conversationsQuery.data ?? EMPTY_CONVERSATIONS;
  const visibleConversations = conversations;
  const searchResults = searchQuery.data ?? EMPTY_CONTACTS;
  const applicantContacts = contactsQuery.data ?? EMPTY_CONTACTS;
  const isConversationListLoading = conversationsQuery.isLoading;
  const isSearchLoading = searchQuery.isLoading;

  const conversationMap = useMemo(
    () =>
      visibleConversations.reduce<Record<string, ChatConversation>>((result, item) => {
        result[item.id] = item;
        return result;
      }, {}),
    [visibleConversations],
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
      senderPublicKeyJwk: null,
      recipientPublicKeyJwk: null,
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
        senderPublicKeyJwk: null,
        recipientPublicKeyJwk: null,
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
      avatarUrl: SYSTEM_BRAND_AVATAR_URL,
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
      ...visibleConversations.map((item) => ({
        id: item.id,
        counterpart: item.counterpart,
        unreadCount: item.unreadCount,
        previewText: item.lastMessage ? (decryptedPreviewMap[item.id] ?? "Сообщение") : "Нет сообщений",
        updatedAt: item.updatedAt,
      })),
    ],
    [decryptedPreviewMap, systemConversationItem, visibleConversations],
  );
  const filteredConversationItems = useMemo(() => {
    if (!normalizedSearchValue) {
      return conversationItems;
    }

    const needle = normalizedSearchValue.toLowerCase();
    return conversationItems.filter((item) => {
      const haystack = [
        item.counterpart.displayName,
        item.counterpart.publicId ?? "",
        item.counterpart.companyName ?? "",
        item.previewText,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [conversationItems, normalizedSearchValue]);

  const applicantRequests = useMemo<ContactDirectoryItem[]>(() => {
    if (currentRole !== "applicant") {
      return [];
    }

    return applicantContacts
      .filter((item) => item.role === "applicant" && item.relationStatus === "pending")
      .map((item) => ({
        key: `request:${item.userId}:${item.employerId ?? "none"}`,
        userId: item.userId,
        publicId: item.publicId,
        displayName: item.displayName,
        role: item.role,
        avatarUrl: item.avatarUrl,
        isOnline: item.isOnline,
        lastSeenAt: item.lastSeenAt,
        conversationId: item.conversationId,
        employerId: item.employerId,
        kind: item.requestDirection === "incoming" ? "request-incoming" : "request-outgoing",
        subtitle: item.subtitle ?? "Не указано",
        levelLabel: item.levelLabel,
        tags: item.tags,
        city: item.city,
        salaryLabel: item.salaryLabel,
        formatLabel: item.formatLabel,
        employmentLabel: item.employmentLabel,
      }));
  }, [applicantContacts, currentRole]);

  const directoryItems = useMemo<ContactDirectoryItem[]>(() => {
    if (currentRole !== "applicant") {
      return [];
    }

    return applicantContacts.filter((item) => item.relationStatus === "accepted").map((item) => ({
      key: `contact:${item.userId}:${item.employerId ?? "none"}`,
      userId: item.userId,
      publicId: item.publicId,
      displayName: item.displayName,
      role: item.role,
      avatarUrl: item.avatarUrl,
      isOnline: item.isOnline,
      lastSeenAt: item.lastSeenAt,
      conversationId: item.conversationId,
      employerId: item.employerId,
      kind: "contact",
      subtitle: item.subtitle ?? "Не указано",
      levelLabel: item.levelLabel,
      tags: item.tags,
      city: item.city,
      salaryLabel: item.salaryLabel,
      formatLabel: item.formatLabel,
      employmentLabel: item.employmentLabel,
    }));
  }, [applicantContacts, currentRole]);

  const combinedDirectoryItems = useMemo(
    () => [...directoryItems, ...applicantRequests],
    [applicantRequests, directoryItems],
  );

  const filteredDirectoryItems = useMemo(() => {
    const needle = contactSearchValue.trim().toLowerCase();
    if (!needle) {
      return combinedDirectoryItems;
    }

    return combinedDirectoryItems.filter((item) =>
      [item.displayName, item.publicId ?? "", item.subtitle].join(" ").toLowerCase().includes(needle),
    );
  }, [combinedDirectoryItems, contactSearchValue]);
  const newDirectoryItems = useMemo<ContactDirectoryItem[]>(() => {
    if (currentRole !== "applicant" || !normalizedContactSearchValue) {
      return [];
    }

    const knownKeys = new Set([
      ...directoryItems.map((item) => `${item.userId}:${item.employerId ?? "none"}`),
      ...applicantRequests.map((item) => `${item.userId}:${item.employerId ?? "none"}`),
    ]);

    return searchResults
      .filter((item) => !knownKeys.has(`${item.userId}:${item.employerId ?? "none"}`))
      .map((item) => ({
        key: `new:${item.userId}:${item.employerId ?? "none"}`,
        userId: item.userId,
        publicId: item.publicId,
        displayName: item.displayName,
        role: item.role,
        avatarUrl: item.avatarUrl,
        isOnline: item.isOnline,
        lastSeenAt: item.lastSeenAt,
        conversationId: item.conversationId,
        employerId: item.employerId,
        kind: "contact",
        subtitle: item.subtitle ?? (item.role === "employer" ? (item.companyName ?? "Работодатель") : "Новый контакт"),
        levelLabel: item.levelLabel,
        tags: item.tags,
        city: item.city,
        salaryLabel: item.salaryLabel,
        formatLabel: item.formatLabel,
        employmentLabel: item.employmentLabel,
      }));
  }, [applicantRequests, currentRole, directoryItems, normalizedContactSearchValue, searchResults]);

  const resolveExistingConversationId = (contact: Pick<ChatContact, "conversationId" | "userId" | "publicId" | "employerId" | "role">) => {
    if (contact.conversationId && conversationMap[contact.conversationId]) {
      return contact.conversationId;
    }

    const matchedConversation = visibleConversations.find((item) => {
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
    clearStoredActiveConversationId(currentUserId, currentRole ?? null);
  }, [activeConversationId, conversationMap, currentRole, currentUserId]);

  useEffect(() => {
    if (
      hasRestoredActiveConversationRef.current ||
      !isHydrated ||
      activeConversationId ||
      activeDraftContact ||
      normalizedContactSearchValue
    ) {
      return;
    }

    const storedConversationId = readStoredActiveConversationId(currentUserId, currentRole ?? null);
    hasRestoredActiveConversationRef.current = true;

    if (storedConversationId) {
      setActiveConversationId(storedConversationId);
    }
  }, [activeConversationId, activeDraftContact, currentRole, currentUserId, isHydrated, normalizedContactSearchValue]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    writeStoredActiveConversationId(currentUserId, currentRole ?? null, activeConversationId);
  }, [activeConversationId, currentRole, currentUserId]);

  useEffect(() => {
    if (
      !preferredEmployerId ||
      normalizedContactSearchValue ||
      appliedPreferredEmployerIdRef.current === preferredEmployerId
    ) {
      return;
    }

    const existingConversation = visibleConversations.find((item) => item.counterpart.companyId === preferredEmployerId);
    if (existingConversation) {
      appliedPreferredEmployerIdRef.current = preferredEmployerId;
      setActiveConversationId(existingConversation.id);
      setActiveDraftContact(null);
      return;
    }

    const preferredContact = searchResults.find((item) => item.employerId === preferredEmployerId);
    if (!preferredContact) {
      return;
    }

    appliedPreferredEmployerIdRef.current = preferredEmployerId;
    const existingConversationId = resolveExistingConversationId(preferredContact);
    if (existingConversationId) {
      setActiveConversationId(existingConversationId);
      setActiveDraftContact(null);
      return;
    }

    setActiveDraftContact(preferredContact);
  }, [
    normalizedContactSearchValue,
    preferredEmployerId,
    searchResults,
    visibleConversations,
  ]);

  useEffect(() => {
    if (
      !preferredRecipientUserId ||
      normalizedContactSearchValue ||
      appliedPreferredRecipientUserIdRef.current === preferredRecipientUserId
    ) {
      return;
    }

    const existingConversation = visibleConversations.find((item) => item.counterpart.userId === preferredRecipientUserId);
    if (existingConversation) {
      appliedPreferredRecipientUserIdRef.current = preferredRecipientUserId;
      setActiveConversationId(existingConversation.id);
      setActiveDraftContact(null);
      return;
    }

    const preferredContact = searchResults.find((item) => item.userId === preferredRecipientUserId);
    if (!preferredContact) {
      return;
    }

    appliedPreferredRecipientUserIdRef.current = preferredRecipientUserId;
    const existingConversationId = resolveExistingConversationId(preferredContact);
    if (existingConversationId) {
      setActiveConversationId(existingConversationId);
      setActiveDraftContact(null);
      return;
    }

    setActiveDraftContact(preferredContact);
  }, [
    normalizedContactSearchValue,
    preferredRecipientUserId,
    searchResults,
    visibleConversations,
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
            counterpartPublicKeyJwk: resolveMessageCounterpartKey(
              item.lastMessage,
              item.counterpart.publicKeyJwk,
            ),
            conversationId: item.id,
          });
        } catch {
          nextPreviewMap[item.id] = CHAT_DECRYPTION_ERROR_TEXT;
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
            counterpartPublicKeyJwk: resolveMessageCounterpartKey(
              item,
              activeCounterpart.publicKeyJwk,
            ),
            conversationId: item.conversationId,
          });
        } catch {
          nextMessageMap[item.id] = CHAT_DECRYPTION_ERROR_TEXT;
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

  useEffect(() => {
    if (!editingMessageId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const input = composerInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const caretPosition = input.value.length;
      input.setSelectionRange(caretPosition, caretPosition);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [editingMessageId]);

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

  const scrollToChatWorkspace = () => {
    sectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    window.setTimeout(() => {
      composerInputRef.current?.focus();
    }, 350);
  };

  const handleOpenDirectoryItem = (item: ContactDirectoryItem) => {
    const matchingContact = applicantContacts.find((contact) => contact.userId === item.userId);
    if (matchingContact) {
      handleSelectSearchContact(matchingContact);
      scrollToChatWorkspace();
      return;
    }

    if (item.conversationId) {
      handleSelectConversation(item.conversationId);
      scrollToChatWorkspace();
      return;
    }

    setActiveDraftContact({
      userId: item.userId,
      publicId: item.publicId,
      role: item.role,
      displayName: item.displayName,
      relationStatus: "accepted",
      requestDirection: null,
      avatarUrl: item.avatarUrl,
      companyName: null,
      subtitle: item.subtitle,
      levelLabel: item.levelLabel,
      tags: item.tags,
      city: item.city,
      salaryLabel: item.salaryLabel,
      formatLabel: item.formatLabel,
      employmentLabel: item.employmentLabel,
      employerId: item.employerId,
      publicKeyJwk: null,
      isOnline: item.isOnline,
      lastSeenAt: item.lastSeenAt,
      hasConversation: false,
      conversationId: null,
    });
    setActiveConversationId(null);
    scrollToChatWorkspace();
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

    if (activeConversation && !activeConversation.canSendMessage) {
      setComposerError("Для продолжения общения нужно добавить пользователя в контакты.");
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
        activeKeyPair = await ensureChatKeyPair(currentUserId);
        storeChatKeyPair(activeKeyPair, currentUserId);
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
        senderPublicKeyJwk: null,
        recipientPublicKeyJwk: null,
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

      queryClient.setQueryData<ChatMessageView[] | undefined>(
        ["chat", "messages", sentMessage.conversationId],
        (currentValue) => {
          const nextItems = (currentValue ?? []).filter((item) => item.id !== optimisticMessageId);
          const existingIndex = nextItems.findIndex((item) => item.id === sentMessage.id);
          const nextMessage: ChatMessageView = {
            ...sentMessage,
            clientText: trimmedMessage,
          };

          if (existingIndex >= 0) {
            nextItems[existingIndex] = {
              ...nextItems[existingIndex],
              ...nextMessage,
            };
            return nextItems;
          }

          return [...nextItems, nextMessage].sort(
            (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
          );
        },
      );
      queryClient.setQueryData<ChatConversation[] | undefined>(
        ["chat", "conversations"],
        (currentValue) => {
          const conversationList = currentValue ?? [];
          const nextConversation: ChatConversation = {
            ...(activeConversation ?? targetConversation),
            id: targetConversation.id,
            updatedAt: sentMessage.createdAt,
            unreadCount: 0,
            counterpart: (activeConversation ?? targetConversation).counterpart,
            lastMessage: sentMessage,
          };
          const existingIndex = conversationList.findIndex((item) => item.id === targetConversation.id);

          if (existingIndex >= 0) {
            const nextItems = [...conversationList];
            nextItems[existingIndex] = {
              ...nextItems[existingIndex],
              ...nextConversation,
            };
            return nextItems.sort(
              (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
            );
          }

          return [nextConversation, ...conversationList].sort(
            (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
          );
        },
      );
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

  const activeCounterpartTitle = activeCounterpart ? resolveParticipantTitle(activeCounterpart) : null;
  const visibleMessages = activeSystemConversation ? systemMessages : activeMessages;
  const activeApplicantRelation =
    activeCounterpart && currentRole === "applicant" && activeCounterpart.role === "applicant"
      ? applicantContacts.find((item) => item.userId === activeCounterpart.userId && item.role === "applicant") ?? null
      : null;
  const isApplicantContactConversation = Boolean(
    !activeSystemConversation && currentRole === "applicant" && activeCounterpart?.role === "applicant",
  );
  const isApplicantChatRestricted = Boolean(
    activeConversation && isApplicantContactConversation && !activeConversation.canSendMessage,
  );
  const canAddApplicantContact = Boolean(
    activeConversation && isApplicantContactConversation && activeConversation.canAddToContacts,
  );
  const isApplicantContactAccepted = Boolean(
    (activeConversation && activeConversation.isContact) || activeApplicantRelation?.relationStatus === "accepted",
  );
  const isIncomingApplicantContactRequest = Boolean(
    activeApplicantRelation?.relationStatus === "pending" && activeApplicantRelation.requestDirection === "incoming",
  );
  const shouldShowApplicantContactGate = Boolean(
    isApplicantContactConversation &&
      !isApplicantContactAccepted &&
      (activeApplicantRelation?.relationStatus === "pending" || activeMessages.length === 0),
  );
  const canShowApplicantContactButton = Boolean(
    shouldShowApplicantContactGate &&
      activeApplicantRelation?.relationStatus !== "pending" &&
      (activeConversation ? activeConversation.canAddToContacts || !activeConversation.isContact : true),
  );
  const shouldShowApplicantContactGateWithMessages = Boolean(
    shouldShowApplicantContactGate && activeMessages.length > 0,
  );
  const shouldShowApplicantContactRejectedNotice = Boolean(
    isApplicantContactConversation &&
      isApplicantChatRestricted &&
      !canAddApplicantContact &&
      !activeApplicantRelation &&
      activeMessages.length > 0,
  );
  const didRejectActiveApplicantContact = Boolean(
    activeCounterpart &&
      recentContactEvent?.relationStatus === "removed" &&
      recentContactEvent.actorUserId === currentUserId &&
      recentContactEvent.targetUserId === activeCounterpart.userId,
  );
  const wasRejectedByActiveApplicantContact = Boolean(
    activeCounterpart &&
      recentContactEvent?.relationStatus === "removed" &&
      recentContactEvent.actorUserId === activeCounterpart.userId &&
      recentContactEvent.targetUserId === currentUserId,
  );
  const searchInputToneClass = currentRole === "applicant" ? "input--secondary" : "input--primary";

  const handleAddApplicantContact = async () => {
    if (!activeCounterpart || isAddingContact) {
      return;
    }

    setIsAddingContact(true);
    setComposerError(null);

    try {
      await addChatContactRequest(activeCounterpart.userId);
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeConversationId] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "search"] });
    } catch (error) {
      console.error("chat.add_contact.failed", error);
      setComposerError("Не удалось добавить пользователя в контакты.");
    } finally {
      setIsAddingContact(false);
    }
  };

  const handleContactRequestAction = async (item: ContactDirectoryItem) => {
    if (contactActionKey) {
      return;
    }

    setContactActionKey(item.key);
    try {
      await addChatContactRequest(item.userId);
      await queryClient.invalidateQueries({ queryKey: ["chat", "contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "search"] });
    } finally {
      setContactActionKey(null);
    }
  };

  const handleRemoveContactAction = async (item: ContactDirectoryItem) => {
    if (contactActionKey) {
      return;
    }

    setContactActionKey(item.key);
    try {
      await rejectChatContactRequest(item.userId);
      await queryClient.invalidateQueries({ queryKey: ["chat", "contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "search"] });
    } finally {
      setContactActionKey(null);
    }
  };

  const handleRejectActiveApplicantContact = async () => {
    if (!activeCounterpart || isAddingContact) {
      return;
    }

    setIsAddingContact(true);
    setComposerError(null);

    try {
      await rejectChatContactRequest(activeCounterpart.userId);
      await queryClient.invalidateQueries({ queryKey: ["chat", "contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeConversationId] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "search"] });
    } catch (error) {
      console.error("chat.reject_contact.failed", error);
      setComposerError("Не удалось отклонить заявку.");
    } finally {
      setIsAddingContact(false);
    }
  };

  return (
    <section
      ref={sectionRef}
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
          <label className="chat-workspace__search header__search" aria-label="Поиск чатов и новых собеседников">
            <Input
              type="search"
              placeholder="Поиск"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className={`${searchInputToneClass} input--sm chat-workspace__search-input`}
            />
          </label>

          <div className="chat-workspace__list">
            {isConversationListLoading ? (
              Array.from({ length: CHAT_LIST_SKELETON_COUNT }, (_, index) => (
                <div key={`chat-list-skeleton-${index}`} className="chat-workspace__conversation-card chat-workspace__conversation-card--skeleton">
                  <ChatWorkspaceSkeleton className="chat-workspace__skeleton--avatar" />
                  <span className="chat-workspace__conversation-summary">
                    <span className="chat-workspace__list-main">
                      <ChatWorkspaceSkeleton className="chat-workspace__skeleton--list-name" />
                      <span className="chat-workspace__presence-summary">
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
            ) : filteredConversationItems.length === 0 ? (
              <div className="chat-workspace__hint chat-workspace__hint--search-empty">
                <img src={sadSearchIcon} alt="" aria-hidden="true" className="chat-workspace__hint-icon" />
                <span>{normalizedSearchValue ? "Ничего не найдено" : "Пока нет чатов"}</span>
              </div>
            ) : (
              filteredConversationItems.map((item) => {
                const isActive = item.id === activeConversationId;
                const counterpartTitle = resolveParticipantTitle(item.counterpart);

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`chat-workspace__conversation-card${isActive ? " chat-workspace__conversation-card--active" : ""}`}
                    onClick={() => handleSelectConversation(item.id)}
                  >
                    <ChatAvatar
                      displayName={item.counterpart.displayName}
                      role={item.counterpart.role}
                      avatarUrl={item.counterpart.avatarUrl}
                      unreadCount={item.unreadCount}
                    />
                    <span className="chat-workspace__conversation-summary">
                      <span className="chat-workspace__list-main">
                        {item.counterpart.publicId ? (
                          <span
                            role="link"
                            tabIndex={0}
                            className="chat-workspace__list-name chat-workspace__list-name--link"
                            onClick={(event) => {
                              event.stopPropagation();
                              openPublicProfile(item.counterpart.publicId);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                openPublicProfile(item.counterpart.publicId);
                              }
                            }}
                          >
                            {counterpartTitle}
                          </span>
                        ) : (
                          <span className="chat-workspace__list-name">{counterpartTitle}</span>
                        )}
                        <span className="chat-workspace__presence-summary">
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

        <div className="chat-workspace__workspace-main">
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
                    {activeCounterpart.publicId ? (
                      <button
                        type="button"
                        className="chat-workspace__thread-name chat-workspace__thread-name-button"
                        onClick={() => openPublicProfile(activeCounterpart.publicId)}
                      >
                        {activeCounterpartTitle}
                      </button>
                    ) : (
                      <h2 className="chat-workspace__thread-name">{activeCounterpartTitle}</h2>
                    )}
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
                            className={`chat-workspace__message-skeleton-line${isOwn ? " chat-workspace__message-skeleton-line--own" : ""}`}
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
                  ) : shouldShowApplicantContactGate && !shouldShowApplicantContactGateWithMessages && activeCounterpart ? (
                    <section className="chat-workspace__contact-gate">
                      {isIncomingApplicantContactRequest ? (
                        <p className="chat-workspace__contact-gate-text">
                          {activeCounterpart.displayName} отправил вам заявку на добавление в контакты.
                          Хотите добавить этого пользователя в свои контакты?
                        </p>
                      ) : (
                        <p className="chat-workspace__contact-gate-text">
                          Вы можете отправить только одно сообщение этому пользователю. Убедитесь, что оно содержит всю важную информацию. Получатель сможет добавить вас в контакты для продолжения общения.
                        </p>
                      )}
                      <p className="chat-workspace__contact-gate-text">После добавления:</p>
                      <ul className="chat-workspace__contact-gate-list">
                        <li>Вы сможете обмениваться сообщениями без ограничений.</li>
                        <li>{activeCounterpart.displayName} появится в вашем списке контактов.</li>
                        <li>Вы сможете рекомендовать {activeCounterpart.displayName} работодателям.</li>
                      </ul>
                      {isIncomingApplicantContactRequest ? (
                        <div className="chat-workspace__contact-gate-actions">
                          <Button
                            type="button"
                            variant="danger"
                            size="md"
                            fullWidth
                            onClick={() => void handleRejectActiveApplicantContact()}
                            disabled={isAddingContact}
                          >
                            Отклонить
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            fullWidth
                            onClick={() => void handleAddApplicantContact()}
                            loading={isAddingContact}
                          >
                            Принять
                          </Button>
                        </div>
                      ) : canShowApplicantContactButton ? (
                        <Button
                          type="button"
                          variant="secondary-outline"
                          size="md"
                          fullWidth
                          onClick={() => void handleAddApplicantContact()}
                          loading={isAddingContact}
                        >
                          Добавить в контакты
                        </Button>
                      ) : (
                        <Button type="button" variant="secondary" size="md" fullWidth disabled>
                          Заявка отправлена
                        </Button>
                      )}
                    </section>
                  ) : activeSystemConversation || activeConversation || activeMessages.length > 0 ? (
                    <>
                      {messageDayGroups.map((group) => (
                        <div key={group.dayKey} className="chat-workspace__day-group">
                          <div className="chat-workspace__date-divider">
                            <span className="chat-workspace__date-divider-label">{group.dateLabel}</span>
                          </div>
                          {group.messages.map((item, index) => {
                            const previousMessage = group.messages[index - 1] ?? null;
                            const spacingClassName =
                              previousMessage && isCompactMessageSpacing(previousMessage.createdAt, item.createdAt)
                                ? " chat-workspace__message--compact"
                                : previousMessage
                                  ? " chat-workspace__message--spaced"
                                  : "";

                            return (
                            <div key={item.id} className="chat-workspace__message-entry">
                              <div
                                className={`chat-workspace__message${item.isOwn ? " chat-workspace__message--own" : ""}${spacingClassName}`}
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
                            );
                          })}
                        </div>
                      ))}
                      {shouldShowApplicantContactGateWithMessages && activeCounterpart ? (
                        <section className="chat-workspace__contact-gate">
                          {isIncomingApplicantContactRequest ? (
                            <p className="chat-workspace__contact-gate-text">
                              {activeCounterpart.displayName} отправил вам заявку на добавление в контакты.
                              Хотите добавить этого пользователя в свои контакты?
                            </p>
                          ) : (
                            <p className="chat-workspace__contact-gate-text">
                              Вы можете отправить только одно сообщение этому пользователю. Убедитесь, что оно содержит всю важную информацию. Получатель сможет добавить вас в контакты для продолжения общения.
                            </p>
                          )}
                          <p className="chat-workspace__contact-gate-text">После добавления:</p>
                          <ul className="chat-workspace__contact-gate-list">
                            <li>Вы сможете обмениваться сообщениями без ограничений.</li>
                            <li>{activeCounterpart.displayName} появится в вашем списке контактов.</li>
                            <li>Вы сможете рекомендовать {activeCounterpart.displayName} работодателям.</li>
                          </ul>
                          {isIncomingApplicantContactRequest ? (
                            <div className="chat-workspace__contact-gate-actions">
                              <Button
                                type="button"
                                variant="danger"
                                size="md"
                                fullWidth
                                onClick={() => void handleRejectActiveApplicantContact()}
                                disabled={isAddingContact}
                              >
                                Отклонить
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                fullWidth
                                onClick={() => void handleAddApplicantContact()}
                                loading={isAddingContact}
                              >
                                Принять
                              </Button>
                            </div>
                          ) : canShowApplicantContactButton ? (
                            <Button
                              type="button"
                              variant="secondary-outline"
                              size="md"
                              fullWidth
                              onClick={() => void handleAddApplicantContact()}
                              loading={isAddingContact}
                            >
                              Добавить в контакты
                            </Button>
                          ) : (
                            <Button type="button" variant="secondary" size="md" fullWidth disabled>
                              Заявка отправлена
                            </Button>
                          )}
                        </section>
                      ) : null}
                    </>
                  ) : (
                    <div className="chat-workspace__placeholder">
                      <p className="chat-workspace__empty-text">Пока нет сообщений</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="chat-workspace__composer">
                {didRejectActiveApplicantContact ? (
                  <p className="chat-workspace__request-text chat-workspace__request-text--danger">
                    Вы отклонили заявку на добавление в контакты.
                  </p>
                ) : null}
                {shouldShowApplicantContactRejectedNotice || (wasRejectedByActiveApplicantContact && !didRejectActiveApplicantContact) ? (
                  <div className="chat-workspace__request-banner chat-workspace__request-banner--danger">
                    <p className="chat-workspace__request-banner-text">
                      Заявку в контакты не приняли.
                    </p>
                  </div>
                ) : null}
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
                <div className="chat-workspace__composer-actions">
                  <button type="button" className="chat-workspace__composer-attach" aria-label="Прикрепить файл" disabled>
                    <img src={clipIcon} alt="" aria-hidden="true" className="chat-workspace__composer-attach-icon" />
                  </button>
                  <Input
                    ref={composerInputRef}
                    type="text"
                    className="chat-workspace__composer-input input--sm"
                    placeholder={
                      isApplicantChatRestricted ? "Добавьте пользователя в контакты для продолжения" : "Сообщение..."
                    }
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "Enter" ||
                        event.nativeEvent.isComposing ||
                        messagesQuery.isFetching ||
                        isSendingMessage ||
                        isApplicantChatRestricted
                      ) {
                        return;
                      }
                      event.preventDefault();
                      void handleSendMessage();
                    }}
                    clearable={false}
                    disabled={isApplicantChatRestricted}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="chat-workspace__composer-send"
                    onClick={() => void handleSendMessage()}
                    aria-label="Отправить сообщение"
                    disabled={!messageDraft.trim() || isSendingMessage || isApplicantChatRestricted}
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
      {currentRole === "applicant" ? (
        <section className="chat-workspace__directory">
          <div className="chat-workspace__directory-header">
            <h2 className="chat-workspace__directory-title">Контакты ({combinedDirectoryItems.length})</h2>
          </div>
          <label className="chat-workspace__search chat-workspace__directory-search header__search" aria-label="Поиск по контактам и заявкам">
            <Input
              type="search"
              placeholder="Поиск по id, имени и статусу"
              value={contactSearchValue}
              onChange={(event) => setContactSearchValue(event.target.value)}
              className={`${searchInputToneClass} input--sm chat-workspace__search-input`}
            />
          </label>

          {contactsQuery.isLoading ? (
            <div className="chat-workspace__directory-grid">
              {Array.from({ length: 3 }, (_, index) => (
                <ChatWorkspaceDirectorySkeleton key={`chat-directory-skeleton-${index}`} />
              ))}
            </div>
          ) : (
            <>
              {filteredDirectoryItems.length > 0 ? (
                <div className="chat-workspace__directory-grid">
                  {filteredDirectoryItems.map((item) => (
                    <article key={item.key} className="chat-workspace__directory-card chat-workspace__directory-card--new contact-profile-card">
                      <div className="chat-workspace__directory-card-badge contact-profile-card__badge">
                        <span className="chat-workspace__directory-id contact-profile-card__id">ID: {item.publicId ?? item.userId.slice(-6)}</span>
                      </div>
                      <div className="chat-workspace__directory-card-primary contact-profile-card__primary">
                        <ChatAvatar displayName={item.displayName} role={item.role} avatarUrl={item.avatarUrl} />
                        <div className="chat-workspace__directory-copy contact-profile-card__primary-copy">
                          <strong className="chat-workspace__directory-name contact-profile-card__name">{item.displayName}</strong>
                          <span className={`chat-workspace__directory-status contact-profile-card__status${item.isOnline ? " contact-profile-card__status--online" : " contact-profile-card__status--offline"}`}>
                            <span className={`chat-workspace__status${item.isOnline ? " chat-workspace__status--online" : ""}`} />
                            {item.isOnline ? "Online" : formatPresenceStatus({
                              isOnline: item.isOnline,
                              lastSeenAt: item.lastSeenAt,
                            })}
                          </span>
                          <span className="chat-workspace__directory-subtitle contact-profile-card__subtitle">{item.subtitle}</span>
                        </div>
                      </div>
                      <div className="chat-workspace__directory-tags contact-profile-card__tags">
                        {item.tags.map((tag, index) => (
                          <span
                            key={`${item.key}-${tag}-${index}`}
                            className={
                              index === 0 && item.levelLabel
                                ? `chat-workspace__directory-tag-shape ${resolveDirectoryLevelTagClass(item.levelLabel)}`
                                : "chat-workspace__directory-tag contact-profile-card__tag"
                            }
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="chat-workspace__directory-facts contact-profile-card__facts">
                        <span className="chat-workspace__directory-fact contact-profile-card__fact">
                          <img src={locationIcon} alt="" aria-hidden="true" className="chat-workspace__directory-fact-icon contact-profile-card__fact-icon" />
                          {item.city ?? "Не указано"}
                        </span>
                        <span className="chat-workspace__directory-fact contact-profile-card__fact">
                          <img src={jobIcon} alt="" aria-hidden="true" className="chat-workspace__directory-fact-icon contact-profile-card__fact-icon" />
                          {item.salaryLabel ?? "Не указано"}
                        </span>
                        <span className="chat-workspace__directory-fact contact-profile-card__fact">
                          <img src={jobIcon} alt="" aria-hidden="true" className="chat-workspace__directory-fact-icon contact-profile-card__fact-icon" />
                          {item.formatLabel ?? "Не указано"}
                        </span>
                        <span className="chat-workspace__directory-fact contact-profile-card__fact">
                          <img src={timeIcon} alt="" aria-hidden="true" className="chat-workspace__directory-fact-icon contact-profile-card__fact-icon" />
                          {item.employmentLabel ?? "Не указано"}
                        </span>
                      </div>
                      <div className="chat-workspace__directory-card-actions">
                        {item.kind === "contact" ? (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="md"
                              fullWidth
                              className="chat-workspace__directory-friend-button"
                              onClick={() => void handleRemoveContactAction(item)}
                              loading={contactActionKey === item.key}
                            >
                              <span className="chat-workspace__directory-friend-label chat-workspace__directory-friend-label--idle">
                                <img src={checkMarkIcon} alt="" aria-hidden="true" className="chat-workspace__directory-friend-icon" />
                                В друзьях
                              </span>
                              <span className="chat-workspace__directory-friend-label chat-workspace__directory-friend-label--hover">
                                Удалить из друзей
                              </span>
                            </Button>
                            <Button type="button" variant="secondary-outline" size="md" fullWidth onClick={() => handleOpenDirectoryItem(item)}>
                              Написать
                            </Button>
                          </>
                        ) : item.kind === "request-incoming" ? (
                          <>
                            <div className="chat-workspace__directory-card-actions-row">
                              <Button
                                type="button"
                                variant="danger"
                                size="md"
                                className="chat-workspace__directory-action-toggle chat-workspace__directory-action-toggle--danger"
                                onClick={() => void handleRemoveContactAction(item)}
                                disabled={contactActionKey === item.key}
                              >
                                Отклонить
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                className="chat-workspace__directory-action-toggle"
                                onClick={() => void handleContactRequestAction(item)}
                                loading={contactActionKey === item.key}
                              >
                                Добавить
                              </Button>
                            </div>
                            <Button type="button" variant="secondary-outline" size="md" fullWidth onClick={() => handleOpenDirectoryItem(item)}>
                              Написать
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button type="button" variant="secondary" size="md" fullWidth disabled>
                              Заявка отправлена
                            </Button>
                            <Button type="button" variant="secondary-outline" size="md" fullWidth onClick={() => handleOpenDirectoryItem(item)}>
                              Написать
                            </Button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : combinedDirectoryItems.length === 0 ? (
                <div className="chat-workspace__hint chat-workspace__hint--contacts-empty">
                  <img src={contactsIcon} alt="" aria-hidden="true" className="chat-workspace__contacts-empty-image" />
                  <span>Пока у вас нет контактов. Найдите пользователей и отправьте заявку, чтобы начать общение.</span>
                </div>
              ) : (
                <div className="chat-workspace__hint chat-workspace__hint--search-empty">
                  <img src={sadSearchIcon} alt="" aria-hidden="true" className="chat-workspace__hint-icon" />
                  <span>Ничего не найдено</span>
                </div>
              )}
              {normalizedContactSearchValue ? (
                <div className="chat-workspace__directory-group">
                  <div className="chat-workspace__directory-group-head">
                    <h3 className="chat-workspace__directory-title">Новые контакты ({newDirectoryItems.length})</h3>
                  </div>
                  <div className="chat-workspace__directory-grid chat-workspace__directory-grid--new">
                    {isSearchLoading ? (
                      Array.from({ length: 2 }, (_, index) => (
                        <ChatWorkspaceDirectorySkeleton key={`chat-new-contact-skeleton-${index}`} detailed />
                      ))
                    ) : newDirectoryItems.length > 0 ? (
                      newDirectoryItems.map((item) => (
                        <article key={item.key} className="chat-workspace__directory-card chat-workspace__directory-card--new contact-profile-card">
                          <div className="chat-workspace__directory-card-badge contact-profile-card__badge">
                            <span className="chat-workspace__directory-id contact-profile-card__id">ID: {item.publicId ?? item.userId.slice(-6)}</span>
                          </div>
                          <div className="chat-workspace__directory-card-primary contact-profile-card__primary">
                            <ChatAvatar displayName={item.displayName} role={item.role} avatarUrl={item.avatarUrl} />
                            <div className="chat-workspace__directory-copy contact-profile-card__primary-copy">
                              <strong className="chat-workspace__directory-name contact-profile-card__name">{item.displayName}</strong>
                              <span className={`chat-workspace__directory-status contact-profile-card__status${item.isOnline ? " contact-profile-card__status--online" : " contact-profile-card__status--offline"}`}>
                                <span className={`chat-workspace__status${item.isOnline ? " chat-workspace__status--online" : ""}`} />
                                {item.isOnline ? "Online" : formatPresenceStatus({
                                  isOnline: item.isOnline,
                                  lastSeenAt: item.lastSeenAt,
                                })}
                              </span>
                              <span className="chat-workspace__directory-subtitle contact-profile-card__subtitle">{item.subtitle}</span>
                            </div>
                          </div>
                          <div className="chat-workspace__directory-tags contact-profile-card__tags">
                            {item.tags.map((tag, index) => (
                              <span
                                key={`${item.key}-${tag}-${index}`}
                                className={
                                  index === 0 && item.levelLabel
                                    ? `chat-workspace__directory-tag-shape ${resolveDirectoryLevelTagClass(item.levelLabel)}`
                                    : "chat-workspace__directory-tag contact-profile-card__tag"
                                }
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="chat-workspace__directory-facts contact-profile-card__facts">
                            <span className="chat-workspace__directory-fact contact-profile-card__fact">
                              <img src={locationIcon} alt="" aria-hidden="true" className="chat-workspace__directory-fact-icon contact-profile-card__fact-icon" />
                              {item.city ?? "Не указано"}
                            </span>
                            <span className="chat-workspace__directory-fact contact-profile-card__fact">
                              <img src={jobIcon} alt="" aria-hidden="true" className="chat-workspace__directory-fact-icon contact-profile-card__fact-icon" />
                              {item.salaryLabel ?? "Не указано"}
                            </span>
                            <span className="chat-workspace__directory-fact contact-profile-card__fact">
                              <img src={jobIcon} alt="" aria-hidden="true" className="chat-workspace__directory-fact-icon contact-profile-card__fact-icon" />
                              {item.formatLabel ?? "Не указано"}
                            </span>
                            <span className="chat-workspace__directory-fact contact-profile-card__fact">
                              <img src={timeIcon} alt="" aria-hidden="true" className="chat-workspace__directory-fact-icon contact-profile-card__fact-icon" />
                              {item.employmentLabel ?? "Не указано"}
                            </span>
                          </div>
                          <div className="chat-workspace__directory-card-actions">
                            <Button
                              type="button"
                              variant="secondary"
                              size="md"
                              fullWidth
                              onClick={() => void handleContactRequestAction(item)}
                              loading={contactActionKey === item.key}
                            >
                              Добавить в друзья
                            </Button>
                            <Button type="button" variant="secondary-outline" size="md" fullWidth onClick={() => handleOpenDirectoryItem(item)}>
                              Написать
                            </Button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="chat-workspace__hint chat-workspace__hint--search-empty">
                        <img src={sadSearchIcon} alt="" aria-hidden="true" className="chat-workspace__hint-icon" />
                        <span>Ничего не найдено</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}
      {messageMenu ? (
        <div
          className="chat-workspace__message-menu"
          style={{ top: messageMenu.y, left: messageMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="chat-workspace__message-menu-action"
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
            className="chat-workspace__message-menu-action chat-workspace__message-menu-action--danger"
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
