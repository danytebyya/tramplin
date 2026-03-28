import { apiClient } from "../../shared/api/client";
import { AUTH_STORAGE_KEY, clearPersistedAuthSession, isAccessTokenExpired, restoreAuthSession, useAuthStore } from "./session";
export { clearClientSession, logoutCurrentSessionRequest, performLogout } from "./logout";
export {
  clearCompanyInviteReturnTo,
  isCompanyInviteReturnTo,
  persistCompanyInviteReturnTo,
  readCompanyInviteReturnTo,
} from "./company-invite";

export type { AuthRole } from "./session";
export {
  AUTH_STORAGE_KEY,
  clearPersistedAuthSession,
  isAccessTokenExpired,
  restoreAuthSession,
  useAuthStore,
} from "./session";
export { AccountActions } from "./account-actions";
export { LogoutButton } from "./logout-button";
export {
  getEmployerAccessState,
  readAccessTokenPayload,
  resolveEmployerFallbackRoute,
} from "./permissions";
export type { EmployerAccessState, EmployerPermissionKey } from "./permissions";

export type RegisterPayload = {
  email: string;
  password: string;
  display_name: string;
  verification_code: string;
  role: "applicant" | "employer";
  company_invite_token?: string;
  applicant_profile?: {
    full_name?: string;
  };
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RefreshPayload = {
  refresh_token: string;
};

export type AuthSuccessResponse = {
  data?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: {
      role?: "applicant" | "employer" | "junior" | "curator" | "admin";
      has_employer_profile?: boolean;
    };
  };
};

export type AccountContextItem = {
  id: string;
  role?: "applicant" | "employer" | "junior" | "curator" | "admin";
  label?: string;
  company_name?: string | null;
  employer_id?: string | null;
  membership_id?: string | null;
  is_default?: boolean;
  is_active?: boolean;
};

export type AccountContextListResponse = {
  data?: {
    items?: AccountContextItem[];
  };
};

export type AccountContextSwitchResponse = AuthSuccessResponse & {
  data?: AuthSuccessResponse["data"] & {
    active_context?: AccountContextItem;
  };
};

export type MeResponse = {
  data?: {
    user?: {
      id?: string;
      email?: string;
      display_name?: string;
      preferred_city?: string | null;
      role?: "applicant" | "employer" | "junior" | "curator" | "admin";
      presence?: {
        is_online?: boolean;
        last_seen_at?: string | null;
      };
      employer_profile?: {
        employer_type?: "company" | "sole_proprietor";
        company_name?: string;
        inn?: string;
        corporate_email?: string;
        website?: string | null;
        verification_status?:
          | "unverified"
          | "pending_review"
          | "verified"
          | "rejected"
          | "changes_requested";
        moderator_comment?: string | null;
      } | null;
    };
  };
};

export type AuthSessionItem = {
  id: string;
  user_agent?: string | null;
  ip_address?: string | null;
  created_at: string;
  expires_at: string;
  is_current: boolean;
};

export type AuthSessionListResponse = {
  data?: {
    items?: AuthSessionItem[];
  };
};

export type AuthLoginHistoryItem = {
  id: string;
  created_at: string;
  is_success: boolean;
  failure_reason?: string | null;
  user_agent?: string | null;
  ip_address?: string | null;
};

export type AuthLoginHistoryResponse = {
  data?: {
    items?: AuthLoginHistoryItem[];
  };
};

export type NotificationPreferenceKey =
  | "new_verification_requests"
  | "content_complaints"
  | "overdue_reviews"
  | "company_profile_changes"
  | "publication_changes"
  | "daily_digest"
  | "weekly_report";

export type NotificationPreferenceGroup = Record<NotificationPreferenceKey, boolean>;

export type UserNotificationPreferencesResponse = {
  data?: {
    email_notifications?: NotificationPreferenceGroup;
    push_notifications?: NotificationPreferenceGroup;
  };
};

export async function registerRequest(payload: RegisterPayload) {
  const response = await apiClient.post("/users", payload);
  return response.data;
}

export async function requestEmailVerificationCode({
  email,
  forceResend = false,
}: {
  email: string;
  forceResend?: boolean;
}) {
  const response = await apiClient.post("/auth/email/request-code", {
    email,
    force_resend: forceResend,
  });
  return response.data;
}

export async function checkEmailAvailabilityRequest(email: string) {
  const response = await apiClient.post<{ data?: { exists?: boolean } }>("/auth/email/check", {
    email,
  });
  return response.data;
}

export async function verifyEmailVerificationCode(email: string, code: string) {
  const response = await apiClient.post("/auth/email/verify-code", { email, code });
  return response.data;
}

export async function loginRequest(payload: LoginPayload) {
  const response = await apiClient.post("/auth/sessions", payload);
  return response.data;
}

export async function refreshSessionRequest(payload: RefreshPayload) {
  const response = await apiClient.post("/auth/tokens", payload);
  return response.data;
}

export async function meRequest() {
  const response = await apiClient.get<MeResponse>("/users/me");
  return response.data;
}

export async function updateMeRequest(payload: {
  email: string;
  display_name: string;
}) {
  const response = await apiClient.put<MeResponse>("/users/me", payload);
  return response.data;
}

export async function updatePreferredCityRequest(preferredCity: string) {
  const response = await apiClient.put<MeResponse>("/users/me/preferred-city", {
    preferred_city: preferredCity,
  });
  return response.data;
}

export async function deleteCurrentUserRequest() {
  const response = await apiClient.delete("/users/me");
  return response.data;
}

export async function listActiveSessionsRequest() {
  const response = await apiClient.get<AuthSessionListResponse>("/auth/sessions");
  return response.data;
}

export async function revokeSessionRequest(sessionId: string) {
  const response = await apiClient.delete(`/auth/sessions/${sessionId}`);
  return response.data;
}

export async function revokeOtherSessionsRequest() {
  const response = await apiClient.delete("/auth/sessions/others");
  return response.data;
}

export async function listLoginHistoryRequest() {
  const response = await apiClient.get<AuthLoginHistoryResponse>("/auth/login-history");
  return response.data;
}

export async function getNotificationPreferencesRequest() {
  const response = await apiClient.get<UserNotificationPreferencesResponse>(
    "/users/me/notification-preferences",
  );
  return response.data;
}

export async function updateNotificationPreferencesRequest(payload: {
  email_notifications: NotificationPreferenceGroup;
  push_notifications: NotificationPreferenceGroup;
}) {
  const response = await apiClient.put<UserNotificationPreferencesResponse>(
    "/users/me/notification-preferences",
    payload,
  );
  return response.data;
}

export async function listAccountContextsRequest() {
  const response = await apiClient.get<AccountContextListResponse>("/auth/contexts");
  return response.data;
}

export async function switchAccountContextRequest(contextId: string) {
  const response = await apiClient.post<AccountContextSwitchResponse>("/auth/context", {
    context_id: contextId,
  });
  return response.data;
}

export function applyAuthSession(response: AuthSuccessResponse) {
  const accessToken = response?.data?.access_token;
  const refreshToken = response?.data?.refresh_token;
  const expiresIn = response?.data?.expires_in;
  const role = response?.data?.user?.role ?? "applicant";

  if (!accessToken || !refreshToken || !expiresIn) {
    return false;
  }

  useAuthStore.getState().setSession(accessToken, refreshToken, role, expiresIn);
  return true;
}

export function resolvePostAuthRoute(
  role: "applicant" | "employer" | "junior" | "curator" | "admin",
  hasEmployerProfile?: boolean,
) {
  if (role === "employer") {
    return hasEmployerProfile ? "/" : "/onboarding/employer";
  }

  return "/";
}
