import { useEffect, useRef } from "react";

import { env } from "../../shared/config/env";
import { useAuthStore } from "../auth";

function getNotificationsWebSocketUrl(accessToken: string) {
  const apiOrigin = env.apiBaseUrl.replace(/\/api\/v1$/, "");
  const wsOrigin = apiOrigin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${wsOrigin}/api/v1/notifications/stream?token=${encodeURIComponent(accessToken)}`;
}

type UseNotificationsRealtimeOptions = {
  enabled?: boolean;
  onMessage?: () => void;
};

export function useNotificationsRealtime(options: UseNotificationsRealtimeOptions = {}) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const enabled = options.enabled ?? true;
  const onMessage = options.onMessage;
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!accessToken || !enabled) {
      return;
    }

    let isDisposed = false;
    let reconnectTimeoutId: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (isDisposed) {
        return;
      }

      socket = new WebSocket(getNotificationsWebSocketUrl(accessToken));

      socket.onopen = () => {
        if (isDisposed) {
          socket?.close();
        }
      };

      socket.onmessage = () => {
        onMessageRef.current?.();
      };

      socket.onclose = () => {
        if (isDisposed) {
          return;
        }

        reconnectTimeoutId = window.setTimeout(() => {
          connect();
        }, 2_000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeoutId !== null) {
        window.clearTimeout(reconnectTimeoutId);
      }
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;

        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }
    };
  }, [accessToken, enabled]);
}
