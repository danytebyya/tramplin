import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import notificationsIcon from "../../assets/icons/notifications.svg";
import { cn } from "../../shared/lib";
import { Button } from "../../shared/ui";
import { useAuthStore } from "../auth";
import {
  clearNotificationsRequest,
  hideNotificationRequest,
  listNotificationsRequest,
  markNotificationAsReadRequest,
  NotificationsResponse,
} from "./api";
import { useNotificationsRealtime } from "./use-notifications-realtime";
import "./notifications.css";

type NotificationMenuProps = {
  className?: string;
  buttonClassName?: string;
  iconClassName?: string;
  onRealtimeMessage?: () => void;
};

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getUnreadCount(feed: NotificationsResponse | undefined) {
  return feed?.data?.unread_count ?? 0;
}

function updateNotificationsCache(
  current: NotificationsResponse | undefined,
  targetId?: string,
): NotificationsResponse {
  const items = (current?.data?.items ?? []).map((item) => {
    if (targetId && item.id !== targetId) {
      return item;
    }

    if (item.is_read) {
      return item;
    }

    return {
      ...item,
      is_read: true,
      read_at: new Date().toISOString(),
    };
  });

  const unreadCount = items.filter((item) => !item.is_read).length;

  return {
    data: {
      items,
      unread_count: unreadCount,
    },
  };
}

function resolveNotificationActionUrl(actionUrl: string, role: string | null) {
  const normalizedActionUrl =
    actionUrl === "/#dashboard" && (role === "junior" || role === "curator" || role === "admin")
      ? "/dashboard/curator#dashboard"
      : actionUrl;

  if (normalizedActionUrl === "/networking") {
    return "/networking#chat-contacts";
  }

  return normalizedActionUrl;
}

export function NotificationMenu({
  className,
  buttonClassName,
  iconClassName,
  onRealtimeMessage,
}: NotificationMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const role = useAuthStore((state) => state.role);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const notificationsQueryKey = ["notifications", "feed", role ?? "guest"] as const;
  const roleClassName =
    role === "applicant"
      ? "notification-menu--applicant"
      : role === "curator" || role === "junior" || role === "admin"
        ? "notification-menu--curator"
        : role === "employer"
          ? "notification-menu--employer"
          : undefined;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousTopNotificationIdRef = useRef<string | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const notificationsQuery = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: listNotificationsRequest,
    enabled: isHydrated && isAuthenticated && Boolean(role),
    staleTime: 5_000,
    refetchInterval: () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return false;
      }

      return 60_000;
    },
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: "always",
  });
  const unreadCount = getUnreadCount(notificationsQuery.data);
  const items = notificationsQuery.data?.data?.items ?? [];
  const hasLoadError = notificationsQuery.isError;

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const openMenu = () => {
    clearCloseTimeout();
    setIsOpen(true);
    void notificationsQuery.refetch();
  };

  const scheduleClose = () => {
    if (isPinned) {
      return;
    }

    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimeoutRef.current = null;
    }, 40);
  };

  const closeMenu = () => {
    clearCloseTimeout();
    setIsPinned(false);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !isAuthenticated) {
      return;
    }

    void notificationsQuery.refetch();
  }, [isAuthenticated, isOpen, notificationsQuery]);

  useEffect(() => {
    const topNotificationId = items[0]?.id ?? null;
    const previousTopNotificationId = previousTopNotificationIdRef.current;

    if (
      topNotificationId !== null &&
      previousTopNotificationId !== null &&
      topNotificationId !== previousTopNotificationId
    ) {
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }

    previousTopNotificationIdRef.current = topNotificationId;
  }, [items]);

  useNotificationsRealtime({
    enabled: isHydrated && Boolean(accessToken) && Boolean(role),
    onMessage: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      void queryClient.refetchQueries({ queryKey: notificationsQueryKey, type: "active" });
      onRealtimeMessage?.();
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: markNotificationAsReadRequest,
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey });
      const previousFeed = queryClient.getQueryData<NotificationsResponse>(notificationsQueryKey);

      queryClient.setQueryData<NotificationsResponse>(
        notificationsQueryKey,
        updateNotificationsCache(previousFeed, notificationId),
      );

      return { previousFeed };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(notificationsQueryKey, context.previousFeed);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  const clearNotificationsMutation = useMutation({
    mutationFn: clearNotificationsRequest,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey });
      const previousFeed = queryClient.getQueryData<NotificationsResponse>(notificationsQueryKey);

      queryClient.setQueryData<NotificationsResponse>(notificationsQueryKey, {
        data: {
          items: [],
          unread_count: 0,
        },
      });

      return { previousFeed };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(notificationsQueryKey, context.previousFeed);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  const hideNotificationMutation = useMutation({
    mutationFn: hideNotificationRequest,
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey });
      const previousFeed = queryClient.getQueryData<NotificationsResponse>(notificationsQueryKey);

      queryClient.setQueryData<NotificationsResponse>(notificationsQueryKey, {
        data: {
          items: (previousFeed?.data?.items ?? []).filter((item) => item.id !== notificationId),
          unread_count: Math.max(
            0,
            (previousFeed?.data?.items ?? []).filter((item) => !item.is_read && item.id !== notificationId).length,
          ),
        },
      });

      return { previousFeed };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(notificationsQueryKey, context.previousFeed);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  const handleItemClick = async (notificationId: string, actionUrl?: string | null, isRead?: boolean) => {
    const markAsReadPromise = !isRead
      ? markAsReadMutation.mutateAsync(notificationId).catch(() => undefined)
      : Promise.resolve(undefined);

    closeMenu();

    if (!actionUrl) {
      await markAsReadPromise;
      return;
    }

    const resolvedActionUrl = resolveNotificationActionUrl(actionUrl, role);
    const shouldAllowEmployerChangesRequested =
      resolvedActionUrl.startsWith("/onboarding/employer?mode=changes-requested");

    if (resolvedActionUrl.startsWith("/onboarding/employer")) {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.refetchQueries({ queryKey: ["auth", "me"], type: "active" });
    }

    if (resolvedActionUrl.startsWith("/")) {
      const [targetPathname, targetHash] = resolvedActionUrl.split("#");
      const normalizedTargetPathname = targetPathname || "/";

      if (targetHash && location.pathname === normalizedTargetPathname) {
        const targetElement = document.getElementById(targetHash);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }

      void markAsReadPromise;
      navigate(resolvedActionUrl, {
        state: shouldAllowEmployerChangesRequested ? { allowChangesRequestedAccess: true } : undefined,
      });
      return;
    }

    void markAsReadPromise;
    window.location.assign(resolvedActionUrl);
  };

  const handleHideNotification = (notificationId: string) => {
    void hideNotificationMutation.mutateAsync(notificationId);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div ref={menuRef} className={cn("notification-menu", roleClassName, className)}>
      <button
        type="button"
        className={cn("notification-menu__button", buttonClassName)}
        aria-label="Уведомления"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onClick={() => {
          clearCloseTimeout();
          setIsPinned((currentPinned) => {
            const nextPinned = !currentPinned;
            setIsOpen(nextPinned);
            return nextPinned;
          });
        }}
      >
        <img
          src={notificationsIcon}
          alt=""
          aria-hidden="true"
          className={cn("notification-menu__button-icon", iconClassName)}
        />
        {unreadCount > 0 ? (
          <span className="notification-menu__badge" aria-label={`Непрочитанных уведомлений: ${unreadCount}`}>
            {unreadCount >= 10 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      <div
        className={cn(
          "notification-menu__dropdown",
          !isOpen && "notification-menu__dropdown--hidden",
        )}
        role="menu"
        aria-hidden={!isOpen}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <div className="notification-menu__header">
          <div className="notification-menu__heading">
            <h2 className="notification-menu__title">Уведомления</h2>
          </div>

          <button
            type="button"
            className="notification-menu__mark-all"
            onClick={() => {
              void clearNotificationsMutation.mutateAsync();
            }}
            disabled={hasLoadError || items.length === 0 || clearNotificationsMutation.isPending}
          >
            Очистить все
          </button>
        </div>

        <div ref={contentRef} className="notification-menu__records">
          {hasLoadError ? (
            <div className="notification-menu__empty">
              Не удалось загрузить уведомления.
            </div>
          ) : null}

          {notificationsQuery.isLoading ? (
            <div className="notification-menu__empty">Загружаем уведомления...</div>
          ) : null}

          {!hasLoadError && !notificationsQuery.isLoading && items.length === 0 ? (
            <div className="notification-menu__empty">Новых уведомлений пока нет.</div>
          ) : null}

          {!hasLoadError && items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "notification-menu__notice",
                item.is_read && "notification-menu__notice--read",
              )}
              role="menuitem"
            >
              <div className="notification-menu__notice-head">
                <button
                  type="button"
                  className="notification-menu__notice-main"
                  onClick={() => {
                    void handleItemClick(item.id, item.action_url, item.is_read);
                  }}
                >
                  <span className="notification-menu__notice-body">
                    <span className="notification-menu__title-summary">
                      <span className="notification-menu__notice-heading">
                        <span className="notification-menu__notice-title">{item.title}</span>
                        <span className="notification-menu__date-summary">
                          <span className="notification-menu__notice-date-icon" aria-hidden="true" />
                          <span className="notification-menu__notice-date">
                            {formatNotificationDate(item.created_at)}
                          </span>
                        </span>
                      </span>
                      {!item.is_read ? (
                        <span className="notification-menu__notice-indicator" aria-hidden="true" />
                      ) : (
                        <span className="notification-menu__notice-indicator-slot" aria-hidden="true" />
                      )}
                    </span>
                    <span className="notification-menu__notice-message">{item.message}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="notification-menu__notice-dismiss"
                  aria-label="Скрыть уведомление"
                  disabled={hideNotificationMutation.isPending}
                  onClick={() => {
                    handleHideNotification(item.id);
                  }}
                />
              </div>
              {item.action_label && item.action_url ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="notification-menu__notice-action"
                  onClick={() => {
                    void handleItemClick(item.id, item.action_url, item.is_read);
                  }}
                >
                  <span className="notification-menu__notice-action-label">{item.action_label}</span>
                  <span className="notification-menu__notice-action-icon" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
