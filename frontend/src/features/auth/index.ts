import { create } from "zustand";

import { apiClient } from "../../shared/api/client";

export type AuthRole = "applicant" | "employer";

type AuthState = {
  accessToken: string | null;
  role: AuthRole | null;
  setSession: (accessToken: string, role: AuthRole) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  role: null,
  setSession: (accessToken, role) => set({ accessToken, role }),
  clearSession: () => set({ accessToken: null, role: null }),
}));

export type RegisterPayload = {
  email: string;
  password: string;
  display_name: string;
  verification_code: string;
  role: AuthRole;
  applicant_profile?: {
    full_name?: string;
  };
};

export type LoginPayload = {
  email: string;
  password: string;
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

export async function meRequest() {
  const response = await apiClient.get("/users/me");
  return response.data;
}

export function resolvePostAuthRoute(role: AuthRole, hasEmployerProfile?: boolean) {
  if (role === "employer") {
    return hasEmployerProfile ? "/dashboard/employer" : "/onboarding/employer";
  }

  return "/";
}
