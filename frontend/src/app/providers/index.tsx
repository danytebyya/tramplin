import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useMemo } from "react";
import { BrowserRouter } from "react-router-dom";

import { clearClientSession, listActiveSessionsRequest, isAccessTokenExpired, restoreAuthSession, useAuthStore } from "../../features/auth";

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
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const accessTokenExpiresAt = useAuthStore((state) => state.accessTokenExpiresAt);
  const lastActivityAt = useAuthStore((state) => state.lastActivityAt);
  const isHydrated = useAuthStore((state) => state.isHydrated);

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

export function AppProviders({ children }: AppProvidersProps) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthSessionBootstrap />
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
