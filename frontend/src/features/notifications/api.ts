import { apiClient } from "../../shared/api/client";

export type NotificationSeverity = "info" | "success" | "warning" | "attention";
export type NotificationKind =
  | "system"
  | "profile"
  | "opportunity"
  | "application"
  | "employer_verification"
  | "candidates";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  action_label?: string | null;
  action_url?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
};

export type NotificationsResponse = {
  data?: {
    items?: NotificationItem[];
    unread_count?: number;
  };
};

export type NotificationsUnreadCountResponse = {
  data?: {
    unread_count?: number;
  };
};

export async function listNotificationsRequest() {
  const response = await apiClient.get<NotificationsResponse>("/notifications");
  return response.data;
}

export async function getUnreadNotificationsCountRequest() {
  const response = await apiClient.get<NotificationsUnreadCountResponse>("/notifications/unread-count");
  return response.data;
}

export async function markNotificationAsReadRequest(notificationId: string) {
  const response = await apiClient.post<NotificationsUnreadCountResponse>(
    `/notifications/${notificationId}/read`,
  );
  return response.data;
}

export async function clearNotificationsRequest() {
  const response = await apiClient.delete<NotificationsUnreadCountResponse>("/notifications");
  return response.data;
}
