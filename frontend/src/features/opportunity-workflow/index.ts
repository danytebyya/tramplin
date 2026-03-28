import type { Opportunity } from "../../entities/opportunity";
import { useAuthStore } from "../auth";
import type { ContentModerationItem, ContentModerationStatus } from "../moderation/api";

const STORAGE_KEY = "tramplin.opportunity-workflow";
const EVENT_NAME = "tramplin:opportunity-workflow-updated";

export type WorkflowNotification = {
  id: string;
  kind: "opportunity";
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

export type WorkflowApplication = {
  id: string;
  opportunityId: string;
  applicantName: string;
  applicantEmail: string;
  created_at: string;
};

export type WorkflowOpportunityStatus =
  | "pending_review"
  | "changes_requested"
  | "changed"
  | "rejected"
  | "planned"
  | "active"
  | "removed";

export type WorkflowOpportunityRecord = {
  id: string;
  title: string;
  companyName: string;
  authorEmail: string;
  kind: "vacancy" | "internship" | "event" | "mentorship";
  salaryLabel: string;
  address: string;
  city: string;
  locationLabel: string;
  tags: string[];
  levelLabel: string;
  employmentLabel: string;
  formatLabel: string;
  description: string;
  status: WorkflowOpportunityStatus;
  moderationComment: string | null;
  submittedAt: string;
  publishedAt: string | null;
  activeUntil: string | null;
  plannedPublishAt: string | null;
  latitude: number;
  longitude: number;
  responsesCount: number;
};

type WorkflowStorage = {
  opportunities: WorkflowOpportunityRecord[];
  notifications: WorkflowNotification[];
  applications: WorkflowApplication[];
};

type CreateWorkflowOpportunityPayload = {
  title: string;
  companyName: string;
  authorEmail: string;
  kind: WorkflowOpportunityRecord["kind"];
  salaryLabel: string;
  address: string;
  city: string;
  locationLabel: string;
  tags: string[];
  levelLabel: string;
  employmentLabel: string;
  formatLabel: string;
  description: string;
  plannedPublishAt?: string | null;
  latitude: number;
  longitude: number;
};

function getDefaultStorage(): WorkflowStorage {
  return {
    opportunities: [],
    notifications: [],
    applications: [],
  };
}

let workflowActivationTimeoutId: number | null = null;

function readRawStorage() {
  if (typeof window === "undefined") {
    return getDefaultStorage();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultStorage();
    }

    const parsed = JSON.parse(raw) as Partial<WorkflowStorage>;
    return {
      opportunities: parsed.opportunities ?? [],
      notifications: parsed.notifications ?? [],
      applications: parsed.applications ?? [],
    };
  } catch {
    return getDefaultStorage();
  }
}

function scheduleWorkflowActivation() {
  if (typeof window === "undefined") {
    return;
  }

  if (workflowActivationTimeoutId !== null) {
    window.clearTimeout(workflowActivationTimeoutId);
    workflowActivationTimeoutId = null;
  }

  const current = readRawStorage();
  const nextTimestamp = current.opportunities
    .filter((item) => item.status === "planned" && item.plannedPublishAt)
    .map((item) => new Date(item.plannedPublishAt as string).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0];

  if (!nextTimestamp) {
    return;
  }

  const timeoutMs = Math.max(nextTimestamp - Date.now(), 0);

  workflowActivationTimeoutId = window.setTimeout(() => {
    workflowActivationTimeoutId = null;
    normalizeWorkflowStorage({ persist: true });
  }, timeoutMs + 50);
}

function normalizeWorkflowStorage(options?: { persist?: boolean }) {
  const current = readRawStorage();
  const now = Date.now();
  let hasChanged = false;
  const nextNotifications = [...current.notifications];

  const opportunities = current.opportunities.map((item) => {
    if (item.status !== "planned" || !item.plannedPublishAt) {
      return item;
    }

    const publishAt = new Date(item.plannedPublishAt).getTime();

    if (!Number.isFinite(publishAt) || publishAt > now) {
      return item;
    }

    hasChanged = true;
    nextNotifications.unshift(
      buildNotification(
        "Возможность опубликована",
        `Публикация «${item.title}» автоматически стала активной по запланированной дате.`,
        "success",
        ["employer"],
      ),
    );

    return {
      ...item,
      status: "active" as const,
      publishedAt: item.plannedPublishAt,
      activeUntil: addDays(item.plannedPublishAt, 30),
    };
  });

  const normalized = {
    applications: current.applications,
    notifications: nextNotifications,
    opportunities,
  };

  if (options?.persist && hasChanged) {
    writeStorage(normalized);
  } else {
    scheduleWorkflowActivation();
  }

  return normalized;
}

function safeReadStorage() {
  return normalizeWorkflowStorage();
}

function broadcastUpdate() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function writeStorage(nextValue: WorkflowStorage) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue));
  scheduleWorkflowActivation();
  broadcastUpdate();
}

function updateStorage(updater: (current: WorkflowStorage) => WorkflowStorage) {
  const current = safeReadStorage();
  const nextValue = updater(current);
  writeStorage(nextValue);
  return nextValue;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function addDays(value: string, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString();
}

function resolveKindLabel(kind: WorkflowOpportunityRecord["kind"]) {
  if (kind === "internship") {
    return "Стажировка";
  }

  if (kind === "event") {
    return "Мероприятие";
  }

  if (kind === "mentorship") {
    return "Менторская программа";
  }

  return "Вакансия";
}

function resolveFormatLabel(kind: "offline" | "hybrid" | "online") {
  if (kind === "online") {
    return "Онлайн";
  }

  if (kind === "hybrid") {
    return "Гибрид";
  }

  return "Офлайн";
}

function buildNotification(
  title: string,
  message: string,
  severity: WorkflowNotification["severity"],
  audienceRoles: WorkflowNotification["audience_roles"] = ["applicant", "employer"],
): WorkflowNotification {
  return {
    id: createId("local-notification"),
    kind: "opportunity",
    severity,
    title,
    message,
    action_label: "Открыть",
    action_url: "/employer/opportunities",
    is_read: false,
    audience_roles: audienceRoles,
    created_at: new Date().toISOString(),
  };
}

export function isWorkflowOpportunityId(id: string) {
  return id.startsWith("local-opportunity-");
}

export function listWorkflowOpportunities() {
  return safeReadStorage().opportunities;
}

export function listWorkflowNotifications() {
  const currentRole = useAuthStore.getState().role;

  return safeReadStorage().notifications
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

export function hasWorkflowApplication(opportunityId: string, applicantEmail: string) {
  return safeReadStorage().applications.some(
    (item) => item.opportunityId === opportunityId && item.applicantEmail === applicantEmail,
  );
}

export function submitWorkflowApplication(payload: {
  opportunityId: string;
  applicantName: string;
  applicantEmail: string;
}) {
  const current = safeReadStorage();
  const target = current.opportunities.find((item) => item.id === payload.opportunityId);

  if (
    current.applications.some(
      (item) => item.opportunityId === payload.opportunityId && item.applicantEmail === payload.applicantEmail,
    )
  ) {
    return { created: false };
  }

  const application: WorkflowApplication = {
    id: createId("local-application"),
    opportunityId: payload.opportunityId,
    applicantName: payload.applicantName,
    applicantEmail: payload.applicantEmail,
    created_at: new Date().toISOString(),
  };

  const nextNotifications = [...current.notifications];

  nextNotifications.unshift(
    buildNotification(
      "Отклик отправлен",
      target
        ? `Вы откликнулись на возможность «${target.title}». Работодатель получил уведомление.`
        : "Ваш отклик отправлен работодателю.",
      "success",
      ["applicant"],
    ),
  );

  nextNotifications.unshift(
    buildNotification(
      "Новый отклик по вакансии",
      target
        ? `${payload.applicantName} откликнулся на возможность «${target.title}».`
        : `${payload.applicantName} отправил новый отклик.`,
      "info",
      ["employer"],
    ),
  );

  writeStorage({
    applications: [application, ...current.applications],
    notifications: nextNotifications,
    opportunities: current.opportunities.map((item) =>
      item.id === payload.opportunityId
        ? { ...item, responsesCount: item.responsesCount + 1 }
        : item,
    ),
  });

  return { created: true };
}

export function subscribeOpportunityWorkflow(listener: () => void) {
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

export function createWorkflowOpportunity(payload: CreateWorkflowOpportunityPayload) {
  const submittedAt = new Date().toISOString();
  const nextRecord: WorkflowOpportunityRecord = {
    id: createId("local-opportunity"),
    title: payload.title,
    companyName: payload.companyName,
    authorEmail: payload.authorEmail,
    kind: payload.kind,
    salaryLabel: payload.salaryLabel,
    address: payload.address,
    city: payload.city,
    locationLabel: payload.locationLabel,
    tags: payload.tags,
    levelLabel: payload.levelLabel,
    employmentLabel: payload.employmentLabel,
    formatLabel: payload.formatLabel,
    description: payload.description,
    status: "pending_review",
    moderationComment: null,
    submittedAt,
    publishedAt: null,
    activeUntil: null,
    plannedPublishAt: payload.plannedPublishAt ?? null,
    latitude: payload.latitude,
    longitude: payload.longitude,
    responsesCount: 0,
  };

  updateStorage((current) => ({
    ...current,
    opportunities: [nextRecord, ...current.opportunities],
  }));

  return nextRecord;
}

export function updateWorkflowOpportunity(
  opportunityId: string,
  payload: CreateWorkflowOpportunityPayload,
  options?: { resubmit?: boolean },
) {
  const submittedAt = new Date().toISOString();

  updateStorage((current) => ({
    ...current,
    opportunities: current.opportunities.map((item) =>
      item.id === opportunityId
        ? {
            ...item,
            title: payload.title,
            companyName: payload.companyName,
            authorEmail: payload.authorEmail,
            kind: payload.kind,
            salaryLabel: payload.salaryLabel,
            address: payload.address,
            city: payload.city,
            locationLabel: payload.locationLabel,
            tags: payload.tags,
            levelLabel: payload.levelLabel,
            employmentLabel: payload.employmentLabel,
            formatLabel: payload.formatLabel,
            description: payload.description,
            plannedPublishAt: payload.plannedPublishAt ?? null,
            latitude: payload.latitude,
            longitude: payload.longitude,
            status: options?.resubmit ? "changed" : item.status,
            moderationComment: options?.resubmit ? null : item.moderationComment,
            submittedAt: options?.resubmit ? submittedAt : item.submittedAt,
          }
        : item,
    ),
  }));
}

export function removeWorkflowOpportunity(opportunityId: string) {
  updateStorage((current) => ({
    ...current,
    opportunities: current.opportunities.filter((item) => item.id !== opportunityId),
  }));
}

export function reviewWorkflowOpportunity(
  opportunityId: string,
  action: "approve" | "reject" | "request_changes",
  moderatorComment: string | null,
) {
  const reviewedAt = new Date().toISOString();

  updateStorage((current) => {
    const target = current.opportunities.find((item) => item.id === opportunityId);

    if (!target) {
      return current;
    }

    const shouldSchedule =
      action === "approve" &&
      Boolean(target.plannedPublishAt) &&
      new Date(target.plannedPublishAt as string).getTime() > Date.now();
    const nextStatus: WorkflowOpportunityStatus =
      action === "approve"
        ? shouldSchedule
          ? "planned"
          : "active"
        : action === "reject"
          ? "rejected"
          : "changes_requested";

    const nextNotifications = [...current.notifications];

    if (action === "approve") {
      nextNotifications.unshift(
        buildNotification(
          shouldSchedule ? "Возможность запланирована" : "Возможность одобрена",
          shouldSchedule
            ? `Публикация «${target.title}» прошла модерацию и будет опубликована ${formatDateLabel(target.plannedPublishAt as string)}.`
            : `Публикация «${target.title}» прошла модерацию и появилась на карте.`,
          "success",
          ["employer"],
        ),
      );
    } else if (action === "request_changes") {
      nextNotifications.unshift(
        buildNotification(
          "Нужны правки по возможности",
          moderatorComment?.trim()
            ? `По публикации «${target.title}» оставлены замечания: ${moderatorComment.trim()}`
            : `По публикации «${target.title}» нужно внести изменения и отправить её повторно.`,
          "warning",
        ),
      );
    } else {
      nextNotifications.unshift(
        buildNotification(
          "Возможность отклонена",
          moderatorComment?.trim()
            ? `Публикация «${target.title}» отклонена: ${moderatorComment.trim()}`
            : `Публикация «${target.title}» была отклонена куратором.`,
          "attention",
        ),
      );
    }

    return {
      applications: current.applications,
      opportunities: current.opportunities.map((item) =>
        item.id === opportunityId
          ? {
              ...item,
              status: nextStatus,
              moderationComment: moderatorComment?.trim() || null,
              publishedAt: action === "approve" && !shouldSchedule ? reviewedAt : null,
              activeUntil: action === "approve" && !shouldSchedule ? addDays(reviewedAt, 30) : null,
            }
          : item,
      ),
      notifications: nextNotifications,
    };
  });
}

export function markWorkflowNotificationAsRead(notificationId: string) {
  updateStorage((current) => ({
    ...current,
    notifications: current.notifications.map((item) =>
      item.id === notificationId ? { ...item, is_read: true } : item,
    ),
  }));

  return {
    data: {
      unread_count: listWorkflowNotifications().filter((item) => !item.is_read).length,
    },
  };
}

export function hideWorkflowNotification(notificationId: string) {
  updateStorage((current) => ({
    ...current,
    notifications: current.notifications.map((item) =>
      item.id === notificationId ? { ...item, hidden: true } : item,
    ),
  }));

  return {
    data: {
      unread_count: listWorkflowNotifications().filter((item) => !item.is_read).length,
    },
  };
}

export function clearWorkflowNotifications() {
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

export function toManagementOpportunityItem(record: WorkflowOpportunityRecord) {
  return {
    id: record.id,
    title: record.title,
    kind: resolveKindLabel(record.kind),
    salaryLabel: record.salaryLabel,
    locationLabel: record.locationLabel,
    tags: record.tags,
    levelLabel: record.levelLabel,
    employmentLabel: record.employmentLabel,
    description: record.description,
    status: record.status,
    responsesCount: record.status === "active" ? record.responsesCount : undefined,
    publishedAtLabel: record.publishedAt ? formatDateLabel(record.publishedAt) : undefined,
    activeUntilLabel: record.activeUntil ? formatDateLabel(record.activeUntil) : undefined,
    plannedPublishAtLabel: record.plannedPublishAt ? formatDateLabel(record.plannedPublishAt) : undefined,
    plannedCloseAtLabel: undefined,
    closedAtLabel: undefined,
    moderationComment: record.moderationComment ?? undefined,
    submittedAtLabel: formatDateLabel(record.submittedAt),
  };
}

export function toModerationOpportunityItem(record: WorkflowOpportunityRecord): ContentModerationItem {
  const moderationStatus: ContentModerationStatus =
    record.status === "changes_requested"
      ? "changes_requested"
      : record.status === "changed"
        ? "pending_review"
      : record.status === "rejected"
        ? "rejected"
        : record.status === "active" || record.status === "planned"
          ? "approved"
          : "pending_review";

  return {
    id: record.id,
    title: record.title,
    company_name: record.companyName,
    author_email: record.authorEmail,
    submitted_at: record.submittedAt,
    kind: record.kind,
    status: moderationStatus,
    priority:
      moderationStatus === "approved"
        ? "approved"
        : moderationStatus === "rejected"
          ? "rejected"
          : moderationStatus === "changes_requested" || record.status === "changed"
            ? "changes"
            : "new",
    salary_label: record.salaryLabel,
    tags: record.tags,
    format_label: record.formatLabel,
    short_description: record.description,
    description: record.description,
    checklist: {
      salary_specified: Boolean(record.salaryLabel.trim()),
      requirements_completed: record.description.trim().length > 10,
      responsibilities_completed: record.description.trim().length > 30,
      conditions_specified: Boolean(record.address.trim()),
    },
    moderator_comment: record.moderationComment,
  };
}

export function toPublicOpportunity(record: WorkflowOpportunityRecord): Opportunity | null {
  if (record.status !== "active") {
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    companyName: record.companyName,
    companyVerified: true,
    companyRating: 4.8,
    companyReviewsCount: 12,
    salaryLabel: record.salaryLabel,
    locationLabel: record.locationLabel,
    format:
      record.formatLabel === "Онлайн"
        ? "remote"
        : record.formatLabel === "Гибрид"
          ? "hybrid"
          : "office",
    kind: record.kind,
    levelLabel: record.levelLabel,
    employmentLabel: record.employmentLabel,
    description: record.description,
    tags: record.tags,
    latitude: record.latitude,
    longitude: record.longitude,
    accent: "blue",
    businessStatus: "active",
    moderationStatus: "approved",
  };
}

export function buildWorkflowCreatePayload(input: {
  title: string;
  companyName: string;
  authorEmail: string;
  kind: WorkflowOpportunityRecord["kind"];
  salaryLabel: string;
  address: string;
  city: string;
  tags: string[];
  levelLabel?: string;
  employmentLabel?: string;
  format: "offline" | "hybrid" | "online";
  description: string;
  plannedPublishAt?: string;
  latitude: number;
  longitude: number;
}) {
  return {
    title: input.title,
    companyName: input.companyName,
    authorEmail: input.authorEmail,
    kind: input.kind,
    salaryLabel: input.salaryLabel,
    address: input.address,
    city: input.city,
    locationLabel: `${input.address} (${resolveFormatLabel(input.format)})`,
    tags: input.tags,
    levelLabel: input.levelLabel ?? "Middle",
    employmentLabel: input.employmentLabel ?? "Full-time",
    formatLabel: resolveFormatLabel(input.format),
    description: input.description,
    plannedPublishAt: input.plannedPublishAt || null,
    latitude: input.latitude,
    longitude: input.longitude,
  };
}
