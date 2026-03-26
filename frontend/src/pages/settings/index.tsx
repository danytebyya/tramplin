import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useNavigate } from "react-router-dom";

import profileIcon from "../../assets/icons/profile.svg";
import {
  CitySelector,
  CitySelection,
  readSelectedCityCookie,
  removeSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import {
  getNotificationPreferencesRequest,
  listActiveSessionsRequest,
  listLoginHistoryRequest,
  meRequest,
  NotificationPreferenceGroup,
  NotificationPreferenceKey,
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

const notificationPreferenceDefinitions: Array<{ key: NotificationPreferenceKey; label: string }> = [
  { key: "new_verification_requests", label: "Новые заявки на верификацию" },
  { key: "content_complaints", label: "Жалобы на контент" },
  { key: "overdue_reviews", label: "Просроченные проверки" },
  { key: "company_profile_changes", label: "Изменения в профиле компании" },
  { key: "publication_changes", label: "Изменения в публикациях" },
  { key: "daily_digest", label: "Ежедневная сводка" },
  { key: "weekly_report", label: "Еженедельный отчет" },
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

function buildNotificationPreferences(
  group?: Partial<NotificationPreferenceGroup>,
  role: string | null = null,
): NotificationPreference[] {
  const defaultGroup = resolveDefaultNotificationPreferenceGroup(role);
  return notificationPreferenceDefinitions.map((item) => ({
    key: item.key,
    label: item.label,
    enabled: group?.[item.key] ?? defaultGroup[item.key],
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
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuCloseTimeoutRef = useRef<number | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProfileMenuPinned, setIsProfileMenuPinned] = useState(false);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
  });
  const revokeOtherSessionsMutation = useMutation({
    mutationFn: revokeOtherSessionsRequest,
    onSuccess: () => {
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
    return (sessionsQuery.data?.data?.items ?? []).map((session) => ({
      id: session.id,
      title: resolveSessionTitle(session.user_agent, session.is_current),
      meta: `IP: ${session.ip_address ?? "Не определён"}`,
      date: formatDate(session.created_at),
      isCurrent: session.is_current,
    }));
  }, [sessionsQuery.data]);
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
          { label: "Профиль", isDanger: false },
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
                <a href="#content-moderation" className="header__category-link">
                  Модерация контента
                </a>
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
        <div className="settings-page__header">
          <h1 className="settings-page__title">Настройки</h1>
        </div>

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
                  {isNotificationLoading
                    ? Array.from({ length: 4 }, (_, index) => (
                        <div key={`email-skeleton-${index}`} className="settings-page__checkbox-row">
                          <SettingsSkeleton className="settings-page__skeleton--checkbox" />
                          <SettingsSkeleton className="settings-page__skeleton--checkbox-label" />
                        </div>
                      ))
                    : emailNotifications.map((item) => (
                        <label key={item.key} className="settings-page__checkbox-row">
                          <Checkbox
                            variant={checkboxVariant}
                            checked={item.enabled}
                            onChange={() => toggleEmailNotification(item.key)}
                          />
                          <span className="settings-page__checkbox-label">{item.label}</span>
                        </label>
                      ))}
                </div>
              </div>
              <div className="settings-page__group">
                <h3 className="settings-page__group-title">Push-уведомления</h3>
                <div className="settings-page__checkbox-list">
                  {isNotificationLoading
                    ? Array.from({ length: 4 }, (_, index) => (
                        <div key={`push-skeleton-${index}`} className="settings-page__checkbox-row">
                          <SettingsSkeleton className="settings-page__skeleton--checkbox" />
                          <SettingsSkeleton className="settings-page__skeleton--checkbox-label" />
                        </div>
                      ))
                    : pushNotifications.map((item) => (
                        <label key={item.key} className="settings-page__checkbox-row">
                          <Checkbox
                            variant={checkboxVariant}
                            checked={item.enabled}
                            onChange={() => togglePushNotification(item.key)}
                          />
                          <span className="settings-page__checkbox-label">{item.label}</span>
                        </label>
                      ))}
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
                            className="settings-page__session-action"
                            disabled={revokeSessionMutation.isPending}
                            onClick={() => {
                              if (session.isCurrent) {
                                handleLogout();
                                return;
                              }

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
                onClick={() => revokeOtherSessionsMutation.mutate()}
              >
                Завершить все другие сессии
              </Button>
            </div>
          </section>

          {isModerationRole ? (
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
          ) : null}

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
      </Container>
      <Footer theme={themeRole} />
    </main>
  );
}
