import { apiClient } from "../../shared/api/client";
import { AUTH_STORAGE_KEY, clearPersistedAuthSession, isAccessTokenExpired, restoreAuthSession, useAuthStore } from "./session";

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

export type RegisterPayload = {
  email: string;
  password: string;
  display_name: string;
  verification_code: string;
  role: "applicant" | "employer";
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
      role?: "applicant" | "employer";
      has_employer_profile?: boolean;
    };
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
  const response = await apiClient.get("/users/me");
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

export function resolvePostAuthRoute(role: "applicant" | "employer", hasEmployerProfile?: boolean) {
  if (role === "employer") {
    return hasEmployerProfile ? "/" : "/onboarding/employer";
  }

  return "/";
}
