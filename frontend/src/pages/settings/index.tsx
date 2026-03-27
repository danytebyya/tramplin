import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useNavigate } from "react-router-dom";

import deleteIcon from "../../assets/icons/delete.svg";
import editIcon from "../../assets/icons/edit.svg";
import profileIcon from "../../assets/icons/profile.svg";
import {
  CitySelector,
  CitySelection,
  readSelectedCityCookie,
  removeSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import {
  AuthSessionListResponse,
  NotificationPreferenceGroup,
  NotificationPreferenceKey,
  getNotificationPreferencesRequest,
  listActiveSessionsRequest,
  listLoginHistoryRequest,
  meRequest,
  performLogout,
  revokeOtherSessionsRequest,
  revokeSessionRequest,
  updateMeRequest,
  updateNotificationPreferencesRequest,
  updatePreferredCityRequest,
  useAuthStore,
} from "../../features/auth";
import { NotificationMenu } from "../../features/notifications";
import {
  getModerationSettingsRequest,
  updateModerationSettingsRequest,
} from "../../features/moderation";
import { Button, Checkbox, Container, Input, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import "../../widgets/header/header.css";
import "./settings.css";

type NotificationPreference = {
  key: NotificationPreferenceKey;
  label: string;
  enabled: boolean;
};

type SettingsTabItem = {
  label: string;
  to?: string;
  isCurrent?: boolean;
};

type EmployerStaffMember = {
  email: string;
  role: string;
  permissions: string[];
  invitedAt: string;
};

const notificationPreferenceKeys: NotificationPreferenceKey[] = [
  "new_verification_requests",
  "content_complaints",
  "overdue_reviews",
  "company_profile_changes",
  "publication_changes",
  "daily_digest",
  "weekly_report",
];

const defaultNotificationPreferenceGroup: NotificationPreferenceGroup = {
  new_verification_requests: true,
  content_complaints: false,
  overdue_reviews: false,
  company_profile_changes: false,
  publication_changes: false,
  daily_digest: false,
  weekly_report: false,
};

const employerStaffMembers: EmployerStaffMember[] = [
  {
    email: "a@company.ru",
    role: "Администратор",
    permissions: [
      "Просмотр откликов",
      "Создание и редактирование возможностей",
      "Управление профилем",
      "Общение в чате",
    ],
    invitedAt: "15.03.2026",
  },
  {
    email: "hr@company.ru",
    role: "Администратор",
    permissions: [
      "Просмотр откликов",
      "Создание и редактирование возможностей",
      "Управление профилем",
      "Общение в чате",
    ],
    invitedAt: "15.03.2026",
  },
  {
    email: "recruiter@company.ru",
    role: "Рекрутер",
    permissions: [
      "Просмотр откликов",
      "Создание и редактирование возможностей",
      "Общение в чате",
    ],
    invitedAt: "15.03.2026",
  },
];

function resolveDefaultNotificationPreferenceGroup(role: string | null): NotificationPreferenceGroup {
  if (role === "junior" || role === "curator" || role === "admin") {
    return {
      new_verification_requests: false,
      content_complaints: false,
      overdue_reviews: false,
      company_profile_changes: false,
      publication_changes: false,
      daily_digest: false,
      weekly_report: false,
    };
  }

  return defaultNotificationPreferenceGroup;
}

function resolveNotificationPreferenceLabel(role: string | null, key: NotificationPreferenceKey) {
  if (role === "employer") {
    switch (key) {
      case "new_verification_requests":
        return "Новые отклики на вакансии";
      case "company_profile_changes":
        return "Ответы кураторов на модерацию";
      default:
        return key;
    }
  }

  if (role === "applicant") {
    switch (key) {
      case "publication_changes":
        return "Ответы работодателей по откликам";
      case "daily_digest":
        return "Новые рекомендации по вакансиям";
      case "weekly_report":
        return "Подборка стажировок и мероприятий";
      default:
        return key;
    }
  }

  switch (key) {
    case "new_verification_requests":
      return "Новые заявки на верификацию";
    case "content_complaints":
      return "Жалобы на контент";
    case "overdue_reviews":
      return "Просроченные проверки";
    case "company_profile_changes":
      return "Изменения в профиле компании";
    case "publication_changes":
      return "Изменения в публикациях";
    case "daily_digest":
      return "Ежедневная сводка";
    case "weekly_report":
      return "Еженедельный отчет";
    default:
      return key;
  }
}

function resolveVisibleNotificationKeys(role: string | null): NotificationPreferenceKey[] {
  if (role === "employer") {
    return ["new_verification_requests", "company_profile_changes"];
  }

  if (role === "applicant") {
    return ["publication_changes", "daily_digest", "weekly_report"];
  }

  return notificationPreferenceKeys;
}

function buildNotificationPreferences(
  group?: Partial<NotificationPreferenceGroup>,
  role: string | null = null,
): NotificationPreference[] {
  const defaultGroup = resolveDefaultNotificationPreferenceGroup(role);

  return notificationPreferenceKeys.map((key) => ({
    key,
    label: resolveNotificationPreferenceLabel(role, key),
    enabled: group?.[key] ?? defaultGroup[key],
  }));
}

function mapNotificationPreferencesToPayload(
  items: NotificationPreference[],
  role: string | null,
): NotificationPreferenceGroup {
  return items.reduce<NotificationPreferenceGroup>(
    (result, item) => {
      result[item.key] = item.enabled;
      return result;
    },
    { ...resolveDefaultNotificationPreferenceGroup(role) },
  );
}

function resolveThemeRole(role: string | null) {
  if (role === "junior") {
    return "curator";
  }

  if (role === "employer" || role === "curator" || role === "admin") {
    return role;
  }

  return "applicant";
}

function resolveActionVariant(role: string | null) {
  if (role === "employer") {
    return "primary" as const;
  }

  if (role === "junior" || role === "curator" || role === "admin") {
    return "accent" as const;
  }

  return "secondary" as const;
}

function resolveOutlineVariant(role: string | null) {
  if (role === "employer") {
    return "primary-outline" as const;
  }

  if (role === "junior" || role === "curator" || role === "admin") {
    return "accent-outline" as const;
  }

  return "secondary-outline" as const;
}

function resolveCheckboxVariant(role: string | null) {
  if (role === "employer") {
    return "primary" as const;
  }

  if (role === "junior" || role === "curator" || role === "admin") {
    return "accent" as const;
  }

  return "secondary" as const;
}

function resolveModerationTitle(role: string | null) {
  return role === "admin" ? "Настройки администрирования" : "Настройки модерации";
}

function resolvePublicSettingsTabs(role: string | null): SettingsTabItem[] {
  if (role === "employer") {
    return [
      { label: "Профиль компании", to: "/dashboard/employer" },
      { label: "Управление возможностями" },
      { label: "Отклики" },
      { label: "Чат" },
      { label: "Настройки", to: "/settings", isCurrent: true },
    ];
  }

  return [
    { label: "Профиль", to: "/dashboard/applicant" },
    { label: "Мои отклики" },
    { label: "Избранное" },
    { label: "Нетворкинг" },
    { label: "Настройки", to: "/settings", isCurrent: true },
  ];
}

function formatDateWithTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

function resolveBrowserLabel(userAgent: string | null | undefined) {
  const normalizedUserAgent = userAgent ?? "";
  const platformMatch = normalizedUserAgent.match(/\(([^)]+)\)/);
  const platform = platformMatch?.[1] ?? "";
  const browser = normalizedUserAgent.includes("Chrome")
    ? "Chrome"
    : normalizedUserAgent.includes("Safari")
      ? "Safari"
      : normalizedUserAgent.includes("Firefox")
        ? "Firefox"
        : "Браузер";
  const os = /Mac/i.test(platform)
    ? "macOS"
    : /Win/i.test(platform)
      ? "Windows"
      : /Linux/i.test(platform)
        ? "Linux"
        : "Desktop";

  return `${browser} на ${os}`;
}

function resolveSessionTitle(userAgent: string | null | undefined, isCurrent: boolean) {
  const baseTitle = resolveBrowserLabel(userAgent);
  return isCurrent ? `${baseTitle} (текущая)` : baseTitle;
}

function compareSessionsByPriority(
  left: { is_current: boolean; created_at: string; id: string },
  right: { is_current: boolean; created_at: string; id: string },
) {
  if (left.is_current !== right.is_current) {
    return left.is_current ? -1 : 1;
  }

  const leftTimestamp = new Date(left.created_at).getTime();
  const rightTimestamp = new Date(right.created_at).getTime();

  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return left.id.localeCompare(right.id);
}

function resolveLoginStatus(isSuccess: boolean, failureReason: string | null | undefined) {
  if (isSuccess) {
    return {
      label: "Успешно",
      variant: "approved" as const,
    };
  }

  if (failureReason === "invalid_credentials") {
    return {
      label: "Неверный пароль",
      variant: "rejected" as const,
    };
  }

  return {
    label: "Ошибка входа",
    variant: "rejected" as const,
  };
}

function SettingsSkeleton({ className }: { className: string }) {
  return <span className={`settings-page__skeleton ${className}`} aria-hidden="true" />;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const themeRole = resolveThemeRole(role);
  const actionVariant = resolveActionVariant(role);
  const outlineVariant = resolveOutlineVariant(role);
  const checkboxVariant = resolveCheckboxVariant(role);
  const isModerationRole = role === "junior" || role === "curator" || role === "admin";
  const isEmployer = role === "employer";
  const isApplicant = role === "applicant";
  const isPublicRole = isEmployer || isApplicant;
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuCloseTimeoutRef = useRef<number | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProfileMenuPinned, setIsProfileMenuPinned] = useState(false);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: meData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const sessionsQuery = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: listActiveSessionsRequest,
    staleTime: 30 * 1000,
    enabled: isAuthenticated,
  });

  const loginHistoryQuery = useQuery({
    queryKey: ["auth", "login-history"],
    queryFn: listLoginHistoryRequest,
    staleTime: 30 * 1000,
    enabled: isAuthenticated,
  });

  const notificationPreferencesQuery = useQuery({
    queryKey: ["users", "me", "notification-preferences"],
    queryFn: getNotificationPreferencesRequest,
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated,
  });

  const moderationSettingsQuery = useQuery({
    queryKey: ["moderation", "settings"],
    queryFn: getModerationSettingsRequest,
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated && isModerationRole,
  });

  const user = meData?.data?.user;
  const isProfileLoading = !user;
  const isNotificationLoading = notificationPreferencesQuery.isPending;
  const isSessionsLoading = sessionsQuery.isPending;
  const isLoginHistoryLoading = loginHistoryQuery.isPending;
  const isModerationSettingsLoading = isModerationRole && moderationSettingsQuery.isPending;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [emailNotifications, setEmailNotifications] = useState(() => buildNotificationPreferences(undefined, role));
  const [pushNotifications, setPushNotifications] = useState(() => buildNotificationPreferences(undefined, role));
  const [vacancyReviewHours, setVacancyReviewHours] = useState("24");
  const [internshipReviewHours, setInternshipReviewHours] = useState("24");
  const [eventReviewHours, setEventReviewHours] = useState("24");
  const [mentorshipReviewHours, setMentorshipReviewHours] = useState("24");

  const updatePreferredCityMutation = useMutation({
    mutationFn: updatePreferredCityRequest,
    onSuccess: (response) => {
      queryClient.setQueryData(["auth", "me"], response);
      removeSelectedCityCookie();
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: updateMeRequest,
    onMutate: () => {
      setProfileError(null);
      setProfileSuccess(null);
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["auth", "me"], response);
      setProfileSuccess("Изменения сохранены.");
    },
    onError: (error: any) => {
      setProfileError(
        error?.response?.data?.error?.message ?? "Не удалось сохранить профиль. Попробуйте еще раз.",
      );
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: revokeSessionRequest,
    onSuccess: (_response, revokedSessionId) => {
      queryClient.setQueryData<AuthSessionListResponse | undefined>(["auth", "sessions"], (current) => {
        if (!current?.data?.items) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            items: current.data.items.filter((session) => session.id !== revokedSessionId),
          },
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
  });

  const revokeOtherSessionsMutation = useMutation({
    mutationFn: revokeOtherSessionsRequest,
    onSuccess: () => {
      queryClient.setQueryData<AuthSessionListResponse | undefined>(["auth", "sessions"], (current) => {
        if (!current?.data?.items) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            items: current.data.items.filter((session) => session.is_current),
          },
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
  });

  const updateNotificationPreferencesMutation = useMutation({
    mutationFn: updateNotificationPreferencesRequest,
    onSuccess: (response) => {
      queryClient.setQueryData(["users", "me", "notification-preferences"], response);
    },
  });

  const updateModerationSettingsMutation = useMutation({
    mutationFn: updateModerationSettingsRequest,
    onSuccess: (response) => {
      queryClient.setQueryData(["moderation", "settings"], response);
    },
  });

  const clearProfileMenuCloseTimeout = () => {
    if (profileMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(profileMenuCloseTimeoutRef.current);
      profileMenuCloseTimeoutRef.current = null;
    }
  };

  const openProfileMenu = () => {
    clearProfileMenuCloseTimeout();
    setIsProfileMenuOpen(true);
  };

  const scheduleProfileMenuClose = () => {
    if (isProfileMenuPinned) {
      return;
    }

    clearProfileMenuCloseTimeout();
    profileMenuCloseTimeoutRef.current = window.setTimeout(() => {
      setIsProfileMenuOpen(false);
      profileMenuCloseTimeoutRef.current = null;
    }, 40);
  };

  const handleLogout = () => {
    void performLogout({
      beforeRedirect: () => {
        setIsProfileMenuPinned(false);
        setIsProfileMenuOpen(false);
      },
    });
  };

  useEffect(() => {
    setFullName(user?.display_name ?? "");
    setEmail(user?.email ?? "");
  }, [user?.display_name, user?.email]);

  useEffect(() => {
    setProfileError(null);
    setProfileSuccess(null);
  }, [fullName, email]);

  useEffect(() => {
    const preferredCity = user?.preferred_city?.trim();

    if (!isAuthenticated || !preferredCity) {
      return;
    }

    setSelectedCity(preferredCity);
    removeSelectedCityCookie();
  }, [isAuthenticated, user?.preferred_city]);

  useEffect(() => {
    const preferences = notificationPreferencesQuery.data?.data;
    if (!preferences) {
      return;
    }

    setEmailNotifications(buildNotificationPreferences(preferences.email_notifications, role));
    setPushNotifications(buildNotificationPreferences(preferences.push_notifications, role));
  }, [notificationPreferencesQuery.data, role]);

  useEffect(() => {
    const settings = moderationSettingsQuery.data?.data;
    if (!settings) {
      return;
    }

    setVacancyReviewHours(String(settings.vacancy_review_hours));
    setInternshipReviewHours(String(settings.internship_review_hours));
    setEventReviewHours(String(settings.event_review_hours));
    setMentorshipReviewHours(String(settings.mentorship_review_hours));
  }, [moderationSettingsQuery.data]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileMenuPinned(false);
        setIsProfileMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileMenuPinned(false);
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => () => {
    clearProfileMenuCloseTimeout();
  }, []);

  const toggleEmailNotification = (key: NotificationPreferenceKey) => {
    setEmailNotifications((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, enabled: !entry.enabled } : entry)),
    );
  };

  const togglePushNotification = (key: NotificationPreferenceKey) => {
    setPushNotifications((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, enabled: !entry.enabled } : entry)),
    );
  };

  const handleNotificationPreferencesSave = () => {
    updateNotificationPreferencesMutation.mutate({
      email_notifications: mapNotificationPreferencesToPayload(emailNotifications, role),
      push_notifications: mapNotificationPreferencesToPayload(pushNotifications, role),
    });
  };

  const handleProfileSave = () => {
    updateProfileMutation.mutate({
      display_name: fullName.trim(),
      email: email.trim(),
    });
  };

  const handleModerationSettingsSave = () => {
    updateModerationSettingsMutation.mutate({
      vacancy_review_hours: Math.max(Number(vacancyReviewHours) || 0, 1),
      internship_review_hours: Math.max(Number(internshipReviewHours) || 0, 1),
      event_review_hours: Math.max(Number(eventReviewHours) || 0, 1),
      mentorship_review_hours: Math.max(Number(mentorshipReviewHours) || 0, 1),
    });
  };

  const sessionItems = useMemo(() => {
    return [...(sessionsQuery.data?.data?.items ?? [])]
      .sort(compareSessionsByPriority)
      .map((session) => ({
        id: session.id,
        title: resolveSessionTitle(session.user_agent, session.is_current),
        meta: `IP: ${session.ip_address ?? "Не определён"}`,
        date: formatDate(session.created_at),
        isCurrent: session.is_current,
      }));
  }, [sessionsQuery.data]);

  const isSessionActionPending =
    revokeSessionMutation.isPending ||
    revokeOtherSessionsMutation.isPending;

  const loginHistoryItems = useMemo(() => {
    return (loginHistoryQuery.data?.data?.items ?? [])
      .slice(0, 7)
      .map((item) => {
        const status = resolveLoginStatus(item.is_success, item.failure_reason);

        return {
          id: item.id,
          date: formatDateWithTime(item.created_at),
          statusLabel: status.label,
          statusVariant: status.variant,
        };
      });
  }, [loginHistoryQuery.data]);

  const visibleNotificationKeys = useMemo(() => resolveVisibleNotificationKeys(role), [role]);
  const visibleNotificationKeySet = useMemo(() => new Set(visibleNotificationKeys), [visibleNotificationKeys]);
  const visibleEmailNotifications = useMemo(
    () => emailNotifications.filter((item) => visibleNotificationKeySet.has(item.key)),
    [emailNotifications, visibleNotificationKeySet],
  );
  const visiblePushNotifications = useMemo(
    () => pushNotifications.filter((item) => visibleNotificationKeySet.has(item.key)),
    [pushNotifications, visibleNotificationKeySet],
  );

  const pageClassName = [
    "settings-page",
    `settings-page--${themeRole}`,
  ].join(" ");

  const profileMenuItems = isModerationRole
    ? [
        { label: "Настройки", isDanger: false, onClick: () => navigate("/settings") },
        { label: "Выход", isDanger: true, onClick: handleLogout },
      ]
    : role === "employer"
      ? [
          { label: "Профиль компании", isDanger: false, onClick: () => navigate("/dashboard/employer") },
          { label: "Настройки", isDanger: false, onClick: () => navigate("/settings") },
          { label: "Выход", isDanger: true, onClick: handleLogout },
        ]
      : [
          { label: "Профиль", isDanger: false, onClick: () => navigate("/dashboard/applicant") },
          { label: "Мои отклики", isDanger: false },
          { label: "Избранное", isDanger: false },
          { label: "Нетворкинг", isDanger: false },
          { label: "Настройки", isDanger: false, onClick: () => navigate("/settings") },
          { label: "Выход", isDanger: true, onClick: handleLogout },
        ];

  const handleCityChange = (city: string | CitySelection) => {
    const nextCity = typeof city === "string" ? city : city.name;
    setSelectedCity(nextCity);

    if (!isAuthenticated) {
      writeSelectedCityCookie(nextCity);
      return;
    }

    updatePreferredCityMutation.mutate(nextCity);
  };

  const renderPublicTabs = () => {
    return (
      <nav className="settings-page__tabs" aria-label="Разделы настроек">
        {resolvePublicSettingsTabs(role).map((item) =>
          item.to ? (
            <NavLink
              key={item.label}
              to={item.to}
              end
              className={({ isActive }) =>
                isActive || item.isCurrent
                  ? "settings-page__tab settings-page__tab--active"
                  : "settings-page__tab"
              }
            >
              {item.label}
            </NavLink>
          ) : (
            <span key={item.label} className="settings-page__tab">
              {item.label}
            </span>
          ),
        )}
      </nav>
    );
  };

  const renderNotificationItems = (
    items: NotificationPreference[],
    onToggle: (key: NotificationPreferenceKey) => void,
    prefix: string,
  ) => {
    if (isNotificationLoading) {
      return Array.from({ length: isPublicRole ? 2 : 4 }, (_, index) => (
        <div key={`${prefix}-skeleton-${index}`} className="settings-page__checkbox-row">
          <SettingsSkeleton className="settings-page__skeleton--checkbox" />
          <SettingsSkeleton className="settings-page__skeleton--checkbox-label" />
        </div>
      ));
    }

    return items.map((item) => (
      <label key={`${prefix}-${item.key}`} className="settings-page__checkbox-row">
        <Checkbox
          variant={checkboxVariant}
          checked={item.enabled}
          onChange={() => onToggle(item.key)}
        />
        <span className="settings-page__checkbox-label">{item.label}</span>
      </label>
    ));
  };

  const renderSecurityPanel = () => {
    return (
      <div className="settings-page__panel">
        <div className="settings-page__panel-header">
          <h3 className="settings-page__panel-title">Смена пароля</h3>
        </div>
        <div className="settings-page__panel-body settings-page__panel-body--security">
          <label className="settings-page__field">
            <span className="settings-page__field-label">Текущий пароль</span>
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Введите текущий пароль"
            />
          </label>
          <label className="settings-page__field">
            <span className="settings-page__field-label">Новый пароль</span>
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Введите новый пароль"
            />
          </label>
          <label className="settings-page__field">
            <span className="settings-page__field-label">Подтверждение пароля</span>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Повторите новый пароль"
            />
          </label>
        </div>
        <div className="settings-page__panel-actions settings-page__panel-actions--stacked">
          <Button type="button" variant={outlineVariant} size="md">
            Восстановить пароль
          </Button>
          <Button type="button" variant={actionVariant} size="md">
            Изменить пароль
          </Button>
        </div>
      </div>
    );
  };

  const renderSessionsPanel = () => {
    return (
      <div className="settings-page__panel settings-page__panel--compact">
        <div className="settings-page__panel-header">
          <h3 className="settings-page__panel-title">Активные сессии</h3>
        </div>
        <div className="settings-page__panel-body settings-page__panel-body--sessions">
          <div className="settings-page__session-list">
            {isSessionsLoading
              ? Array.from({ length: 3 }, (_, index) => (
                  <div key={`session-skeleton-${index}`} className="settings-page__session-item">
                    <SettingsSkeleton className="settings-page__skeleton--dot" />
                    <div className="settings-page__session-content">
                      <SettingsSkeleton className="settings-page__skeleton--session-line" />
                      <SettingsSkeleton className="settings-page__skeleton--session-line settings-page__skeleton--session-line-short" />
                      <SettingsSkeleton className="settings-page__skeleton--session-line settings-page__skeleton--session-line-short" />
                    </div>
                  </div>
                ))
              : sessionItems.map((session) => (
                  <div key={session.id} className="settings-page__session-item">
                    <span className="settings-page__session-dot" aria-hidden="true" />
                    <div className="settings-page__session-content">
                      <p className="settings-page__session-title">{session.title}</p>
                      <p className="settings-page__session-meta">{session.meta}</p>
                      <p className="settings-page__session-date">{session.date}</p>
                      <Button
                        type="button"
                        variant="accent-ghost"
                        size="md"
                        className={
                          session.isCurrent
                            ? "settings-page__session-action settings-page__session-action--disabled"
                            : "settings-page__session-action"
                        }
                        disabled={session.isCurrent || isSessionActionPending}
                        onClick={() => {
                          revokeSessionMutation.mutate(session.id);
                        }}
                      >
                        Завершить сессию
                      </Button>
                    </div>
                  </div>
                ))}
          </div>
        </div>
        <div className="settings-page__panel-actions">
          <Button
            type="button"
            variant={actionVariant}
            size="md"
            loading={revokeOtherSessionsMutation.isPending}
            disabled={isSessionActionPending}
            onClick={() => revokeOtherSessionsMutation.mutate()}
          >
            Завершить все другие сессии
          </Button>
        </div>
      </div>
    );
  };

  const renderLoginHistoryPanel = () => {
    return (
      <div className="settings-page__panel settings-page__panel--compact">
        <div className="settings-page__panel-header">
          <h3 className="settings-page__panel-title">История входов</h3>
        </div>
        <div className="settings-page__panel-body settings-page__panel-body--history">
          <div className="settings-page__history-list">
            {isLoginHistoryLoading
              ? Array.from({ length: 4 }, (_, index) => (
                  <div key={`history-skeleton-${index}`} className="settings-page__history-item">
                    <SettingsSkeleton className="settings-page__skeleton--dot" />
                    <SettingsSkeleton className="settings-page__skeleton--history-line" />
                    <SettingsSkeleton className="settings-page__skeleton--history-status" />
                  </div>
                ))
              : loginHistoryItems.map((item) => (
                  <div key={item.id} className="settings-page__history-item">
                    <span className="settings-page__history-dot" aria-hidden="true" />
                    <span className="settings-page__history-date">{item.date}</span>
                    <Status className="settings-page__history-status" variant={item.statusVariant}>
                      {item.statusLabel}
                    </Status>
                  </div>
                ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPublicLayout = () => {
    return (
      <>
        {renderPublicTabs()}

        {isApplicant ? (
          <section className="settings-page__section">
            <h2 className="settings-page__section-title">Профиль</h2>
            <div className="settings-page__panel">
              <div className="settings-page__panel-header">
                <h3 className="settings-page__panel-title">Личные данные</h3>
              </div>
              <div className="settings-page__panel-body settings-page__panel-body--profile">
                <label className="settings-page__field">
                  <span className="settings-page__field-label">ФИО</span>
                  {isProfileLoading ? (
                    <SettingsSkeleton className="settings-page__skeleton--input" />
                  ) : (
                    <Input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Введите имя"
                    />
                  )}
                </label>
                <label className="settings-page__field">
                  <span className="settings-page__field-label">E-mail</span>
                  {isProfileLoading ? (
                    <SettingsSkeleton className="settings-page__skeleton--input" />
                  ) : (
                    <Input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Введите email"
                    />
                  )}
                </label>
              </div>
              <div className="settings-page__panel-actions">
                <Button
                  type="button"
                  variant={actionVariant}
                  size="md"
                  loading={updateProfileMutation.isPending}
                  disabled={isProfileLoading || !fullName.trim() || !email.trim()}
                  onClick={handleProfileSave}
                >
                  Сохранить изменения
                </Button>
                {profileError ? <p className="settings-page__form-message settings-page__form-message--error">{profileError}</p> : null}
                {profileSuccess ? (
                  <p className="settings-page__form-message settings-page__form-message--success">{profileSuccess}</p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section className="settings-page__section">
          <h2 className="settings-page__section-title">Безопасность</h2>
          {renderSecurityPanel()}
        </section>

        {isEmployer ? (
          <section className="settings-page__section">
            <h2 className="settings-page__section-title">Доступ для сотрудников</h2>
            <div className="settings-page__panel">
              <div className="settings-page__panel-body settings-page__panel-body--staff">
                <Button type="button" variant={actionVariant} size="md">
                  Пригласить сотрудника
                </Button>
                <div className="settings-page__staff-list">
                  {employerStaffMembers.map((member) => (
                    <article key={member.email} className="settings-page__staff-card">
                      <div className="settings-page__staff-card-header">
                        <div className="settings-page__staff-card-title-group">
                          <h3 className="settings-page__staff-email">{member.email}</h3>
                        </div>
                        <div className="settings-page__staff-actions" aria-label={`Действия для ${member.email}`}>
                          <button type="button" className="settings-page__icon-button" aria-label={`Редактировать ${member.email}`}>
                            <img src={editIcon} alt="" aria-hidden="true" className="settings-page__icon" />
                          </button>
                          <button type="button" className="settings-page__icon-button" aria-label={`Удалить ${member.email}`}>
                            <img src={deleteIcon} alt="" aria-hidden="true" className="settings-page__icon" />
                          </button>
                        </div>
                      </div>
                      <div className="settings-page__staff-card-body">
                        <p className="settings-page__staff-role">Роль: {member.role}</p>
                        <ul className="settings-page__staff-permission-list">
                          {member.permissions.map((permission) => (
                            <li key={`${member.email}-${permission}`} className="settings-page__staff-permission-item">
                              {permission}
                            </li>
                          ))}
                        </ul>
                        <p className="settings-page__staff-date">Приглашен: {member.invitedAt}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="settings-page__section">
          <h2 className="settings-page__section-title">Уведомления</h2>
          <div className="settings-page__notification-grid">
            <div className="settings-page__panel settings-page__panel--notification">
              <div className="settings-page__panel-header">
                <h3 className="settings-page__panel-title">E-mail уведомления</h3>
              </div>
              <div className="settings-page__panel-body settings-page__panel-body--notification">
                <div className="settings-page__checkbox-list">
                  {renderNotificationItems(visibleEmailNotifications, toggleEmailNotification, "email")}
                </div>
              </div>
            </div>
            <div className="settings-page__panel settings-page__panel--notification">
              <div className="settings-page__panel-header">
                <h3 className="settings-page__panel-title">Push-уведомления</h3>
              </div>
              <div className="settings-page__panel-body settings-page__panel-body--notification">
                <div className="settings-page__checkbox-list">
                  {renderNotificationItems(visiblePushNotifications, togglePushNotification, "push")}
                </div>
              </div>
            </div>
          </div>
          <div className="settings-page__section-actions">
            <Button
              type="button"
              variant={actionVariant}
              size="md"
              loading={updateNotificationPreferencesMutation.isPending}
              onClick={handleNotificationPreferencesSave}
            >
              Сохранить настройки
            </Button>
          </div>
        </section>

        <div className="settings-page__summary-grid">
          {renderLoginHistoryPanel()}
          {renderSessionsPanel()}
        </div>
      </>
    );
  };

  const renderModerationLayout = () => {
    return (
      <div className="settings-page__grid">
        <section className="settings-page__card">
          <div className="settings-page__card-header">
            <h2 className="settings-page__card-title">Профиль</h2>
          </div>
          <div className="settings-page__card-body settings-page__card-body--profile">
            <label className="settings-page__field">
              <span className="settings-page__field-label">ФИО</span>
              {isProfileLoading ? (
                <SettingsSkeleton className="settings-page__skeleton--input" />
              ) : (
                <Input
                  className="input--sm"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Введите имя"
                />
              )}
            </label>
            <label className="settings-page__field">
              <span className="settings-page__field-label">E-mail</span>
              {isProfileLoading ? (
                <SettingsSkeleton className="settings-page__skeleton--input" />
              ) : (
                <Input
                  className="input--sm"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Введите email"
                />
              )}
            </label>
          </div>
          <div className="settings-page__card-footer">
            <Button
              type="button"
              variant={actionVariant}
              size="md"
              onClick={handleProfileSave}
              loading={updateProfileMutation.isPending}
              disabled={isProfileLoading || !fullName.trim() || !email.trim()}
            >
              Сохранить изменения
            </Button>
            {profileError ? <p className="settings-page__form-message settings-page__form-message--error">{profileError}</p> : null}
            {profileSuccess ? (
              <p className="settings-page__form-message settings-page__form-message--success">{profileSuccess}</p>
            ) : null}
          </div>
        </section>

        <section className="settings-page__card">
          <div className="settings-page__card-header">
            <h2 className="settings-page__card-title">Безопасность</h2>
            <p className="settings-page__card-subtitle">Смена пароля</p>
          </div>
          <div className="settings-page__card-body">
            <label className="settings-page__field">
              <span className="settings-page__field-label">Текущий пароль</span>
              <Input type="password" className="input--sm" placeholder="Введите текущий пароль" />
            </label>
            <label className="settings-page__field">
              <span className="settings-page__field-label">Новый пароль</span>
              <Input type="password" className="input--sm" placeholder="Введите новый пароль" />
            </label>
            <label className="settings-page__field">
              <span className="settings-page__field-label">Подтверждение пароля</span>
              <Input type="password" className="input--sm" placeholder="Повторите новый пароль" />
            </label>
          </div>
          <div className="settings-page__card-footer settings-page__card-footer--stacked">
            <Button type="button" variant={outlineVariant} size="md">
              Восстановить пароль
            </Button>
            <Button type="button" variant={actionVariant} size="md">
              Изменить пароль
            </Button>
          </div>
        </section>

        <section className="settings-page__card">
          <div className="settings-page__card-header">
            <h2 className="settings-page__card-title">Уведомления</h2>
          </div>
          <div className="settings-page__card-body settings-page__card-body--notifications">
            <div className="settings-page__group">
              <h3 className="settings-page__group-title">E-mail уведомления</h3>
              <div className="settings-page__checkbox-list">
                {renderNotificationItems(visibleEmailNotifications, toggleEmailNotification, "moderation-email")}
              </div>
            </div>
            <div className="settings-page__group">
              <h3 className="settings-page__group-title">Push-уведомления</h3>
              <div className="settings-page__checkbox-list">
                {renderNotificationItems(visiblePushNotifications, togglePushNotification, "moderation-push")}
              </div>
            </div>
          </div>
          <div className="settings-page__card-footer">
            <Button
              type="button"
              variant={actionVariant}
              size="md"
              loading={updateNotificationPreferencesMutation.isPending}
              onClick={handleNotificationPreferencesSave}
            >
              Сохранить настройки
            </Button>
          </div>
        </section>

        <section className="settings-page__card">
          <div className="settings-page__card-header">
            <h2 className="settings-page__card-title">Активные сессии</h2>
          </div>
          <div className="settings-page__card-body settings-page__card-body--sessions">
            <div className="settings-page__session-list">
              {isSessionsLoading
                ? Array.from({ length: 3 }, (_, index) => (
                    <div key={`session-skeleton-${index}`} className="settings-page__session-item">
                      <SettingsSkeleton className="settings-page__skeleton--dot" />
                      <div className="settings-page__session-content">
                        <SettingsSkeleton className="settings-page__skeleton--session-line" />
                        <SettingsSkeleton className="settings-page__skeleton--session-line settings-page__skeleton--session-line-short" />
                        <SettingsSkeleton className="settings-page__skeleton--session-line settings-page__skeleton--session-line-short" />
                      </div>
                    </div>
                  ))
                : sessionItems.map((session) => (
                    <div key={session.id} className="settings-page__session-item">
                      <span className="settings-page__session-dot" aria-hidden="true" />
                      <div className="settings-page__session-content">
                        <p className="settings-page__session-title">{session.title}</p>
                        <p className="settings-page__session-meta">{session.meta}</p>
                        <p className="settings-page__session-date">{session.date}</p>
                        <Button
                          type="button"
                          variant="accent-ghost"
                          size="md"
                          className={
                            session.isCurrent
                              ? "settings-page__session-action settings-page__session-action--disabled"
                              : "settings-page__session-action"
                          }
                          disabled={session.isCurrent || isSessionActionPending}
                          onClick={() => {
                            revokeSessionMutation.mutate(session.id);
                          }}
                        >
                          Завершить сессию
                        </Button>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
          <div className="settings-page__card-footer settings-page__card-footer--stacked">
            <Button
              type="button"
              variant={actionVariant}
              size="md"
              loading={revokeOtherSessionsMutation.isPending}
              disabled={isSessionActionPending}
              onClick={() => revokeOtherSessionsMutation.mutate()}
            >
              Завершить все другие сессии
            </Button>
          </div>
        </section>

        <section className="settings-page__card">
          <div className="settings-page__card-header">
            <h2 className="settings-page__card-title">{resolveModerationTitle(role)}</h2>
            <p className="settings-page__card-subtitle">Сроки проверки</p>
          </div>
          <div className="settings-page__card-body settings-page__card-body--moderation">
            {isModerationSettingsLoading
              ? Array.from({ length: 4 }, (_, index) => (
                  <div key={`review-skeleton-${index}`} className="settings-page__review-row">
                    <SettingsSkeleton className="settings-page__skeleton--review-label" />
                    <SettingsSkeleton className="settings-page__skeleton--review-input" />
                    <SettingsSkeleton className="settings-page__skeleton--review-suffix" />
                  </div>
                ))
              : (
                <>
                  <div className="settings-page__review-row">
                    <span className="settings-page__review-label">Вакансии:</span>
                    <Input
                      type="number"
                      className="input--sm settings-page__review-input"
                      value={vacancyReviewHours}
                      onChange={(event) => setVacancyReviewHours(event.target.value)}
                      clearable={false}
                      min={1}
                    />
                    <span className="settings-page__review-suffix">часа</span>
                  </div>
                  <div className="settings-page__review-row">
                    <span className="settings-page__review-label">Стажировки:</span>
                    <Input
                      type="number"
                      className="input--sm settings-page__review-input"
                      value={internshipReviewHours}
                      onChange={(event) => setInternshipReviewHours(event.target.value)}
                      clearable={false}
                      min={1}
                    />
                    <span className="settings-page__review-suffix">часа</span>
                  </div>
                  <div className="settings-page__review-row">
                    <span className="settings-page__review-label">Мероприятия:</span>
                    <Input
                      type="number"
                      className="input--sm settings-page__review-input"
                      value={eventReviewHours}
                      onChange={(event) => setEventReviewHours(event.target.value)}
                      clearable={false}
                      min={1}
                    />
                    <span className="settings-page__review-suffix">часа</span>
                  </div>
                  <div className="settings-page__review-row">
                    <span className="settings-page__review-label">Менторские программы:</span>
                    <Input
                      type="number"
                      className="input--sm settings-page__review-input"
                      value={mentorshipReviewHours}
                      onChange={(event) => setMentorshipReviewHours(event.target.value)}
                      clearable={false}
                      min={1}
                    />
                    <span className="settings-page__review-suffix">часа</span>
                  </div>
                </>
              )}
          </div>
          <div className="settings-page__card-footer">
            <Button
              type="button"
              variant={actionVariant}
              size="md"
              loading={updateModerationSettingsMutation.isPending}
              onClick={handleModerationSettingsSave}
            >
              Сохранить настройки
            </Button>
          </div>
        </section>

        <section className="settings-page__card">
          <div className="settings-page__card-header">
            <h2 className="settings-page__card-title">История входов</h2>
          </div>
          <div className="settings-page__card-body settings-page__card-body--history">
            <div className="settings-page__history-list">
              {isLoginHistoryLoading
                ? Array.from({ length: 4 }, (_, index) => (
                    <div key={`history-skeleton-${index}`} className="settings-page__history-item">
                      <SettingsSkeleton className="settings-page__skeleton--dot" />
                      <SettingsSkeleton className="settings-page__skeleton--history-line" />
                      <SettingsSkeleton className="settings-page__skeleton--history-status" />
                    </div>
                  ))
                : loginHistoryItems.map((item) => (
                    <div key={item.id} className="settings-page__history-item">
                      <span className="settings-page__history-dot" aria-hidden="true" />
                      <span className="settings-page__history-date">{item.date}</span>
                      <Status className="settings-page__history-status" variant={item.statusVariant}>
                        {item.statusLabel}
                      </Status>
                    </div>
                  ))}
            </div>
          </div>
        </section>
      </div>
    );
  };

  return (
    <main className={pageClassName}>
      <header className="header">
        <div className="header__top">
          <Container className="home-page__container header__top-container">
            <div className="header__brand">
              <Link to="/" className="header__brand-name">
                Трамплин
              </Link>
              <div className="header__logo-badge">Лого</div>
            </div>

            <div className="header__main">
              {isModerationRole ? null : (
                <nav className="header__nav" aria-label="Основная навигация">
                  <NavLink to="/" end className="header__nav-link">
                    Главная
                  </NavLink>
                  <a href="#about" className="header__nav-link">
                    О проекте
                  </a>
                </nav>
              )}

              <div className="header__controls">
                <label className="header__search" aria-label="Поиск">
                  <Input
                    type="search"
                    placeholder="Поиск"
                    aria-label="Поиск по платформе"
                    className="input--sm header__search-input"
                  />
                </label>

                <div className="header__actions">
                  <div className="header__account-actions" aria-label="Действия аккаунта">
                    <NotificationMenu
                      buttonClassName="header__icon-button"
                      iconClassName="header__icon-button-image"
                    />

                    <div
                      ref={profileMenuRef}
                      className="header__profile-menu"
                      onMouseEnter={openProfileMenu}
                      onMouseLeave={scheduleProfileMenuClose}
                    >
                      <button
                        type="button"
                        className="header__icon-button"
                        aria-label="Профиль"
                        aria-expanded={isProfileMenuOpen}
                        aria-haspopup="menu"
                        onClick={() => {
                          clearProfileMenuCloseTimeout();
                          setIsProfileMenuPinned((currentPinned) => {
                            const nextPinned = !currentPinned;
                            setIsProfileMenuOpen(nextPinned);
                            return nextPinned;
                          });
                        }}
                      >
                        <img
                          src={profileIcon}
                          alt=""
                          aria-hidden="true"
                          className="header__icon-button-image"
                        />
                      </button>

                      <div
                        className={
                          isProfileMenuOpen
                            ? "header__profile-dropdown"
                            : "header__profile-dropdown header__profile-dropdown--hidden"
                        }
                        role="menu"
                        aria-hidden={!isProfileMenuOpen}
                      >
                        {profileMenuItems.map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            className={
                              item.isDanger
                                ? "header__profile-dropdown-item header__profile-dropdown-item--danger"
                                : "header__profile-dropdown-item"
                            }
                            role="menuitem"
                            onClick={item.onClick}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </div>

        <div className="header__bottom">
          <Container className="home-page__container header__bottom-container">
            {isModerationRole ? (
              <nav className="header__categories header__categories--curator" aria-label="Навигация куратора">
                <NavLink to="/" end className="header__category-link">
                  Дашборд
                </NavLink>
                <NavLink to="/moderation/employers" className="header__category-link">
                  Верификация работодателей
                </NavLink>
                <NavLink to="/moderation/content" className="header__category-link">
                  Модерация контента
                </NavLink>
                {role === "admin" ? (
                  <NavLink to="/moderation/curators" className="header__category-link">
                    Управление кураторами
                  </NavLink>
                ) : null}
                <NavLink to="/settings" className="header__category-link">
                  Настройки
                </NavLink>
              </nav>
            ) : (
              <>
                <nav className="header__categories" aria-label="Категории">
                  <a href="#vacancies" className="header__category-link">
                    Вакансии
                  </a>
                  <a href="#internships" className="header__category-link">
                    Стажировки
                  </a>
                  <a href="#events" className="header__category-link">
                    Мероприятия
                  </a>
                  <a href="#mentorship" className="header__category-link">
                    Менторство
                  </a>
                </nav>

                <CitySelector value={selectedCity} onChange={handleCityChange} />
              </>
            )}
          </Container>
        </div>
      </header>

      <Container className="settings-page__container">
        {isModerationRole ? (
          <div className="settings-page__header">
            <h1 className="settings-page__title">Настройки</h1>
          </div>
        ) : null}

        {isModerationRole ? renderModerationLayout() : renderPublicLayout()}
      </Container>

      <Footer theme={themeRole} />
    </main>
  );
}
