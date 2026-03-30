import { useAuthStore } from "../auth";

const STORAGE_KEY = "tramplin.employer-responses";
const EVENT_NAME = "tramplin:employer-responses-updated";

export type EmployerResponseStatus = "new" | "accepted" | "reserve" | "rejected";

export type EmployerResponseRecord = {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  applicantUserId: string;
  applicantName: string;
  appliedAt: string;
  status: EmployerResponseStatus;
  interviewDate: string | null;
  interviewStartTime: string | null;
  interviewEndTime: string | null;
  interviewFormat: string | null;
  meetingLink: string | null;
  contactEmail: string | null;
  checklist: string | null;
  employerComment: string | null;
  updatedAt: string;
};

export type EmployerResponseNotification = {
  id: string;
  kind: "application";
  severity: "info" | "success" | "warning" | "attention";
  title: string;
  message: string;
  action_label?: string | null;
  action_url?: string | null;
  is_read: boolean;
  hidden?: boolean;
  audience_roles?: Array<"applicant" | "employer">;
  created_at: string;
};

type EmployerResponseStorage = {
  records: EmployerResponseRecord[];
  notifications: EmployerResponseNotification[];
};

type SaveEmployerResponsePayload = Omit<EmployerResponseRecord, "id" | "updatedAt">;

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultStorage(): EmployerResponseStorage {
  return {
    records: [],
    notifications: [],
  };
}

function readStorage() {
  if (typeof window === "undefined") {
    return getDefaultStorage();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultStorage();
    }

    const parsed = JSON.parse(raw) as Partial<EmployerResponseStorage>;

    return {
      records: parsed.records ?? [],
      notifications: parsed.notifications ?? [],
    };
  } catch {
    return getDefaultStorage();
  }
}

function writeStorage(nextValue: EmployerResponseStorage) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function updateStorage(updater: (current: EmployerResponseStorage) => EmployerResponseStorage) {
  const current = readStorage();
  const nextValue = updater(current);
  writeStorage(nextValue);
  return nextValue;
}

function formatAppliedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatInterviewDate(value: string) {
  const parsed = new Date(value);
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
  const weekdayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(parsed);

  return `${dateLabel} (${weekdayLabel})`;
}

function buildChecklistBlock(value: string | null) {
  const items = (value ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return null;
  }

  return `Что взять с собой:\n${items.map((item) => `│  • ${item}`).join("\n")}`;
}

function buildApplicantMessage(payload: SaveEmployerResponsePayload) {
  if (payload.status === "accepted") {
    return [
      "Информация для собеседования",
      payload.interviewDate ? `Дата: ${formatInterviewDate(payload.interviewDate)}` : null,
      payload.interviewStartTime && payload.interviewEndTime
        ? `Время: ${payload.interviewStartTime} - ${payload.interviewEndTime} (МСК)`
        : null,
      payload.interviewFormat ? `Формат: ${payload.interviewFormat}` : null,
      payload.meetingLink ? `Ссылка: ${payload.meetingLink}  (будет активна за 15 минут до начала)` : null,
      payload.contactEmail ? `Контакты: ${payload.contactEmail}` : null,
      buildChecklistBlock(payload.checklist),
      payload.employerComment?.trim() ? `Комментарий работодателя: ${payload.employerComment.trim()}` : null,
    ].filter(Boolean).join("\n");
  }

  if (payload.status === "reserve") {
    return [
      `Ваш отклик на возможность «${payload.opportunityTitle}» переведен в резерв.`,
      payload.employerComment?.trim() ? `Комментарий работодателя: ${payload.employerComment.trim()}` : null,
    ].filter(Boolean).join("\n");
  }

  if (payload.status === "rejected") {
    return [
      `По отклику на возможность «${payload.opportunityTitle}» принято решение об отказе.`,
      payload.employerComment?.trim() ? `Комментарий работодателя: ${payload.employerComment.trim()}` : null,
    ].filter(Boolean).join("\n");
  }

  return [
    `Статус отклика на возможность «${payload.opportunityTitle}» обновлен.`,
    payload.employerComment?.trim() ? `Комментарий работодателя: ${payload.employerComment.trim()}` : null,
  ].filter(Boolean).join("\n");
}

function buildApplicantNotification(payload: SaveEmployerResponsePayload): EmployerResponseNotification {
  return {
    id: createId("local-response-notification"),
    kind: "application",
    severity:
      payload.status === "accepted"
        ? "success"
        : payload.status === "reserve"
          ? "info"
          : payload.status === "rejected"
            ? "attention"
            : "info",
    title:
      payload.status === "accepted"
        ? "Приглашение на собеседование"
        : payload.status === "reserve"
          ? "Отклик переведен в резерв"
          : payload.status === "rejected"
            ? "Отклик отклонен"
            : "Статус отклика обновлен",
    message: buildApplicantMessage(payload),
    action_label: "Открыть",
    action_url: "/applications",
    is_read: false,
    audience_roles: ["applicant"],
    created_at: new Date().toISOString(),
  };
}

export function listEmployerResponseRecords() {
  return readStorage().records;
}

export function getEmployerResponseRecord(opportunityId: string, applicantUserId: string) {
  return readStorage().records.find(
    (item) => item.opportunityId === opportunityId && item.applicantUserId === applicantUserId,
  ) ?? null;
}

export function saveEmployerResponse(payload: SaveEmployerResponsePayload) {
  const existing = getEmployerResponseRecord(payload.opportunityId, payload.applicantUserId);
  const nextRecord: EmployerResponseRecord = {
    id: existing?.id ?? createId("local-employer-response"),
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  updateStorage((current) => ({
    records: [nextRecord, ...current.records.filter((item) => item.id !== nextRecord.id)],
    notifications: [buildApplicantNotification(payload), ...current.notifications],
  }));

  return nextRecord;
}

export function listEmployerResponseNotifications() {
  const currentRole = useAuthStore.getState().role;

  return readStorage().notifications
    .filter((item) => !item.hidden)
    .filter((item) => {
      if (!item.audience_roles || item.audience_roles.length === 0) {
        return true;
      }

      if (currentRole !== "applicant" && currentRole !== "employer") {
        return false;
      }

      return item.audience_roles.includes(currentRole);
    })
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

export function markEmployerResponseNotificationAsRead(notificationId: string) {
  updateStorage((current) => ({
    ...current,
    notifications: current.notifications.map((item) =>
      item.id === notificationId ? { ...item, is_read: true } : item,
    ),
  }));

  return {
    data: {
      unread_count: listEmployerResponseNotifications().filter((item) => !item.is_read).length,
    },
  };
}

export function hideEmployerResponseNotification(notificationId: string) {
  updateStorage((current) => ({
    ...current,
    notifications: current.notifications.map((item) =>
      item.id === notificationId ? { ...item, hidden: true } : item,
    ),
  }));

  return {
    data: {
      unread_count: listEmployerResponseNotifications().filter((item) => !item.is_read).length,
    },
  };
}

export function clearEmployerResponseNotifications() {
  updateStorage((current) => ({
    ...current,
    notifications: current.notifications.map((item) => ({ ...item, hidden: true })),
  }));

  return {
    data: {
      unread_count: 0,
    },
  };
}

export function subscribeEmployerResponses(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleUpdate = () => listener();
  window.addEventListener(EVENT_NAME, handleUpdate);
  window.addEventListener("storage", handleUpdate);

  return () => {
    window.removeEventListener(EVENT_NAME, handleUpdate);
    window.removeEventListener("storage", handleUpdate);
  };
}

export function formatEmployerResponseAppliedAt(value: string) {
  return formatAppliedAt(value);
}
