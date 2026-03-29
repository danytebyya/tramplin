import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ReactNode, useEffect, useMemo } from "react";
import { BrowserRouter, useNavigate } from "react-router-dom";

import { appQueryClient } from "../query-client";
import {
  clearClientSession,
  isAccessTokenExpired,
  listAccountContextsRequest,
  listActiveSessionsRequest,
  restoreAuthSession,
  switchAccountContextRequest,
  useAuthStore,
} from "../../features/auth";
import { canUseChatCrypto, ensureChatKeyPair, getMyChatKeyRequest, getStoredChatKeyPair, storeChatKeyPair, upsertMyChatKeyRequest } from "../../features/chat";
import { useNotificationsRealtime } from "../../features/notifications";
import { usePresenceRealtime } from "../../features/presence";

type AppProvidersProps = {
  children: ReactNode;
};

const SESSION_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "click",
  "keydown",
  "mousemove",
  "scroll",
  "touchstart",
];
const SESSION_ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const SESSION_REFRESH_BUFFER_MS = 60 * 1000;
const SESSION_VALIDATION_INTERVAL_MS = 15 * 1000;

function AuthSessionBootstrap() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const accessTokenExpiresAt = useAuthStore((state) => state.accessTokenExpiresAt);
  const lastActivityAt = useAuthStore((state) => state.lastActivityAt);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  useNotificationsRealtime({
    enabled: Boolean(accessToken),
    onMessage: (payload) => {
      if (payload?.type !== "company_membership_removed") {
        return;
      }

      const removedMembershipId =
        typeof payload.membership_id === "string" ? payload.membership_id : null;
      const currentAccessToken = useAuthStore.getState().accessToken;
      const currentRefreshToken = useAuthStore.getState().refreshToken;

      if (!removedMembershipId || !currentAccessToken || !currentRefreshToken) {
        return;
      }

      try {
        const [, tokenPayload] = currentAccessToken.split(".");
        if (!tokenPayload) {
          return;
        }

        const decodedPayload = JSON.parse(
          window.atob(tokenPayload.replace(/-/g, "+").replace(/_/g, "/")),
        ) as { active_membership_id?: string };

        if (decodedPayload.active_membership_id !== removedMembershipId) {
          return;
        }
      } catch {
        return;
      }

      void (async () => {
        try {
          const contextsResponse = await listAccountContextsRequest();
          const baseContext = contextsResponse?.data?.items?.find((item) => item.is_default);

          if (!baseContext?.id) {
            clearClientSession();
            return;
          }

          const switchResponse = await switchAccountContextRequest(baseContext.id);
          const nextAccessToken = switchResponse?.data?.access_token;
          const nextExpiresIn = switchResponse?.data?.expires_in;
          const nextRole = (switchResponse?.data?.active_context?.role ?? switchResponse?.data?.user?.role ?? "applicant") as
            | "applicant"
            | "employer"
            | "junior"
            | "curator"
            | "admin";

          if (!nextAccessToken || !nextExpiresIn) {
            clearClientSession();
            return;
          }

          useAuthStore.getState().setSession(nextAccessToken, currentRefreshToken, nextRole, nextExpiresIn);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["auth", "contexts"] }),
            queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
            queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] }),
          ]);
          navigate("/", { replace: true });
        } catch {
          clearClientSession();
        }
      })();
    },
  });

  useEffect(() => {
    let cancelled = false;

    const hydrateSession = async () => {
      const state = useAuthStore.getState();

      if (state.refreshToken && (!state.accessToken || isAccessTokenExpired(state.accessTokenExpiresAt))) {
        await restoreAuthSession();
      }

      if (!cancelled) {
        useAuthStore.getState().setHydrated(true);
      }
    };

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") {
      return;
    }

    let lastTouchAt = 0;

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastTouchAt < 1000) {
        return;
      }

      lastTouchAt = now;
      useAuthStore.getState().touchActivity();

      const state = useAuthStore.getState();
      if (state.refreshToken && isAccessTokenExpired(state.accessTokenExpiresAt)) {
        void restoreAuthSession();
      }
    };

    SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated || !refreshToken || !accessToken || !accessTokenExpiresAt) {
      return;
    }

    const msUntilRefresh = Math.max(0, accessTokenExpiresAt - Date.now() - SESSION_REFRESH_BUFFER_MS);
    const timeoutId = window.setTimeout(() => {
      const state = useAuthStore.getState();
      const wasRecentlyActive =
        state.lastActivityAt !== null && Date.now() - state.lastActivityAt <= SESSION_ACTIVE_WINDOW_MS;

      if (state.refreshToken && wasRecentlyActive) {
        void restoreAuthSession();
      }
    }, msUntilRefresh);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, accessTokenExpiresAt, isHydrated, lastActivityAt, refreshToken]);

  useEffect(() => {
    if (!isHydrated || !refreshToken) {
      return;
    }

    let cancelled = false;

    const validateCurrentSession = async () => {
      try {
        const response = await listActiveSessionsRequest();
        const hasCurrentSession = Boolean(response?.data?.items?.some((session) => session.is_current));

        if (!cancelled && !hasCurrentSession) {
          clearClientSession();
        }
      } catch {
        // Unauthorized responses are handled by the API client interceptor.
      }
    };

    void validateCurrentSession();
    const intervalId = window.setInterval(() => {
      void validateCurrentSession();
    }, SESSION_VALIDATION_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void validateCurrentSession();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isHydrated, refreshToken]);

  return null;
}

function ChatKeyBootstrap() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  useEffect(() => {
    if (!isHydrated || !accessToken) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      if (!canUseChatCrypto()) {
        return;
      }

      const storedPair = getStoredChatKeyPair();
      const remotePair = await getMyChatKeyRequest();
      if (!storedPair && remotePair?.publicKeyJwk && !remotePair.privateKeyJwk) {
        return;
      }

      const pair =
        storedPair ??
        (remotePair?.privateKeyJwk
          ? {
              algorithm: remotePair.algorithm,
              publicKeyJwk: remotePair.publicKeyJwk,
              privateKeyJwk: remotePair.privateKeyJwk,
            }
          : await ensureChatKeyPair());

      if (isCancelled) {
        return;
      }

      storeChatKeyPair(pair);

      await upsertMyChatKeyRequest({
        algorithm: pair.algorithm,
        public_key_jwk: pair.publicKeyJwk,
        private_key_jwk: pair.privateKeyJwk,
      });
    })().catch(() => {
      // Silent bootstrap: chat key provisioning should not break app startup.
    });

    return () => {
      isCancelled = true;
    };
  }, [accessToken, isHydrated]);

  return null;
}

function PresenceRealtimeBootstrap() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  usePresenceRealtime(
    (event) => {
      if (event.type !== "presence_updated") {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ["chat", "contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    {
      enabled: isHydrated && Boolean(accessToken),
    },
  );

  if (!isHydrated || !accessToken) {
    return null;
  }

  return null;
}

export function AppProviders({ children }: AppProvidersProps) {
  const queryClient = useMemo(() => appQueryClient, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthSessionBootstrap />
        <ChatKeyBootstrap />
        <PresenceRealtimeBootstrap />
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
