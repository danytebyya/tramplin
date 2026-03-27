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
  onMessage?: (payload?: Record<string, unknown>) => void;
};

type MessageListener = (payload?: Record<string, unknown>) => void;

type NotificationsSocketManager = {
  accessToken: string | null;
  socket: WebSocket | null;
  reconnectTimeoutId: number | null;
  listeners: Set<MessageListener>;
  shouldReconnect: boolean;
};

const socketManager: NotificationsSocketManager = {
  accessToken: null,
  socket: null,
  reconnectTimeoutId: null,
  listeners: new Set(),
  shouldReconnect: false,
};

function clearReconnectTimeout() {
  if (socketManager.reconnectTimeoutId !== null) {
    window.clearTimeout(socketManager.reconnectTimeoutId);
    socketManager.reconnectTimeoutId = null;
  }
}

function notifyListeners(payload?: Record<string, unknown>) {
  socketManager.listeners.forEach((listener) => {
    listener(payload);
  });
}

function closeSocket() {
  clearReconnectTimeout();

  const activeSocket = socketManager.socket;
  if (!activeSocket) {
    return;
  }

  socketManager.socket = null;
  activeSocket.onopen = null;
  activeSocket.onmessage = null;
  activeSocket.onclose = null;
  activeSocket.onerror = null;

  if (activeSocket.readyState === WebSocket.OPEN) {
    activeSocket.close();
  }
}

function scheduleReconnect() {
  clearReconnectTimeout();

  if (!socketManager.shouldReconnect || !socketManager.accessToken || socketManager.listeners.size === 0) {
    return;
  }

  socketManager.reconnectTimeoutId = window.setTimeout(() => {
    connectSocket();
  }, 2_000);
}

function connectSocket() {
  if (!socketManager.accessToken || socketManager.listeners.size === 0) {
    return;
  }

  const currentSocket = socketManager.socket;
  if (
    currentSocket &&
    (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const nextSocket = new WebSocket(getNotificationsWebSocketUrl(socketManager.accessToken));
  socketManager.socket = nextSocket;

  nextSocket.onmessage = (event) => {
    let payload: Record<string, unknown> | undefined;

    try {
      payload = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      payload = undefined;
    }

    notifyListeners(payload);
  };

  nextSocket.onclose = () => {
    if (socketManager.socket === nextSocket) {
      socketManager.socket = null;
    }

    scheduleReconnect();
  };

  nextSocket.onerror = () => {
    nextSocket.close();
  };
}

function ensureSocketForToken(accessToken: string) {
  if (socketManager.accessToken !== accessToken) {
    socketManager.shouldReconnect = false;
    closeSocket();
    socketManager.accessToken = accessToken;
  }

  socketManager.shouldReconnect = true;
  connectSocket();
}

function releaseSocketIfUnused() {
  if (socketManager.listeners.size > 0) {
    return;
  }

  socketManager.shouldReconnect = false;
  socketManager.accessToken = null;
  closeSocket();
}

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

    const listener = (payload?: Record<string, unknown>) => {
      onMessageRef.current?.(payload);
    };

    socketManager.listeners.add(listener);
    ensureSocketForToken(accessToken);

    return () => {
      socketManager.listeners.delete(listener);
      releaseSocketIfUnused();
    };
  }, [accessToken, enabled]);
}
