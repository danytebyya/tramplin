import axios from "axios";

import { clearPersistedAuthSession, restoreAuthSession, useAuthStore } from "../../features/auth/session";
import { env } from "../config/env";

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const accessToken = useAuthStore.getState().accessToken;

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const refreshToken = useAuthStore.getState().refreshToken;
    const isUnauthorized = error?.response?.status === 401;
    const isRefreshRequest = originalRequest?.url?.includes("/auth/tokens");

    if (isUnauthorized && refreshToken && !isRefreshRequest && !originalRequest?._retry) {
      originalRequest._retry = true;

      const nextAccessToken = await restoreAuthSession();

      if (nextAccessToken) {
        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${nextAccessToken}`,
        };
        return apiClient(originalRequest);
      }
    }

    if (isUnauthorized && typeof window !== "undefined") {
      useAuthStore.getState().clearSession();
      clearPersistedAuthSession();

      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }

    return Promise.reject(error);
  },
);
