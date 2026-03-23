import axios from "axios";
import { create } from "zustand";
import { createJSONStorage, persist, StateStorage } from "zustand/middleware";

import { env } from "../../shared/config/env";

export type AuthRole = "applicant" | "employer";

export const AUTH_STORAGE_KEY = "tramplin.auth.session";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${AUTH_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function removeCookie(name: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

const authStateStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(name) ?? readCookie(name);
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(name, value);
    writeCookie(name, value);
  },
  removeItem: (name) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(name);
    removeCookie(name);
  },
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  role: AuthRole | null;
  accessTokenExpiresAt: number | null;
  lastActivityAt: number | null;
  isHydrated: boolean;
  setSession: (
    accessToken: string,
    refreshToken: string,
    role: AuthRole,
    expiresInSeconds: number,
  ) => void;
  clearSession: () => void;
  touchActivity: () => void;
  setHydrated: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      role: null,
      accessTokenExpiresAt: null,
      lastActivityAt: null,
      isHydrated: false,
      setSession: (accessToken, refreshToken, role, expiresInSeconds) =>
        set({
          accessToken,
          refreshToken,
          role,
          accessTokenExpiresAt: Date.now() + expiresInSeconds * 1000,
          lastActivityAt: Date.now(),
        }),
      clearSession: () =>
        set({
          accessToken: null,
          refreshToken: null,
          role: null,
          accessTokenExpiresAt: null,
          lastActivityAt: null,
        }),
      touchActivity: () => set({ lastActivityAt: Date.now() }),
      setHydrated: (value) => set({ isHydrated: value }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => authStateStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        role: state.role,
        accessTokenExpiresAt: state.accessTokenExpiresAt,
        lastActivityAt: state.lastActivityAt,
      }),
    },
  ),
);

export function clearPersistedAuthSession() {
  authStateStorage.removeItem(AUTH_STORAGE_KEY);
}

export function isAccessTokenExpired(expiresAt: number | null) {
  if (!expiresAt) {
    return true;
  }

  return Date.now() >= expiresAt - 30_000;
}

type RefreshResponse = {
  data?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: {
      role?: AuthRole;
    };
  };
};

let refreshSessionPromise: Promise<string | null> | null = null;

export async function restoreAuthSession() {
  const state = useAuthStore.getState();

  if (!state.refreshToken) {
    state.clearSession();
    clearPersistedAuthSession();
    return null;
  }

  if (refreshSessionPromise) {
    return refreshSessionPromise;
  }

  refreshSessionPromise = (async () => {
    try {
      const response = await axios.post<RefreshResponse>(
        `${env.apiBaseUrl}/auth/tokens`,
        {
          refresh_token: state.refreshToken,
        },
        {
          withCredentials: true,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const accessToken = response.data?.data?.access_token;
      const refreshToken = response.data?.data?.refresh_token;
      const expiresIn = response.data?.data?.expires_in;
      const role = response.data?.data?.user?.role ?? state.role ?? "applicant";

      if (!accessToken || !refreshToken || !expiresIn) {
        throw new Error("Missing auth tokens in refresh response");
      }

      useAuthStore.getState().setSession(accessToken, refreshToken, role, expiresIn);
      return accessToken;
    } catch {
      useAuthStore.getState().clearSession();
      clearPersistedAuthSession();
      return null;
    } finally {
      refreshSessionPromise = null;
    }
  })();

  return refreshSessionPromise;
}
