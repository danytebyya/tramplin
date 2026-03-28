import { apiClient } from "../../shared/api/client";
import {
  clearWorkflowNotifications,
  hideWorkflowNotification,
  listWorkflowNotifications,
  markWorkflowNotificationAsRead,
} from "../opportunity-workflow";

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
  const apiItems = response.data?.data?.items ?? [];
  const workflowItems = listWorkflowNotifications();
  const items = [...workflowItems, ...apiItems].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );

  return {
    data: {
      items,
      unread_count: items.filter((item) => !item.is_read).length,
    },
  };
}

export async function getUnreadNotificationsCountRequest() {
  const response = await apiClient.get<NotificationsUnreadCountResponse>("/notifications/unread-count");
  return response.data;
}

export async function markNotificationAsReadRequest(notificationId: string) {
  if (notificationId.startsWith("local-notification-")) {
    return markWorkflowNotificationAsRead(notificationId);
  }

  const response = await apiClient.post<NotificationsUnreadCountResponse>(
    `/notifications/${notificationId}/read`,
  );
  return response.data;
}

export async function hideNotificationRequest(notificationId: string) {
  if (notificationId.startsWith("local-notification-")) {
    return hideWorkflowNotification(notificationId);
  }

  const response = await apiClient.post<NotificationsUnreadCountResponse>(
    `/notifications/${notificationId}/hide`,
  );
  return response.data;
}

export async function clearNotificationsRequest() {
  clearWorkflowNotifications();
  const response = await apiClient.delete<NotificationsUnreadCountResponse>("/notifications");
  return response.data;
}
