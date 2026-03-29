import { useEffect, useRef } from "react";

import { getWebSocketOrigin } from "../../shared/config/env";
import { useAuthStore } from "../auth";

type PresenceRealtimeEvent = {
  type?: string;
  user_id?: string;
  is_online?: boolean;
  last_seen_at?: string | null;
};

type Listener = (event: PresenceRealtimeEvent) => void;

type SocketManager = {
  accessToken: string | null;
  socket: WebSocket | null;
  reconnectTimeoutId: number | null;
  listeners: Set<Listener>;
  shouldReconnect: boolean;
};

const socketManager: SocketManager = {
  accessToken: null,
  socket: null,
  reconnectTimeoutId: null,
  listeners: new Set(),
  shouldReconnect: false,
};

function getPresenceWebSocketUrl(accessToken: string) {
  const wsOrigin = getWebSocketOrigin();
  return `${wsOrigin}/api/v1/presence/stream?token=${encodeURIComponent(accessToken)}`;
}

function clearReconnectTimeout() {
  if (socketManager.reconnectTimeoutId !== null) {
    window.clearTimeout(socketManager.reconnectTimeoutId);
    socketManager.reconnectTimeoutId = null;
  }
}

function notifyListeners(event: PresenceRealtimeEvent) {
  socketManager.listeners.forEach((listener) => {
    listener(event);
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

  const nextSocket = new WebSocket(getPresenceWebSocketUrl(socketManager.accessToken));
  socketManager.socket = nextSocket;

  nextSocket.onmessage = (event) => {
    try {
      notifyListeners(JSON.parse(event.data) as PresenceRealtimeEvent);
    } catch {
      notifyListeners({});
    }
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

function ensureSocket(accessToken: string) {
  if (socketManager.accessToken !== accessToken) {
    socketManager.shouldReconnect = false;
    closeSocket();
    socketManager.accessToken = accessToken;
  }

  socketManager.shouldReconnect = true;
  connectSocket();
}

function releaseSocket() {
  if (socketManager.listeners.size > 0) {
    return;
  }

  socketManager.shouldReconnect = false;
  socketManager.accessToken = null;
  closeSocket();
}

export function usePresenceRealtime(
  onMessage?: (event: PresenceRealtimeEvent) => void,
  options?: { enabled?: boolean },
) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const onMessageRef = useRef(onMessage);
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled || !accessToken) {
      return;
    }

    const listener: Listener = (event) => {
      onMessageRef.current?.(event);
    };

    socketManager.listeners.add(listener);
    ensureSocket(accessToken);

    return () => {
      socketManager.listeners.delete(listener);
      releaseSocket();
    };
  }, [accessToken, enabled]);
}
