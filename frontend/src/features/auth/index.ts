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
  getModerationAccessState,
  readAccessTokenPayload,
  resolveEmployerFallbackRoute,
  resolveModerationFallbackRoute,
} from "./permissions";
export type { EmployerAccessState, EmployerPermissionKey, ModerationAccessState } from "./permissions";

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

export type PasswordResetPayload = {
  email: string;
  force_resend?: boolean;
};

export type PasswordResetConfirmPayload = {
  email: string;
  code: string;
  new_password: string;
};

export type PasswordChangePayload = {
  current_password: string;
  new_password: string;
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
      public_id?: string | null;
      email?: string;
      display_name?: string;
      preferred_city?: string | null;
      role?: "applicant" | "employer" | "junior" | "curator" | "admin";
      presence?: {
        is_online?: boolean;
        last_seen_at?: string | null;
      };
      applicant_profile?: {
        full_name?: string | null;
        university?: string | null;
        about?: string | null;
        study_course?: number | null;
        graduation_year?: number | null;
        resume_url?: string | null;
        portfolio_url?: string | null;
        level?: string | null;
        desired_salary_from?: number | null;
        preferred_location?: string | null;
        employment_types?: string[] | null;
        work_formats?: string[] | null;
        hard_skills?: string[] | null;
        soft_skills?: string[] | null;
        languages?: string[] | null;
        github_url?: string | null;
        gitlab_url?: string | null;
        bitbucket_url?: string | null;
        linkedin_url?: string | null;
        habr_url?: string | null;
        avatar_url?: string | null;
        profile_visibility?: "public" | "authorized" | "hidden" | null;
        show_resume?: boolean | null;
        profile_views_count?: number | null;
        recommendations_count?: number | null;
      } | null;
      employer_profile?: {
        employer_type?: "company" | "sole_proprietor";
        company_name?: string;
        inn?: string;
        corporate_email?: string;
        website?: string | null;
        phone?: string | null;
        social_link?: string | null;
        max_link?: string | null;
        rutube_link?: string | null;
        avatar_url?: string | null;
        short_description?: string | null;
        office_addresses?: string[] | null;
        activity_areas?: string[] | null;
        organization_size?: string | null;
        foundation_year?: number | null;
        profile_views_count?: number | null;
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

export type ApplicantProfilePayload =
  NonNullable<NonNullable<NonNullable<MeResponse["data"]>["user"]>["applicant_profile"]>;

export type ApplicantDashboardProject = {
  id: string;
  title: string;
  description?: string | null;
  technologies?: string | null;
  period_label?: string | null;
  role_name?: string | null;
  repository_url?: string | null;
};

export type ApplicantDashboardAchievement = {
  id: string;
  title: string;
  event_name?: string | null;
  project_name?: string | null;
  award?: string | null;
};

export type ApplicantDashboardCertificate = {
  id: string;
  title: string;
  organization_name?: string | null;
  issued_at?: string | null;
  credential_url?: string | null;
};

export type ApplicantDashboardResponse = {
  data?: {
    profile?: ApplicantProfilePayload;
    preferred_city?: string | null;
    stats?: {
      profile_views_count?: number;
      applications_count?: number;
      responses_count?: number;
      invitations_count?: number;
      recommendations_count?: number;
    };
    links?: {
      github_url?: string | null;
      gitlab_url?: string | null;
      bitbucket_url?: string | null;
      linkedin_url?: string | null;
      portfolio_url?: string | null;
      habr_url?: string | null;
      resume_url?: string | null;
    };
    career_interests?: {
      desired_salary_from?: number | null;
      preferred_city?: string | null;
      preferred_location?: string | null;
      employment_types?: string[];
      work_formats?: string[];
    };
    projects?: ApplicantDashboardProject[];
    achievements?: ApplicantDashboardAchievement[];
    certificates?: ApplicantDashboardCertificate[];
  };
};

export type PublicUserProfileResponse = {
  data?: {
    public_id?: string;
    display_name?: string;
    preferred_city?: string | null;
    role?: "applicant" | "employer";
    presence?: {
      is_online?: boolean;
      last_seen_at?: string | null;
    };
    applicant_dashboard?: ApplicantDashboardResponse["data"] | null;
    employer_profile?: NonNullable<NonNullable<MeResponse["data"]>["user"]>["employer_profile"];
    employer_stats?: {
      active_opportunities_count?: number;
      responses_count?: number;
    } | null;
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
  | "chat_reminders"
  | "daily_digest"
  | "weekly_report";

export type NotificationPreferenceGroup = Record<NotificationPreferenceKey, boolean>;

export type UserNotificationPreferencesResponse = {
  data?: {
    email_notifications?: NotificationPreferenceGroup;
    push_notifications?: NotificationPreferenceGroup;
  };
};

export type ApplicantPrivacySettingsResponse = {
  data?: {
    profile_visibility?: "public" | "authorized" | "hidden";
    show_resume?: boolean;
  };
};

export type DeleteCurrentUserResponse = {
  data?: {
    deleted?: boolean;
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

export async function requestPasswordResetCode(payload: PasswordResetPayload) {
  const response = await apiClient.post("/auth/password/request-reset-code", {
    email: payload.email,
    force_resend: payload.force_resend ?? false,
  });
  return response.data;
}

export async function verifyPasswordResetCode(email: string, code: string) {
  const response = await apiClient.post("/auth/password/verify-reset-code", { email, code });
  return response.data;
}

export async function resetPasswordRequest(payload: PasswordResetConfirmPayload) {
  const response = await apiClient.post<AuthSuccessResponse>("/auth/password/reset", payload);
  return response.data;
}

export async function changePasswordRequest(payload: PasswordChangePayload) {
  const response = await apiClient.post("/auth/password/change", payload);
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

export async function applicantDashboardRequest() {
  const response = await apiClient.get<ApplicantDashboardResponse>("/users/me/applicant-dashboard");
  return response.data;
}

export async function uploadApplicantAvatarRequest(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<MeResponse>("/users/me/applicant-avatar", formData);
  return response.data;
}

export async function deleteApplicantAvatarRequest() {
  const response = await apiClient.delete<MeResponse>("/users/me/applicant-avatar");
  return response.data;
}

export async function publicUserProfileRequest(publicId: string) {
  const response = await apiClient.get<PublicUserProfileResponse>(`/users/public/${publicId}`);
  return response.data;
}

export async function updateApplicantDashboardRequest(payload: {
  full_name?: string | null;
  university?: string | null;
  about?: string | null;
  study_course?: number | null;
  graduation_year?: number | null;
  level?: string | null;
  hard_skills?: string[];
  soft_skills?: string[];
  languages?: string[];
  links?: {
    github_url?: string | null;
    gitlab_url?: string | null;
    bitbucket_url?: string | null;
    linkedin_url?: string | null;
    portfolio_url?: string | null;
    habr_url?: string | null;
    resume_url?: string | null;
  };
  career_interests?: {
    desired_salary_from?: number | null;
    preferred_city?: string | null;
    preferred_location?: string | null;
    employment_types?: string[];
    work_formats?: string[];
  };
  projects?: Array<{
    id?: string | null;
    title: string;
    description?: string | null;
    technologies?: string | null;
    period_label?: string | null;
    role_name?: string | null;
    repository_url?: string | null;
  }>;
  achievements?: Array<{
    id?: string | null;
    title: string;
    event_name?: string | null;
    project_name?: string | null;
    award?: string | null;
  }>;
  certificates?: Array<{
    id?: string | null;
    title: string;
    organization_name?: string | null;
    issued_at?: string | null;
    credential_url?: string | null;
  }>;
}) {
  const response = await apiClient.put<ApplicantDashboardResponse>("/users/me/applicant-dashboard", payload);
  return response.data;
}

export async function deleteCurrentUserRequest() {
  const response = await apiClient.delete<DeleteCurrentUserResponse>("/users/me");
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

export async function updateApplicantPrivacySettingsRequest(payload: {
  profile_visibility: "public" | "authorized" | "hidden";
  show_resume: boolean;
}) {
  const response = await apiClient.put<ApplicantPrivacySettingsResponse>("/users/me/applicant-privacy", payload);
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
