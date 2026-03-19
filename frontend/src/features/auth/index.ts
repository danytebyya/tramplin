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
  role: AuthRole;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export async function registerRequest(payload: RegisterPayload) {
  const response = await apiClient.post("/auth/register", payload);
  return response.data;
}

export async function loginRequest(payload: LoginPayload) {
  const response = await apiClient.post("/auth/login", payload);
  return response.data;
}

export async function meRequest() {
  const response = await apiClient.get("/auth/me");
  return response.data;
}
