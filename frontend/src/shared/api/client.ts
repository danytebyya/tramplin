import axios from "axios";

import { clearClientSession } from "../../features/auth/logout";
import { restoreAuthSession, useAuthStore } from "../../features/auth/session";
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

  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
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
    const isCurrentSessionLogoutRequest =
      originalRequest?.url?.includes("/auth/sessions/current") &&
      String(originalRequest?.method ?? "").toLowerCase() === "delete";
    const isLoginRequest =
      originalRequest?.url?.includes("/auth/sessions") &&
      String(originalRequest?.method ?? "").toLowerCase() === "post";

    if (isUnauthorized && isLoginRequest) {
      return Promise.reject(error);
    }

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

    if (
      isUnauthorized &&
      typeof window !== "undefined" &&
      !isLoginRequest &&
      !isCurrentSessionLogoutRequest
    ) {
      clearClientSession();
    }

    return Promise.reject(error);
  },
);
