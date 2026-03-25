import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import notificationsIcon from "../../assets/icons/notifications.svg";
import { cn } from "../../shared/lib";
import { Button } from "../../shared/ui";
import { useAuthStore } from "../auth";
import {
  clearNotificationsRequest,
  listNotificationsRequest,
  markNotificationAsReadRequest,
  NotificationsResponse,
} from "./api";
import "./notifications.css";

type NotificationMenuProps = {
  className?: string;
  buttonClassName?: string;
  iconClassName?: string;
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

export function NotificationMenu({
  className,
  buttonClassName,
  iconClassName,
}: NotificationMenuProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const notificationsQuery = useQuery({
    queryKey: ["notifications", "feed"],
    queryFn: listNotificationsRequest,
    enabled: isAuthenticated,
    staleTime: 60_000,
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

  const markAsReadMutation = useMutation({
    mutationFn: markNotificationAsReadRequest,
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: ["notifications", "feed"] });
      const previousFeed = queryClient.getQueryData<NotificationsResponse>(["notifications", "feed"]);

      queryClient.setQueryData<NotificationsResponse>(
        ["notifications", "feed"],
        updateNotificationsCache(previousFeed, notificationId),
      );

      return { previousFeed };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(["notifications", "feed"], context.previousFeed);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] });
    },
  });

  const clearNotificationsMutation = useMutation({
    mutationFn: clearNotificationsRequest,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications", "feed"] });
      const previousFeed = queryClient.getQueryData<NotificationsResponse>(["notifications", "feed"]);

      queryClient.setQueryData<NotificationsResponse>(["notifications", "feed"], {
        data: {
          items: [],
          unread_count: 0,
        },
      });

      return { previousFeed };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(["notifications", "feed"], context.previousFeed);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] });
    },
  });

  const handleItemClick = async (notificationId: string, actionUrl?: string | null, isRead?: boolean) => {
    if (!isRead) {
      await markAsReadMutation.mutateAsync(notificationId);
    }

    closeMenu();

    if (!actionUrl) {
      return;
    }

    if (actionUrl.startsWith("/")) {
      navigate(actionUrl);
      return;
    }

    window.location.assign(actionUrl);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div ref={menuRef} className={cn("notification-menu", className)}>
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
            {unreadCount > 99 ? "99+" : unreadCount}
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

        <div className="notification-menu__content">
          {hasLoadError ? (
            <div className="notification-menu__empty">
              Не удалось загрузить уведомления. Проверьте backend и обновите страницу.
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
                "notification-menu__item",
                item.is_read && "notification-menu__item--read",
              )}
              role="menuitem"
            >
              <button
                type="button"
                className="notification-menu__item-main"
                onClick={() => {
                  void handleItemClick(item.id, item.action_url, item.is_read);
                }}
              >
              <span className="notification-menu__item-body">
                <span className="notification-menu__item-title-row">
                  <span className="notification-menu__item-heading">
                    <span className="notification-menu__item-title">{item.title}</span>
                    <span className="notification-menu__item-date-row">
                      <span className="notification-menu__item-date-icon" aria-hidden="true" />
                      <span className="notification-menu__item-date">
                        {formatNotificationDate(item.created_at)}
                      </span>
                    </span>
                  </span>
                  {!item.is_read ? (
                    <span className="notification-menu__item-indicator" aria-hidden="true" />
                  ) : (
                    <span className="notification-menu__item-indicator-placeholder" aria-hidden="true" />
                  )}
                </span>
                <span className="notification-menu__item-message">{item.message}</span>
                {item.action_label && item.action_url ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="notification-menu__item-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleItemClick(item.id, item.action_url, item.is_read);
                    }}
                  >
                    <span className="notification-menu__item-action-label">{item.action_label}</span>
                    <span className="notification-menu__item-action-icon" aria-hidden="true" />
                  </Button>
                ) : null}
              </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
