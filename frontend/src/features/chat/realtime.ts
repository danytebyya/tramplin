import { useEffect, useRef } from "react";

import { useAuthStore } from "../auth";
import { getChatWebSocketUrl } from "./api";

type ChatRealtimeEvent = {
  type?: string;
  conversation_id?: string;
  message?: Record<string, unknown>;
  user_id?: string;
  read_at?: string;
  actor_user_id?: string;
  target_user_id?: string;
  relation_status?: string;
};

type Listener = (event: ChatRealtimeEvent) => void;

type SocketManager = {
  accessToken: string | null;
  socket: WebSocket | null;
  reconnectTimeoutId: number | null;
  listeners: Set<Listener>;
  shouldReconnect: boolean;
  failedAttempts: number;
};

const socketManager: SocketManager = {
  accessToken: null,
  socket: null,
  reconnectTimeoutId: null,
  listeners: new Set(),
  shouldReconnect: false,
  failedAttempts: 0,
};

function clearReconnectTimeout() {
  if (socketManager.reconnectTimeoutId !== null) {
    window.clearTimeout(socketManager.reconnectTimeoutId);
    socketManager.reconnectTimeoutId = null;
  }
}

function notifyListeners(event: ChatRealtimeEvent) {
  socketManager.listeners.forEach((listener) => {
    listener(event);
  });
}

function closeSocket() {
  clearReconnectTimeout();

  if (!socketManager.socket) {
    return;
  }

  const activeSocket = socketManager.socket;
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

  if (socketManager.failedAttempts >= 3) {
    socketManager.shouldReconnect = false;
    return;
  }

  socketManager.reconnectTimeoutId = window.setTimeout(() => {
    connectSocket();
  }, 2000);
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

  const nextSocket = new WebSocket(getChatWebSocketUrl(socketManager.accessToken));
  socketManager.socket = nextSocket;

  nextSocket.onopen = () => {
    socketManager.failedAttempts = 0;
  };

  nextSocket.onmessage = (event) => {
    try {
      notifyListeners(JSON.parse(event.data) as ChatRealtimeEvent);
    } catch {
      notifyListeners({});
    }
  };

  nextSocket.onclose = () => {
    if (socketManager.socket === nextSocket) {
      socketManager.socket = null;
    }
    if (nextSocket.readyState === WebSocket.CLOSED) {
      socketManager.failedAttempts += 1;
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
    socketManager.failedAttempts = 0;
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
  socketManager.failedAttempts = 0;
  closeSocket();
}

export function useChatRealtime(onMessage?: (event: ChatRealtimeEvent) => void) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!accessToken) {
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
  }, [accessToken]);
}
