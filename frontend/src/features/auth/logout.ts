import { apiClient } from "../../shared/api/client";
import { clearPersistedAuthSession, useAuthStore } from "./session";

export async function logoutCurrentSessionRequest(refreshToken: string) {
  const response = await apiClient.delete("/auth/sessions/current", {
    data: {
      refresh_token: refreshToken,
    },
  });
  return response.data;
}

export function clearClientSession(options?: {
  redirectTo?: string;
  beforeRedirect?: () => void;
}) {
  useAuthStore.getState().clearSession();
  clearPersistedAuthSession();
  options?.beforeRedirect?.();

  if (typeof window !== "undefined" && window.location.pathname !== (options?.redirectTo ?? "/")) {
    window.location.replace(options?.redirectTo ?? "/");
  }
}

export async function performLogout(options?: {
  redirectTo?: string;
  beforeRedirect?: () => void;
}) {
  const { refreshToken } = useAuthStore.getState();

  if (refreshToken) {
    try {
      await logoutCurrentSessionRequest(refreshToken);
    } catch {
      // Even if the backend session is already gone, the client state still needs cleanup.
    }
  }

  clearClientSession(options);
}
