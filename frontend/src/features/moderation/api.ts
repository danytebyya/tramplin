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

export type ModerationSettings = {
  vacancy_review_hours: number;
  internship_review_hours: number;
  event_review_hours: number;
  mentorship_review_hours: number;
};

export type ModerationSettingsResponse = {
  data?: ModerationSettings;
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
  const response = await apiClient.get<EmployerVerificationRequestListResponse>(
    "/moderation/employer-verification-requests",
    {
      params: {
        search: filters.search || undefined,
        statuses:
          filters.statuses && filters.statuses.length > 0 ? filters.statuses : undefined,
        period: filters.period && filters.period !== "all" ? filters.period : undefined,
        page: filters.page ?? 1,
        page_size: filters.pageSize ?? 6,
      },
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
