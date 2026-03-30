import { apiClient } from "../../shared/api/client";

export type ModerationDashboardMetricSet = {
  total_on_moderation: number;
  in_queue: number;
  reviewed_today: number;
  curators_online: number;
};

export type ModerationDashboardDay = {
  label: string;
  count: number;
};

export type ModerationDashboardCategory = {
  label: string;
  count: number;
};

export type ModerationDashboardActivity = {
  id: string;
  title: string;
  status_label: string;
  status_variant:
    | "approved"
    | "pending-review"
    | "rejected"
    | "info-request"
    | "unpublished"
    | "verified";
  subject: string;
  meta: string;
  created_at: string;
};

export type ModerationUrgentTask = {
  id: string;
  subject: string;
  meta: string;
  age_days: number;
};

export type ModerationUrgentTaskGroup = {
  title: string;
  accent: "danger" | "muted" | "accent";
  items: ModerationUrgentTask[];
};

export type ModerationDashboardResponse = {
  data?: {
    metrics?: ModerationDashboardMetricSet;
    weekly_activity?: {
      total_reviewed?: number;
      days?: ModerationDashboardDay[];
      categories?: ModerationDashboardCategory[];
    };
    latest_activity?: ModerationDashboardActivity[];
    urgent_task_groups?: ModerationUrgentTaskGroup[];
  };
};

export type CuratorManagementMetrics = {
  total_curators: number;
  online_curators: number;
  queued_requests: number;
  reviewed_today: number;
};

export type CuratorManagementItem = {
  id: string;
  full_name: string;
  email: string;
  role: "curator" | "admin" | "junior";
  reviewed_today: number;
  status: "online" | "offline";
  last_activity_at: string | null;
};

export type CuratorManagementResponse = {
  data?: {
    metrics?: CuratorManagementMetrics;
    items?: CuratorManagementItem[];
  };
};

export type CuratorCreatePayload = {
  full_name: string;
  email: string;
  password: string;
  role: "admin" | "curator" | "junior";
};

export type CuratorBulkRoleUpdatePayload = {
  curator_ids: string[];
  role: "admin" | "curator" | "junior";
};

export type CuratorUpdatePayload = {
  full_name: string;
  email: string;
  password?: string;
  role: "admin" | "curator" | "junior";
};

export type ModerationSettings = {
  vacancy_review_hours: number;
  internship_review_hours: number;
  event_review_hours: number;
  mentorship_review_hours: number;
};

export type ModerationSettingsResponse = {
  data?: ModerationSettings;
};

export type ContentModerationStatus =
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "unpublished";

export type ContentModerationKind = "vacancy" | "internship" | "event" | "mentorship";

export type ContentModerationMetrics = {
  total_on_moderation: number;
  in_queue: number;
  reviewed_today: number;
  overdue: number;
};

export type ContentModerationKindCounts = {
  all: number;
  vacancies: number;
  internships: number;
  events: number;
  mentorships: number;
};

export type ContentModerationChecklist = {
  salary_specified: boolean;
  requirements_completed: boolean;
  responsibilities_completed: boolean;
  conditions_specified: boolean;
};

export type ContentModerationItem = {
  id: string;
  title: string;
  company_name: string;
  author_email: string | null;
  submitted_at: string;
  kind: ContentModerationKind;
  status: ContentModerationStatus;
  priority: "new" | "complaint" | "changes" | "approved" | "rejected";
  salary_label: string;
  tags: string[];
  format_label: string;
  short_description: string;
  description: string;
  checklist: ContentModerationChecklist;
  moderator_comment: string | null;
};

export type ContentModerationListResponse = {
  data?: {
    metrics?: ContentModerationMetrics;
    counts?: ContentModerationKindCounts;
    items?: ContentModerationItem[];
    total?: number;
    page?: number;
    page_size?: number;
  };
};

export type ContentModerationListFilters = {
  search?: string;
  kinds?: ContentModerationKind[];
  statuses?: ContentModerationStatus[];
  page?: number;
  pageSize?: number;
};

export type EmployerVerificationRequestStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "suspended";

export type EmployerVerificationDocument = {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_url: string | null;
};

export type EmployerVerificationRequestItem = {
  id: string;
  employer_name: string;
  inn: string;
  corporate_email: string | null;
  website_url: string | null;
  phone: string | null;
  social_link: string | null;
  employer_type: string;
  submitted_at: string;
  status: EmployerVerificationRequestStatus;
  moderator_comment: string | null;
  rejection_reason: string | null;
  documents: EmployerVerificationDocument[];
};

export type EmployerVerificationRequestListResponse = {
  data?: {
    items?: EmployerVerificationRequestItem[];
    total?: number;
    page?: number;
    page_size?: number;
  };
};

export type EmployerVerificationReviewPayload = {
  moderator_comment?: string | null;
};

export type EmployerVerificationRequestListFilters = {
  search?: string;
  statuses?: EmployerVerificationRequestStatus[];
  period?: "all" | "today" | "week" | "month";
  page?: number;
  pageSize?: number;
};

export async function getModerationDashboardRequest() {
  const response = await apiClient.get<ModerationDashboardResponse>("/moderation/dashboard");
  return response.data;
}

export async function listContentModerationItemsRequest(
  filters: ContentModerationListFilters,
) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.kinds && filters.kinds.length > 0) {
    filters.kinds.forEach((kind) => {
      params.append("kinds", kind);
    });
  }

  if (filters.statuses && filters.statuses.length > 0) {
    filters.statuses.forEach((status) => {
      params.append("statuses", status);
    });
  }

  params.set("page", String(filters.page ?? 1));
  params.set("page_size", String(filters.pageSize ?? 6));

  const response = await apiClient.get<ContentModerationListResponse>("/moderation/content-items", {
    params,
  });
  return response.data;
}

export async function approveContentModerationItemRequest(
  itemId: string,
  payload: EmployerVerificationReviewPayload,
) {
  const response = await apiClient.post<{ data?: ContentModerationItem }>(
    `/moderation/content-items/${itemId}/approve`,
    payload,
  );
  return response.data;
}

export async function rejectContentModerationItemRequest(
  itemId: string,
  payload: EmployerVerificationReviewPayload,
) {
  const response = await apiClient.post<{ data?: ContentModerationItem }>(
    `/moderation/content-items/${itemId}/reject`,
    payload,
  );
  return response.data;
}

export async function requestContentModerationChangesRequest(
  itemId: string,
  payload: EmployerVerificationReviewPayload,
) {
  const response = await apiClient.post<{ data?: ContentModerationItem }>(
    `/moderation/content-items/${itemId}/request-changes`,
    payload,
  );
  return response.data;
}

export async function listCuratorsRequest() {
  const response = await apiClient.get<CuratorManagementResponse>("/moderation/curators");
  return response.data;
}

export async function createCuratorRequest(payload: CuratorCreatePayload) {
  const response = await apiClient.post<{ data?: CuratorManagementItem }>("/moderation/curators", payload);
  return response.data;
}

export async function updateCuratorRolesRequest(payload: CuratorBulkRoleUpdatePayload) {
  const response = await apiClient.patch<{ data?: { items?: CuratorManagementItem[] } }>(
    "/moderation/curators/role",
    payload,
  );
  return response.data;
}

export async function updateCuratorRequest(curatorId: string, payload: CuratorUpdatePayload) {
  const response = await apiClient.patch<{ data?: CuratorManagementItem }>(
    `/moderation/curators/${curatorId}`,
    payload,
  );
  return response.data;
}

export async function getModerationSettingsRequest() {
  const response = await apiClient.get<ModerationSettingsResponse>("/moderation/settings");
  return response.data;
}

export async function updateModerationSettingsRequest(payload: ModerationSettings) {
  const response = await apiClient.put<ModerationSettingsResponse>("/moderation/settings", payload);
  return response.data;
}

export async function listEmployerVerificationRequestsRequest(
  filters: EmployerVerificationRequestListFilters,
) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.statuses && filters.statuses.length > 0) {
    filters.statuses.forEach((status) => {
      params.append("statuses", status);
    });
  }

  if (filters.period && filters.period !== "all") {
    params.set("period", filters.period);
  }

  params.set("page", String(filters.page ?? 1));
  params.set("page_size", String(filters.pageSize ?? 6));

  const response = await apiClient.get<EmployerVerificationRequestListResponse>(
    "/moderation/employer-verification-requests",
    {
      params,
    },
  );
  return response.data;
}

export async function approveEmployerVerificationRequest(
  requestId: string,
  payload: EmployerVerificationReviewPayload,
) {
  const response = await apiClient.post<{ data?: EmployerVerificationRequestItem }>(
    `/moderation/employer-verification-requests/${requestId}/approve`,
    payload,
  );
  return response.data;
}

export async function rejectEmployerVerificationRequest(
  requestId: string,
  payload: EmployerVerificationReviewPayload,
) {
  const response = await apiClient.post<{ data?: EmployerVerificationRequestItem }>(
    `/moderation/employer-verification-requests/${requestId}/reject`,
    payload,
  );
  return response.data;
}

export async function requestEmployerVerificationChanges(
  requestId: string,
  payload: EmployerVerificationReviewPayload,
) {
  const response = await apiClient.post<{ data?: EmployerVerificationRequestItem }>(
    `/moderation/employer-verification-requests/${requestId}/request-changes`,
    payload,
  );
  return response.data;
}
