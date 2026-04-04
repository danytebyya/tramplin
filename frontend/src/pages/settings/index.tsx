import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, NavigateFunction, NavigateOptions, useNavigate, useSearchParams } from "react-router-dom";

import deleteIcon from "../../assets/icons/delete.svg";
import editIcon from "../../assets/icons/edit.svg";
import copyIcon from "../../assets/icons/copy.svg";
import copiedIcon from "../../assets/icons/check-mark-light.png";
import { DeleteAccountModal } from "../../features/account";
import {
  CitySelector,
  CitySelection,
  readSelectedCityCookie,
  removeSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import { getAppOrigin, resolveAppUrl } from "../../shared/config/env";
import {
  AuthSessionItem,
  AuthSessionListResponse,
  MeResponse,
  NotificationPreferenceGroup,
  NotificationPreferenceKey,
  changePasswordRequest,
  clearClientSession,
  clearCompanyInviteReturnTo,
  deleteCurrentUserRequest,
  getEmployerAccessState,
  getNotificationPreferencesRequest,
  listAccountContextsRequest,
  listActiveSessionsRequest,
  listLoginHistoryRequest,
  meRequest,
  persistCompanyInviteReturnTo,
  readAccessTokenPayload,
  readCompanyInviteReturnTo,
  requestPasswordResetCode,
  revokeOtherSessionsRequest,
  revokeSessionRequest,
  switchAccountContextRequest,
  updateApplicantPrivacySettingsRequest,
  updateNotificationPreferencesRequest,
  updatePreferredCityRequest,
  useAuthStore,
} from "../../features/auth";
import { NotificationMenu } from "../../features/notifications";
import {
  getModerationSettingsRequest,
  updateCuratorRequest,
  updateModerationSettingsRequest,
} from "../../features/moderation";
import {
  acceptEmployerStaffInvitation,
  createEmployerStaffInvitation,
  deleteEmployerStaffInvitation,
  deleteEmployerStaffMembership,
  listEmployerStaff,
  listEmployerStaffInvitations,
} from "../../features/company-verification";
import {
  DEFAULT_APPLICANT_PRIVACY_SETTINGS,
} from "../../shared/lib";
import { abbreviateLegalEntityName } from "../../shared/lib/legal-entity";
import { Button, Checkbox, Container, Input, Modal, ProfileTabs, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import {
  buildApplicantProfileMenuItems,
  buildEmployerProfileMenuItems,
  buildModerationProfileMenuItems,
  CuratorHeaderNavigation,
  Header,
} from "../../widgets/header";
import "../../widgets/header/header.css";
import "./settings.css";

type NotificationPreference = {
  key: NotificationPreferenceKey;
  label: string;
  enabled: boolean;
};

type ApplicantProfileVisibility = "public" | "authorized" | "hidden";

const notificationPreferenceKeys: NotificationPreferenceKey[] = [
  "new_verification_requests",
  "content_complaints",
  "overdue_reviews",
  "company_profile_changes",
  "publication_changes",
  "chat_reminders",
  "daily_digest",
  "weekly_report",
];

const defaultNotificationPreferenceGroup: NotificationPreferenceGroup = {
  new_verification_requests: true,
  content_complaints: false,
  overdue_reviews: false,
  company_profile_changes: false,
  publication_changes: false,
  chat_reminders: true,
  daily_digest: false,
  weekly_report: false,
};

function resolveDefaultNotificationPreferenceGroup(role: string | null): NotificationPreferenceGroup {
  if (role === "employer") {
    return {
      new_verification_requests: true,
      content_complaints: false,
      overdue_reviews: false,
      company_profile_changes: true,
      publication_changes: false,
      chat_reminders: true,
      daily_digest: false,
      weekly_report: false,
    };
  }

  if (role === "junior" || role === "curator" || role === "admin") {
    return {
      new_verification_requests: false,
      content_complaints: false,
      overdue_reviews: false,
      company_profile_changes: false,
      publication_changes: false,
      chat_reminders: false,
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
      case "chat_reminders":
        return "Напоминания о непрочитанных сообщениях";
      default:
        return key;
    }
  }

  if (role === "applicant") {
    switch (key) {
      case "publication_changes":
        return "Ответы работодателей по откликам";
      case "chat_reminders":
        return "Напоминания о непрочитанных сообщениях";
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
    case "chat_reminders":
      return "Напоминания о непрочитанных сообщениях";
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
    return ["new_verification_requests", "company_profile_changes", "chat_reminders"];
  }

  if (role === "applicant") {
    return ["publication_changes", "chat_reminders", "daily_digest", "weekly_report"];
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
  if (role === null || role === "employer") {
    return "primary" as const;
  }

  if (role === "junior" || role === "curator" || role === "admin") {
    return "accent" as const;
  }

  return "secondary" as const;
}

function resolveOutlineVariant(role: string | null) {
  if (role === null || role === "employer") {
    return "primary-outline" as const;
  }

  if (role === "junior" || role === "curator" || role === "admin") {
    return "accent-outline" as const;
  }

  return "secondary-outline" as const;
}

function resolveModalTitleAccentColor(role: string | null) {
  if (role === null || role === "employer") {
    return "var(--color-primary)";
  }

  if (role === "junior" || role === "curator" || role === "admin") {
    return "var(--color-accent)";
  }

  return "var(--color-secondary)";
}

function resolveCheckboxVariant(role: string | null) {
  if (role === null || role === "employer") {
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

function resolveEmployerStaffRoleLabel(role: string) {
  if (role === "owner") {
    return "Владелец";
  }

  if (role === "recruiter") {
    return "Рекрутер";
  }

  if (role === "manager") {
    return "Менеджер";
  }

  return "Наблюдатель";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeInvitationUrl(invitationUrl?: string | null) {
  const normalizedUrl = invitationUrl?.trim();
  if (!normalizedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedUrl, getAppOrigin());
    const inviteToken = parsedUrl.searchParams.get("invite_token");
    const mode = parsedUrl.searchParams.get("mode") ?? "accept-company-invite";

    if (inviteToken) {
      return resolveAppUrl(`/settings?mode=${encodeURIComponent(mode)}&invite_token=${encodeURIComponent(inviteToken)}`);
    }

    return resolveAppUrl(`${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`);
  } catch {
    return resolveAppUrl(normalizedUrl);
  }
}

type EmployerStaffPermissionState = {
  canReviewResponses: boolean;
  canManageOpportunities: boolean;
  canManageCompanyProfile: boolean;
  canManageStaff: boolean;
  canAccessChat: boolean;
};

const defaultEmployerStaffPermissions: EmployerStaffPermissionState = {
  canReviewResponses: true,
  canManageOpportunities: false,
  canManageCompanyProfile: false,
  canManageStaff: false,
  canAccessChat: false,
};

function mapEmployerStaffPermissionsToKeys(permissions: EmployerStaffPermissionState) {
  const items: string[] = [];

  if (permissions.canReviewResponses) {
    items.push("view_responses");
  }
  if (permissions.canManageOpportunities) {
    items.push("manage_opportunities");
  }
  if (permissions.canManageCompanyProfile) {
    items.push("manage_company_profile");
  }
  if (permissions.canManageStaff) {
    items.push("manage_staff");
  }
  if (permissions.canAccessChat) {
    items.push("access_chat");
  }

  return items;
}

function resolveEmployerStaffPermissionLabel(permission: string) {
  if (permission === "view_responses") {
    return "Просмотр откликов";
  }

  if (permission === "manage_opportunities") {
    return "Создание и редактирование возможностей";
  }

  if (permission === "manage_company_profile") {
    return "Управление профилем компании";
  }

  if (permission === "manage_staff") {
    return "Управление сотрудниками";
  }

  if (permission === "access_chat") {
    return "Общение в чате";
  }

  return permission;
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

function resolveStaffInvitationStatusLabel(kind: "email" | "link") {
  if (kind === "email") {
    return "Ссылка отправлена";
  }

  return "Ожидание перехода по ссылке";
}

function isFutureDate(value: string) {
  return new Date(value).getTime() > Date.now();
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

function buildSessionDeduplicationKey(session: AuthSessionItem) {
  return JSON.stringify({
    userAgent: session.user_agent?.trim() ?? "",
    ipAddress: session.ip_address?.trim() ?? "",
    createdAt: session.created_at,
    expiresAt: session.expires_at,
    isCurrent: session.is_current,
  });
}

function dedupeActiveSessions(items: AuthSessionItem[]) {
  const groups = new Map<
    string,
    {
      session: AuthSessionItem;
      sessionIds: string[];
    }
  >();

  items.forEach((session) => {
    const key = buildSessionDeduplicationKey(session);
    const existingGroup = groups.get(key);

    if (!existingGroup) {
      groups.set(key, {
        session,
        sessionIds: [session.id],
      });
      return;
    }

    existingGroup.sessionIds.push(session.id);

    if (compareSessionsByPriority(existingGroup.session, session) > 0) {
      existingGroup.session = session;
    }
  });

  return Array.from(groups.values());
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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const themeRole = resolveThemeRole(role);
  const actionVariant = resolveActionVariant(role);
  const outlineVariant = resolveOutlineVariant(role);
  const modalTitleAccentColor = resolveModalTitleAccentColor(role);
  const checkboxVariant = resolveCheckboxVariant(role);
  const isModerationRole = role === "junior" || role === "curator" || role === "admin";
  const isEmployer = role === "employer";
  const isApplicant = role === "applicant";
  const isPublicRole = isEmployer || isApplicant;
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const profileMenuCloseTimeoutRef = useRef<number | null>(null);
  const [isProfileMenuPinned, setIsProfileMenuPinned] = useState(false);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const [expandedStaffMemberId, setExpandedStaffMemberId] = useState<string | null>(null);
  const [expandedInvitationId, setExpandedInvitationId] = useState<string | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<
    | {
        kind: "membership";
        id: string;
        email: string;
        isCurrentUser: boolean;
      }
    | {
        kind: "invitation";
        id: string;
        email: string;
      }
    | null
  >(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [moderationProfileFullName, setModerationProfileFullName] = useState("");
  const [moderationProfileEmail, setModerationProfileEmail] = useState("");
  const [moderationProfileError, setModerationProfileError] = useState<string | null>(null);
  const [moderationProfileSuccess, setModerationProfileSuccess] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [isLeaveConfirmModalOpen, setIsLeaveConfirmModalOpen] = useState(false);
  const [isRevokeOtherSessionsModalOpen, setIsRevokeOtherSessionsModalOpen] = useState(false);
  const [leaveConfirmError, setLeaveConfirmError] = useState<string | null>(null);
  const [isStaffInviteModalOpen, setIsStaffInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteEmailServerError, setInviteEmailServerError] = useState<string | null>(null);
  const [latestInvitationUrl, setLatestInvitationUrl] = useState<string | null>(null);
  const [isInviteLinkCopied, setIsInviteLinkCopied] = useState(false);
  const [invitePermissions, setInvitePermissions] = useState<EmployerStaffPermissionState>(
    defaultEmployerStaffPermissions,
  );
  const [staffInviteAcceptError, setStaffInviteAcceptError] = useState<string | null>(null);
  const autoAcceptedInviteTokenRef = useRef<string | null>(null);
  const pendingNavigationActionRef = useRef<(() => void) | null>(null);

  const inviteToken = searchParams.get("invite_token");
  const inviteMode = searchParams.get("mode");
  const hasPendingCompanyInvite = inviteMode === "accept-company-invite" && Boolean(inviteToken);
  const accessTokenPayload = useMemo(() => readAccessTokenPayload(accessToken), [accessToken]);
  const employerAccess = useMemo(() => getEmployerAccessState(role, accessToken), [accessToken, role]);
  const activeEmployerMembershipIdFromToken = accessTokenPayload?.active_membership_id ?? null;
  const activeEmployerPermissionKeys = accessTokenPayload?.active_permissions ?? [];

  const { data: meData, status: meStatus } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const canManageEmployerStaffByState =
    isEmployer &&
    (
      activeEmployerPermissionKeys.includes("manage_staff") ||
      (activeEmployerPermissionKeys.length === 0 &&
        Boolean(meData?.data?.user?.employer_profile))
    );

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
  const accountContextsQuery = useQuery({
    queryKey: ["auth", "contexts"],
    queryFn: listAccountContextsRequest,
    staleTime: 30 * 1000,
    enabled: isAuthenticated,
  });
  const employerStaffQuery = useQuery({
    queryKey: ["companies", "staff"],
    queryFn: listEmployerStaff,
    staleTime: 30 * 1000,
    enabled: isAuthenticated && canManageEmployerStaffByState,
    retry: false,
  });
  const employerStaffInvitationsQuery = useQuery({
    queryKey: ["companies", "staff", "invitations"],
    queryFn: listEmployerStaffInvitations,
    staleTime: 30 * 1000,
    enabled: isAuthenticated && canManageEmployerStaffByState,
    retry: false,
  });

  const user = meData?.data?.user;
  const preferredCity = user?.preferred_city?.trim() || "";
  const isCityReady = !isAuthenticated || meStatus !== "pending";
  const displayCity = preferredCity || selectedCity;
  const canManageEmployerStaff = canManageEmployerStaffByState;
  const isNotificationLoading = notificationPreferencesQuery.isPending;
  const isSessionsLoading = sessionsQuery.isPending;
  const isLoginHistoryLoading = loginHistoryQuery.isPending;
  const isModerationSettingsLoading = isModerationRole && moderationSettingsQuery.isPending;
  const isEmployerStaffLoading = canManageEmployerStaff && employerStaffQuery.isPending;
  const isEmployerStaffInvitationsLoading = canManageEmployerStaff && employerStaffInvitationsQuery.isPending;
  const isEmployerStaffForbidden =
    employerStaffQuery.error && (employerStaffQuery.error as any)?.response?.data?.error?.code === "EMPLOYER_STAFF_MANAGEMENT_FORBIDDEN";
  const canViewEmployerStaffSection = canManageEmployerStaff && !isEmployerStaffForbidden;

  const [emailNotifications, setEmailNotifications] = useState(() => buildNotificationPreferences(undefined, role));
  const [pushNotifications, setPushNotifications] = useState(() => buildNotificationPreferences(undefined, role));
  const [notificationPreferencesError, setNotificationPreferencesError] = useState<string | null>(null);
  const [notificationPreferencesSuccess, setNotificationPreferencesSuccess] = useState<string | null>(null);
  const [profileVisibility, setProfileVisibility] = useState<ApplicantProfileVisibility>(
    DEFAULT_APPLICANT_PRIVACY_SETTINGS.profileVisibility,
  );
  const [isResumeVisible, setIsResumeVisible] = useState(DEFAULT_APPLICANT_PRIVACY_SETTINGS.showResume);
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

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      await Promise.all(sessionIds.map((sessionId) => revokeSessionRequest(sessionId)));
    },
    onSuccess: (_response, revokedSessionIds) => {
      const revokedSessionIdSet = new Set(revokedSessionIds);

      queryClient.setQueryData<AuthSessionListResponse | undefined>(["auth", "sessions"], (current) => {
        if (!current?.data?.items) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            items: current.data.items.filter((session) => !revokedSessionIdSet.has(session.id)),
          },
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
  });

  const revokeOtherSessionsMutation = useMutation({
    mutationFn: revokeOtherSessionsRequest,
    onSuccess: () => {
      setIsRevokeOtherSessionsModalOpen(false);
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
    onMutate: () => {
      setNotificationPreferencesError(null);
      setNotificationPreferencesSuccess(null);
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["users", "me", "notification-preferences"], response);
      setEmailNotifications(buildNotificationPreferences(response.data?.email_notifications, role));
      setPushNotifications(buildNotificationPreferences(response.data?.push_notifications, role));
      setNotificationPreferencesSuccess("Настройки уведомлений сохранены.");
    },
    onError: (error: any) => {
      setNotificationPreferencesError(
        error?.response?.data?.error?.message ?? "Не удалось сохранить настройки уведомлений. Попробуйте еще раз.",
      );
    },
  });
  const updateApplicantPrivacyMutation = useMutation({
    mutationFn: updateApplicantPrivacySettingsRequest,
    onSuccess: (response) => {
      queryClient.setQueryData<MeResponse | undefined>(["auth", "me"], (current) => {
        if (!current?.data?.user) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            user: {
              ...current.data.user,
              applicant_profile: {
                ...(current.data.user.applicant_profile ?? {}),
                profile_visibility: response.data?.profile_visibility ?? DEFAULT_APPLICANT_PRIVACY_SETTINGS.profileVisibility,
                show_resume: response.data?.show_resume ?? DEFAULT_APPLICANT_PRIVACY_SETTINGS.showResume,
              },
            },
          },
        };
      });
    },
  });
  const updateModerationProfileMutation = useMutation({
    mutationFn: async ({
      curatorId,
      payload,
    }: {
      curatorId: string;
      payload: {
        full_name: string;
        email: string;
        role: "junior" | "curator" | "admin";
      };
    }) => updateCuratorRequest(curatorId, payload),
    onMutate: () => {
      setModerationProfileError(null);
      setModerationProfileSuccess(null);
    },
    onSuccess: (_response, variables) => {
      queryClient.setQueryData<MeResponse | undefined>(["auth", "me"], (current) => {
        if (!current?.data?.user) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            user: {
              ...current.data.user,
              display_name: variables.payload.full_name,
              email: variables.payload.email,
            },
          },
        };
      });
      setModerationProfileSuccess("Профиль сохранён.");
    },
    onError: (error: any) => {
      setModerationProfileError(
        error?.response?.data?.error?.message ?? "Не удалось сохранить профиль. Попробуйте еще раз.",
      );
    },
  });
  const changePasswordMutation = useMutation({
    mutationFn: changePasswordRequest,
    onMutate: () => {
      setSecurityError(null);
      setSecuritySuccess(null);
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSecuritySuccess("Пароль успешно изменён.");
    },
    onError: (error: any) => {
      setSecurityError(
        error?.response?.data?.error?.message ?? "Не удалось изменить пароль. Попробуйте еще раз.",
      );
    },
  });
  const requestPasswordResetMutation = useMutation({
    mutationFn: requestPasswordResetCode,
    onMutate: () => {
      setSecurityError(null);
      setSecuritySuccess(null);
    },
    onSuccess: () => {
      const normalizedEmail = user?.email?.trim();
      if (!normalizedEmail) {
        setSecurityError("Не удалось определить email для восстановления пароля.");
        return;
      }

      navigate(`/password-recovery?email=${encodeURIComponent(normalizedEmail)}&step=code`);
    },
    onError: (error: any) => {
      setSecurityError(
        error?.response?.data?.error?.message ??
          "Не удалось отправить код восстановления. Попробуйте еще раз.",
      );
    },
  });

  const updateModerationSettingsMutation = useMutation({
    mutationFn: updateModerationSettingsRequest,
    onSuccess: (response) => {
      queryClient.setQueryData(["moderation", "settings"], response);
    },
  });
  const createEmployerStaffInvitationMutation = useMutation({
    mutationFn: createEmployerStaffInvitation,
    onMutate: () => {
      setInviteError(null);
      setInviteEmailServerError(null);
    },
    onSuccess: (response) => {
      const invitationUrl = normalizeInvitationUrl(response?.data?.invitation_url);
      setLatestInvitationUrl(invitationUrl);
      setInviteEmail("");
      setInviteEmailServerError(null);
      setInvitePermissions(defaultEmployerStaffPermissions);
      if (trimmedInviteEmail) {
        setIsStaffInviteModalOpen(false);
      }
      void queryClient.invalidateQueries({ queryKey: ["companies", "staff", "invitations"] });
    },
    onError: (error: any) => {
      const errorCode = error?.response?.data?.error?.code;
      const errorMessage =
        error?.response?.data?.error?.message ?? "Не удалось создать приглашение. Попробуйте еще раз.";

      if (errorCode === "EMPLOYER_STAFF_INVITATION_ALREADY_SENT") {
        setInviteEmailServerError(errorMessage);
        setInviteError(null);
        return;
      }

      setInviteError(
        errorMessage,
      );
    },
  });
  const deleteEmployerStaffMembershipMutation = useMutation({
    mutationFn: async ({
      membershipId,
      isCurrentUser,
    }: {
      membershipId: string;
      isCurrentUser: boolean;
    }) => {
      await syncActiveEmployerSession();
      await deleteEmployerStaffMembership(membershipId);
      return { isCurrentUser };
    },
    onSuccess: async ({ isCurrentUser }) => {
      setExpandedStaffMemberId(null);
      setPendingDeleteItem((current) => (current?.kind === "membership" ? null : current));

      if (isCurrentUser) {
        const contextsResponse = await listAccountContextsRequest();
        const baseContext = contextsResponse?.data?.items?.find((item) => item.is_default);
        if (baseContext?.id) {
          const switchResponse = await switchAccountContextRequest(baseContext.id);
          const nextAccessToken = switchResponse?.data?.access_token;
          const nextExpiresIn = switchResponse?.data?.expires_in;
          const currentRefreshToken = useAuthStore.getState().refreshToken;
          const nextRole = (switchResponse?.data?.active_context?.role ?? switchResponse?.data?.user?.role ?? "applicant") as
            | "applicant"
            | "employer"
            | "junior"
            | "curator"
            | "admin";

          if (nextAccessToken && nextExpiresIn && currentRefreshToken) {
            useAuthStore.getState().setSession(nextAccessToken, currentRefreshToken, nextRole, nextExpiresIn);
          }
        }

        navigate("/", { replace: true });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["companies", "staff"] }),
        queryClient.invalidateQueries({ queryKey: ["companies", "staff", "invitations"] }),
        queryClient.invalidateQueries({ queryKey: ["auth", "contexts"] }),
        queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
      ]);
    },
  });
  const deleteEmployerStaffInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      await syncActiveEmployerSession();
      return deleteEmployerStaffInvitation(invitationId);
    },
    onSuccess: (_response, invitationId) => {
      setExpandedInvitationId((current) => (current === invitationId ? null : current));
      setPendingDeleteItem((current) => (current?.kind === "invitation" && current.id === invitationId ? null : current));
      void queryClient.invalidateQueries({ queryKey: ["companies", "staff", "invitations"] });
    },
  });
  const acceptEmployerStaffInvitationMutation = useMutation({
    mutationFn: acceptEmployerStaffInvitation,
    onMutate: () => {
      setStaffInviteAcceptError(null);
    },
    onSuccess: async (response) => {
      const contextsResponse = await listAccountContextsRequest();
      const nextEmployerContext = contextsResponse?.data?.items?.find(
        (item) => item.role === "employer" && item.membership_id === response?.data?.id,
      );

      if (nextEmployerContext?.id) {
        const switchResponse = await switchAccountContextRequest(nextEmployerContext.id);
        const nextAccessToken = switchResponse?.data?.access_token;
        const nextExpiresIn = switchResponse?.data?.expires_in;
        const currentRefreshToken = useAuthStore.getState().refreshToken;
        const nextRole = (switchResponse?.data?.active_context?.role ?? switchResponse?.data?.user?.role ?? "applicant") as
          | "applicant"
          | "employer"
          | "junior"
          | "curator"
          | "admin";

        if (nextAccessToken && nextExpiresIn && currentRefreshToken) {
          useAuthStore.getState().setSession(nextAccessToken, currentRefreshToken, nextRole, nextExpiresIn);
        }
      }

      clearCompanyInviteReturnTo();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["companies", "staff"] }),
        queryClient.invalidateQueries({ queryKey: ["companies", "staff", "invitations"] }),
        queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
      ]);
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete("invite_token");
      nextSearchParams.delete("mode");
      setSearchParams(nextSearchParams, { replace: true });
    },
    onError: (error: any) => {
      setStaffInviteAcceptError(
        error?.response?.data?.error?.message ?? "Не удалось принять приглашение. Попробуйте еще раз.",
      );
    },
  });
  const deleteCurrentUserMutation = useMutation({
    mutationFn: deleteCurrentUserRequest,
    onMutate: () => {
      setDeleteAccountError(null);
    },
    onSuccess: (response) => {
      if (!response?.data?.deleted) {
        setDeleteAccountError("Сервер не подтвердил удаление аккаунта. Попробуйте еще раз.");
        return;
      }

      clearClientSession({ redirectTo: "/" });
    },
    onError: (error: any) => {
      setDeleteAccountError(
        error?.response?.data?.error?.message ?? "Не удалось удалить аккаунт. Попробуйте еще раз.",
      );
    },
  });

  const clearProfileMenuCloseTimeout = () => {
    if (profileMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(profileMenuCloseTimeoutRef.current);
      profileMenuCloseTimeoutRef.current = null;
    }
  };

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
    if (!isApplicant) {
      return;
    }
    setProfileVisibility(
      user?.applicant_profile?.profile_visibility ?? DEFAULT_APPLICANT_PRIVACY_SETTINGS.profileVisibility,
    );
    setIsResumeVisible(
      user?.applicant_profile?.show_resume ?? DEFAULT_APPLICANT_PRIVACY_SETTINGS.showResume,
    );
  }, [isApplicant, user?.applicant_profile?.profile_visibility, user?.applicant_profile?.show_resume]);

  useEffect(() => {
    if (!isModerationRole) {
      return;
    }

    setModerationProfileFullName(user?.display_name?.trim() ?? "");
    setModerationProfileEmail(user?.email?.trim() ?? "");
  }, [isModerationRole, user?.display_name, user?.email]);

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
    if (hasPendingCompanyInvite) {
      persistCompanyInviteReturnTo(`/settings?${searchParams.toString()}`);
    }
  }, [hasPendingCompanyInvite, searchParams]);

  useEffect(() => {
    const persistedInviteReturnTo = readCompanyInviteReturnTo();
    if (!persistedInviteReturnTo || hasPendingCompanyInvite) {
      return;
    }

    const [pathname, search = ""] = persistedInviteReturnTo.split("?");
    if (pathname !== "/settings") {
      return;
    }

    setSearchParams(new URLSearchParams(search), { replace: true });
  }, [hasPendingCompanyInvite, setSearchParams]);

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

  const getPasswordValidationError = () => {
    if (!currentPassword.trim()) {
      return "Введите текущий пароль";
    }

    if (!newPassword.trim()) {
      return "Введите новый пароль";
    }

    if (newPassword !== confirmPassword) {
      return "Новый пароль и подтверждение не совпадают";
    }

    return null;
  };

  const handleChangePassword = () => {
    const validationError = getPasswordValidationError();

    if (validationError) {
      setSecuritySuccess(null);
      setSecurityError(validationError);
      return;
    }

    changePasswordMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
    });
  };

  const handlePasswordRecovery = () => {
    const normalizedEmail = user?.email?.trim();
    if (!normalizedEmail) {
      setSecuritySuccess(null);
      setSecurityError("Не удалось определить email для восстановления пароля.");
      return;
    }

    requestPasswordResetMutation.mutate({ email: normalizedEmail });
  };

  const handleApplicantPrivacySave = () => {
    if (!isApplicant) {
      return;
    }
    updateApplicantPrivacyMutation.mutate({
      profile_visibility: profileVisibility,
      show_resume: isResumeVisible,
    });
  };

  const handleModerationProfileSave = () => {
    const curatorId = user?.id;
    const normalizedFullName = moderationProfileFullName.trim();
    const normalizedEmail = moderationProfileEmail.trim();

    setModerationProfileSuccess(null);

    if (!curatorId) {
      setModerationProfileError("Не удалось определить профиль пользователя.");
      return;
    }

    if (!normalizedFullName) {
      setModerationProfileError("Введите ФИО.");
      return;
    }

    if (!normalizedEmail) {
      setModerationProfileError("Введите E-mail.");
      return;
    }

    updateModerationProfileMutation.mutate({
      curatorId,
      payload: {
        full_name: normalizedFullName,
        email: normalizedEmail,
        role: role === "admin" || role === "curator" || role === "junior" ? role : "curator",
      },
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
    return dedupeActiveSessions(sessionsQuery.data?.data?.items ?? [])
      .sort((left, right) => compareSessionsByPriority(left.session, right.session))
      .map(({ session, sessionIds }) => ({
        id: session.id,
        sessionIds,
        title: resolveSessionTitle(session.user_agent, session.is_current),
        meta: `IP: ${session.ip_address ?? "Не определён"}`,
        date: formatDate(session.created_at),
        isCurrent: session.is_current,
      }));
  }, [sessionsQuery.data]);
  const hasOtherSessions = useMemo(() => sessionItems.some((session) => !session.isCurrent), [sessionItems]);

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
  const employerStaffItems = useMemo(() => {
    return (employerStaffQuery.data?.data?.items ?? []).map((item) => ({
      ...item,
      kind: "member" as const,
      roleLabel: resolveEmployerStaffRoleLabel(item.role),
      invitedAtLabel: formatDate(item.invited_at),
    }));
  }, [employerStaffQuery.data]);
  const employerStaffInvitationItems = useMemo(() => {
    return (employerStaffInvitationsQuery.data?.data?.items ?? [])
      .filter((item) => item.status !== "expired" && isFutureDate(item.expires_at))
      .map((item) => ({
        ...item,
        invitation_url: normalizeInvitationUrl(item.invitation_url),
        roleLabel: resolveEmployerStaffRoleLabel(item.role),
        permissions: (item.permissions ?? []).map(resolveEmployerStaffPermissionLabel),
        invitedAtLabel: formatDate(item.invited_at),
        expiresAtLabel: formatDate(item.expires_at),
      }));
  }, [employerStaffInvitationsQuery.data]);
  const linkOnlyInvitationItems = useMemo(
    () => employerStaffInvitationItems.filter((item) => !item.email),
    [employerStaffInvitationItems],
  );
  const emailInvitationStaffItems = useMemo(() => {
    return employerStaffInvitationItems
      .filter((item) => Boolean(item.email))
      .map((item) => ({
        ...item,
        kind: "invitation" as const,
        id: `invitation-${item.id}`,
        email: item.email as string,
        permissions: item.permissions ?? [],
        is_current_user: false,
        is_primary: false,
      }));
  }, [employerStaffInvitationItems]);
  const combinedEmployerStaffItems = useMemo(
    () => [...employerStaffItems, ...emailInvitationStaffItems],
    [emailInvitationStaffItems, employerStaffItems],
  );
  const isPrimaryEmployerManager = useMemo(
    () => employerStaffItems.some((item) => item.is_current_user && item.is_primary),
    [employerStaffItems],
  );
  const activeEmployerMembershipIdFromContext = useMemo(
    () =>
      accountContextsQuery.data?.data?.items?.find(
        (item) => item.role === "employer" && item.is_active && item.membership_id,
      )?.membership_id ?? null,
    [accountContextsQuery.data?.data?.items],
  );
  const activeEmployerContextId = useMemo(
    () =>
      accountContextsQuery.data?.data?.items?.find(
        (item) => item.role === "employer" && item.is_active,
      )?.id ?? null,
    [accountContextsQuery.data?.data?.items],
  );
  const activeEmployerMembershipId = activeEmployerMembershipIdFromToken ?? activeEmployerMembershipIdFromContext;
  const currentEmployerMembership = useMemo(
    () =>
      employerStaffItems.find(
        (item) =>
          item.is_current_user || (activeEmployerMembershipId !== null && item.id === activeEmployerMembershipId),
      ) ?? null,
    [activeEmployerMembershipId, employerStaffItems],
  );
  const canLeaveCurrentCompany =
    isEmployer &&
    activeEmployerMembershipId !== null &&
    (currentEmployerMembership ? !currentEmployerMembership.is_primary : !canViewEmployerStaffSection);
  const currentCompanyLeaveTarget = useMemo(
    () =>
      activeEmployerMembershipId
        ? {
            membershipId: activeEmployerMembershipId,
            email: currentEmployerMembership?.email ?? user?.email ?? "текущего профиля",
          }
        : null,
    [activeEmployerMembershipId, currentEmployerMembership?.email, user?.email],
  );
  const hasManagedEmployees =
    isEmployer &&
    Boolean(currentEmployerMembership?.is_primary) &&
    employerStaffItems.some((item) => !item.is_current_user);
  const isEmployerDeleteFlow = isEmployer;
  const isDeletingEmployerWithCascade = Boolean(hasManagedEmployees);
  const invitePermissionKeys = useMemo(
    () => mapEmployerStaffPermissionsToKeys(invitePermissions),
    [invitePermissions],
  );
  const trimmedInviteEmail = inviteEmail.trim();
  const isInviteLinkMode = !trimmedInviteEmail && Boolean(latestInvitationUrl);
  const inviteEmailError =
    trimmedInviteEmail.length > 0 && !isValidEmail(trimmedInviteEmail)
      ? "Введите корректный email"
      : null;
  const resolvedInviteEmailError = inviteEmailError ?? inviteEmailServerError;
  const initialEmailNotifications = useMemo(
    () => buildNotificationPreferences(notificationPreferencesQuery.data?.data?.email_notifications, role),
    [notificationPreferencesQuery.data?.data?.email_notifications, role],
  );
  const initialPushNotifications = useMemo(
    () => buildNotificationPreferences(notificationPreferencesQuery.data?.data?.push_notifications, role),
    [notificationPreferencesQuery.data?.data?.push_notifications, role],
  );
  const hasUnsavedNotificationPreferencesChanges =
    JSON.stringify(emailNotifications) !== JSON.stringify(initialEmailNotifications) ||
    JSON.stringify(pushNotifications) !== JSON.stringify(initialPushNotifications);
  const initialApplicantProfileVisibility =
    user?.applicant_profile?.profile_visibility ?? DEFAULT_APPLICANT_PRIVACY_SETTINGS.profileVisibility;
  const initialApplicantResumeVisibility =
    user?.applicant_profile?.show_resume ?? DEFAULT_APPLICANT_PRIVACY_SETTINGS.showResume;
  const hasUnsavedApplicantPrivacyChanges =
    isApplicant &&
    (
      profileVisibility !== initialApplicantProfileVisibility ||
      isResumeVisible !== initialApplicantResumeVisibility
    );
  const hasUnsavedModerationSettingsChanges =
    isModerationRole &&
    (
      vacancyReviewHours !== String(moderationSettingsQuery.data?.data?.vacancy_review_hours ?? 24) ||
      internshipReviewHours !== String(moderationSettingsQuery.data?.data?.internship_review_hours ?? 24) ||
      eventReviewHours !== String(moderationSettingsQuery.data?.data?.event_review_hours ?? 24) ||
      mentorshipReviewHours !== String(moderationSettingsQuery.data?.data?.mentorship_review_hours ?? 24)
    );
  const hasUnsavedModerationProfileChanges =
    isModerationRole &&
    (
      moderationProfileFullName !== (user?.display_name?.trim() ?? "") ||
      moderationProfileEmail !== (user?.email?.trim() ?? "")
    );
  const hasUnsavedSecurityChanges =
    currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;
  const hasUnsavedSettingsChanges =
    hasUnsavedModerationProfileChanges ||
    hasUnsavedNotificationPreferencesChanges ||
    hasUnsavedApplicantPrivacyChanges ||
    hasUnsavedModerationSettingsChanges ||
    hasUnsavedSecurityChanges;
  const isLeaveSavePending =
    updateModerationProfileMutation.isPending ||
    updateNotificationPreferencesMutation.isPending ||
    updateApplicantPrivacyMutation.isPending ||
    changePasswordMutation.isPending ||
    updateModerationSettingsMutation.isPending;

  useEffect(() => {
    if (!hasUnsavedSettingsChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedSettingsChanges]);

  const syncActiveEmployerSession = async () => {
    if (!activeEmployerContextId) {
      return;
    }

    const switchResponse = await switchAccountContextRequest(activeEmployerContextId);
    const nextAccessToken = switchResponse?.data?.access_token;
    const nextExpiresIn = switchResponse?.data?.expires_in;
    const currentRefreshToken = useAuthStore.getState().refreshToken;
    const nextRole = (switchResponse?.data?.active_context?.role ?? switchResponse?.data?.user?.role ?? "applicant") as
      | "applicant"
      | "employer"
      | "junior"
      | "curator"
      | "admin";

    if (nextAccessToken && nextExpiresIn && currentRefreshToken) {
      useAuthStore.getState().setSession(nextAccessToken, currentRefreshToken, nextRole, nextExpiresIn);
    }
  };

  const handleCreateStaffInvitation = () => {
    if (resolvedInviteEmailError || invitePermissionKeys.length === 0) {
      return;
    }

    createEmployerStaffInvitationMutation.mutate({
      email: trimmedInviteEmail || undefined,
      permissions: invitePermissionKeys,
    });
  };

  const isDeleteStaffItemPending =
    deleteEmployerStaffMembershipMutation.isPending || deleteEmployerStaffInvitationMutation.isPending;

  const handleConfirmDeleteStaffItem = () => {
    if (!pendingDeleteItem) {
      return;
    }

    if (pendingDeleteItem.kind === "invitation") {
      deleteEmployerStaffInvitationMutation.mutate(pendingDeleteItem.id);
      return;
    }

    deleteEmployerStaffMembershipMutation.mutate({
      membershipId: pendingDeleteItem.id,
      isCurrentUser: pendingDeleteItem.isCurrentUser,
    });
  };

  const closeDeleteAccountModal = () => {
    if (deleteCurrentUserMutation.isPending) {
      return;
    }

    setDeleteAccountError(null);
    setIsDeleteAccountModalOpen(false);
  };

  const openRevokeOtherSessionsModal = () => {
    if (isSessionActionPending || !hasOtherSessions) {
      return;
    }

    setIsRevokeOtherSessionsModalOpen(true);
  };

  const closeRevokeOtherSessionsModal = () => {
    if (revokeOtherSessionsMutation.isPending) {
      return;
    }

    setIsRevokeOtherSessionsModalOpen(false);
  };

  const handleConfirmRevokeOtherSessions = () => {
    revokeOtherSessionsMutation.mutate();
  };

  const handleDeleteAccount = () => {
    deleteCurrentUserMutation.mutate();
  };

  const attemptGuardedNavigation = useCallback(
    (action: () => void) => {
      if (!hasUnsavedSettingsChanges) {
        action();
        return;
      }

      setLeaveConfirmError(null);
      pendingNavigationActionRef.current = action;
      setIsLeaveConfirmModalOpen(true);
    },
    [hasUnsavedSettingsChanges],
  );

  const guardedNavigate = useCallback<NavigateFunction>(
    ((to: Parameters<NavigateFunction>[0], options?: NavigateOptions) => {
      attemptGuardedNavigation(() => {
        if (typeof to === "number") {
          navigate(to);
          return;
        }

        navigate(to, options);
      });
    }) as NavigateFunction,
    [attemptGuardedNavigation, navigate],
  );

  useEffect(() => {
    if (!hasUnsavedSettingsChanges) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;

      if (!anchor) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      const url = new URL(anchor.href, window.location.origin);

      if (url.origin !== window.location.origin) {
        return;
      }

      const nextPath = `${url.pathname}${url.search}${url.hash}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

      if (nextPath === currentPath) {
        return;
      }

      event.preventDefault();
      attemptGuardedNavigation(() => navigate(nextPath));
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [attemptGuardedNavigation, hasUnsavedSettingsChanges, navigate]);

  const saveSettingsChanges = async () => {
    setLeaveConfirmError(null);

    if (hasUnsavedSecurityChanges) {
      const validationError = getPasswordValidationError();

      if (validationError) {
        setSecuritySuccess(null);
        setSecurityError(validationError);
        setLeaveConfirmError(validationError);
        return false;
      }
    }

    try {
      if (hasUnsavedModerationProfileChanges) {
        const curatorId = user?.id;
        const normalizedFullName = moderationProfileFullName.trim();
        const normalizedEmail = moderationProfileEmail.trim();

        if (!curatorId) {
          setModerationProfileError("Не удалось определить профиль пользователя.");
          setLeaveConfirmError("Не удалось определить профиль пользователя.");
          return false;
        }

        if (!normalizedFullName) {
          setModerationProfileError("Введите ФИО.");
          setLeaveConfirmError("Введите ФИО.");
          return false;
        }

        if (!normalizedEmail) {
          setModerationProfileError("Введите E-mail.");
          setLeaveConfirmError("Введите E-mail.");
          return false;
        }

        await updateModerationProfileMutation.mutateAsync({
          curatorId,
          payload: {
            full_name: normalizedFullName,
            email: normalizedEmail,
            role: role === "admin" || role === "curator" || role === "junior" ? role : "curator",
          },
        });
      }

      if (hasUnsavedNotificationPreferencesChanges) {
        await updateNotificationPreferencesMutation.mutateAsync({
          email_notifications: mapNotificationPreferencesToPayload(emailNotifications, role),
          push_notifications: mapNotificationPreferencesToPayload(pushNotifications, role),
        });
      }

      if (hasUnsavedApplicantPrivacyChanges) {
        await updateApplicantPrivacyMutation.mutateAsync({
          profile_visibility: profileVisibility,
          show_resume: isResumeVisible,
        });
      }

      if (hasUnsavedModerationSettingsChanges) {
        await updateModerationSettingsMutation.mutateAsync({
          vacancy_review_hours: Math.max(Number(vacancyReviewHours) || 0, 1),
          internship_review_hours: Math.max(Number(internshipReviewHours) || 0, 1),
          event_review_hours: Math.max(Number(eventReviewHours) || 0, 1),
          mentorship_review_hours: Math.max(Number(mentorshipReviewHours) || 0, 1),
        });
      }

      if (hasUnsavedSecurityChanges) {
        await changePasswordMutation.mutateAsync({
          current_password: currentPassword,
          new_password: newPassword,
        });
      }

      return true;
    } catch (error: any) {
      setLeaveConfirmError(
        error?.response?.data?.error?.message ?? "Не удалось сохранить изменения. Попробуйте еще раз.",
      );
      return false;
    }
  };

  const handleCloseLeaveConfirmModal = () => {
    if (isLeaveSavePending) {
      return;
    }

    setLeaveConfirmError(null);
    setIsLeaveConfirmModalOpen(false);
    pendingNavigationActionRef.current = null;
  };

  const handleSaveAndLeave = async () => {
    const isSaved = await saveSettingsChanges();

    if (!isSaved) {
      return;
    }

    setIsLeaveConfirmModalOpen(false);
    const pendingAction = pendingNavigationActionRef.current;
    pendingNavigationActionRef.current = null;
    pendingAction?.();
  };

  useEffect(() => {
    if (!isInviteLinkCopied) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsInviteLinkCopied(false);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [isInviteLinkCopied]);

  useEffect(() => {
    setIsInviteLinkCopied(false);
  }, [latestInvitationUrl]);

  useEffect(() => {
    if (!hasPendingCompanyInvite || !inviteToken || !isAuthenticated) {
      return;
    }

    if (autoAcceptedInviteTokenRef.current === inviteToken) {
      return;
    }

    autoAcceptedInviteTokenRef.current = inviteToken;
    acceptEmployerStaffInvitationMutation.mutate(inviteToken);
  }, [
    acceptEmployerStaffInvitationMutation,
    hasPendingCompanyInvite,
    inviteToken,
    isAuthenticated,
  ]);

  const pageClassName = [
    "settings-page",
    `settings-page--${themeRole}`,
  ].join(" ");

  const profileMenuItems = isModerationRole
    ? buildModerationProfileMenuItems(guardedNavigate)
    : role === "employer"
      ? buildEmployerProfileMenuItems(guardedNavigate, employerAccess)
      : buildApplicantProfileMenuItems(guardedNavigate);
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
    if (role === "employer") {
      return (
        <ProfileTabs
          navigate={guardedNavigate}
          audience="employer"
          current="settings"
          employerAccess={employerAccess}
          tabsClassName="settings-page__tabs"
          tabClassName="settings-page__tab"
          activeTabClassName="settings-page__tab--active"
          ariaLabel="Разделы настроек"
        />
      );
    }

    return (
      <ProfileTabs
        navigate={guardedNavigate}
        audience="applicant"
        current="settings"
        tabsClassName="settings-page__tabs"
        tabClassName="settings-page__tab"
        activeTabClassName="settings-page__tab--active"
        ariaLabel="Разделы настроек"
      />
    );
  };

  const renderNotificationItems = (
    items: NotificationPreference[],
    onToggle: (key: NotificationPreferenceKey) => void,
    prefix: string,
  ) => {
    if (isNotificationLoading) {
      return Array.from({ length: isPublicRole ? 2 : 4 }, (_, index) => (
        <div key={`${prefix}-skeleton-${index}`} className="settings-page__preference-option">
          <SettingsSkeleton className="settings-page__skeleton--mark" />
          <SettingsSkeleton className="settings-page__skeleton--mark-label" />
        </div>
      ));
    }

    return items.map((item) => (
      <label key={`${prefix}-${item.key}`} className="settings-page__preference-option">
        <Checkbox
          variant={checkboxVariant}
          checked={item.enabled}
          onChange={() => onToggle(item.key)}
        />
        <span className="settings-page__preference-label">{item.label}</span>
      </label>
    ));
  };

  const renderSecurityPanel = (layout: "panel" | "card" = "panel") => {
    const containerClassName =
      layout === "card" ? "settings-page__card" : "settings-page__panel";
    const headerClassName =
      layout === "card" ? "settings-page__card-header" : "settings-page__panel-header";
    const titleClassName =
      layout === "card" ? "settings-page__card-title" : "settings-page__panel-title";
    const subtitleClassName =
      layout === "card" ? "settings-page__card-subtitle" : "settings-page__panel-subtitle";
    const bodyClassName =
      layout === "card"
        ? "settings-page__card-body settings-page__panel-body--security"
        : "settings-page__panel-body settings-page__panel-body--security";
    const actionsClassName =
      layout === "card"
        ? "settings-page__card-footer settings-page__card-footer--stacked"
        : "settings-page__panel-actions settings-page__panel-actions--stacked";

    return (
      <div className={containerClassName}>
        <div className={headerClassName}>
          <h3 className={titleClassName}>{layout === "card" ? "Безопасность" : "Смена пароля"}</h3>
          {layout === "card" ? <p className={subtitleClassName}>Смена пароля</p> : null}
        </div>
        <div className={bodyClassName}>
          <label className="settings-page__field">
            <span className="settings-page__field-label">Текущий пароль</span>
            <Input
              className="input--sm"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Введите текущий пароль"
            />
          </label>
          <label className="settings-page__field">
            <span className="settings-page__field-label">Новый пароль</span>
            <Input
              className="input--sm"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Введите новый пароль"
            />
          </label>
          <label className="settings-page__field">
            <span className="settings-page__field-label">Подтверждение пароля</span>
            <Input
              className="input--sm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Повторите новый пароль"
            />
          </label>
        </div>
        <div className={actionsClassName}>
          <Button
            type="button"
            variant={outlineVariant}
            size="md"
            loading={requestPasswordResetMutation.isPending}
            onClick={handlePasswordRecovery}
          >
            Восстановить пароль
          </Button>
          <Button
            type="button"
            variant={actionVariant}
            size="md"
            loading={changePasswordMutation.isPending}
            onClick={handleChangePassword}
          >
            Изменить пароль
          </Button>
          {securityError ? (
            <p className="settings-page__form-message settings-page__form-message--error">{securityError}</p>
          ) : null}
          {securitySuccess ? (
            <p className="settings-page__form-message settings-page__form-message--success">{securitySuccess}</p>
          ) : null}
        </div>
      </div>
    );
  };

  const renderAccountManagementPanel = () => {
    return (
      <div className="settings-page__panel">
        <div className="settings-page__panel-body settings-page__panel-body--account">
          {canLeaveCurrentCompany ? (
            <div className="settings-page__account-panel">
              <p className="settings-page__account-subtitle">Выход из компании</p>
              <p className="settings-page__account-description">
                Рабочий профиль компании будет отвязан от вашего аккаунта
              </p>
              <Button
                type="button"
                variant={outlineVariant}
                size="md"
                disabled={!currentCompanyLeaveTarget || isDeleteStaffItemPending}
                onClick={() => {
                  if (!currentCompanyLeaveTarget) {
                    return;
                  }

                  setPendingDeleteItem({
                    kind: "membership",
                    id: currentCompanyLeaveTarget.membershipId,
                    email: currentCompanyLeaveTarget.email,
                    isCurrentUser: true,
                  });
                }}
              >
                Выйти из компании
              </Button>
            </div>
          ) : null}
          <div className="settings-page__account-panel">
            <p className="settings-page__account-subtitle">Удаление аккаунта</p>
            <p className="settings-page__account-description">Все данные будут удалены безвозвратно</p>
          </div>
        </div>
        <div className="settings-page__panel-actions">
          <Button
            type="button"
            variant="danger"
            size="md"
            className="settings-page__account-delete"
            onClick={() => {
              setDeleteAccountError(null);
              setIsDeleteAccountModalOpen(true);
            }}
          >
            Удалить аккаунт
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
          <div
            className={
              hasOtherSessions
                ? "settings-page__sessions-overview"
                : "settings-page__sessions-overview settings-page__sessions-overview--without-footer"
            }
          >
            <div className="settings-page__session-list">
              {isSessionsLoading
                ? Array.from({ length: 3 }, (_, index) => (
                    <div key={`session-skeleton-${index}`} className="settings-page__session-entry">
                      <SettingsSkeleton className="settings-page__skeleton--dot" />
                      <div className="settings-page__session-details">
                        <SettingsSkeleton className="settings-page__skeleton--session-line" />
                        <SettingsSkeleton className="settings-page__skeleton--session-line settings-page__skeleton--session-line-short" />
                        <SettingsSkeleton className="settings-page__skeleton--session-line settings-page__skeleton--session-line-short" />
                        <SettingsSkeleton className="settings-page__skeleton--session-action" />
                      </div>
                    </div>
                  ))
                : sessionItems.map((session) => (
                    <div key={session.id} className="settings-page__session-entry">
                      <span className="settings-page__session-dot" aria-hidden="true" />
                      <div className="settings-page__session-details">
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
                            revokeSessionMutation.mutate(session.sessionIds);
                          }}
                        >
                          Завершить сессию
                        </Button>
                      </div>
                    </div>
                  ))}
            </div>
            {hasOtherSessions ? (
              <div className="settings-page__sessions-footer">
                <Button
                  type="button"
                  variant={actionVariant}
                  size="md"
                  loading={revokeOtherSessionsMutation.isPending}
                  disabled={isSessionActionPending}
                  onClick={openRevokeOtherSessionsModal}
                >
                  Завершить все другие сессии
                </Button>
              </div>
            ) : null}
          </div>
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
                  <div key={`history-skeleton-${index}`} className="settings-page__history-entry">
                    <SettingsSkeleton className="settings-page__skeleton--dot" />
                    <SettingsSkeleton className="settings-page__skeleton--history-line" />
                    <SettingsSkeleton className="settings-page__skeleton--history-status" />
                  </div>
                ))
              : loginHistoryItems.map((item) => (
                  <div key={item.id} className="settings-page__history-entry">
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

        {hasPendingCompanyInvite && (acceptEmployerStaffInvitationMutation.isPending || staffInviteAcceptError) ? (
          <section className="settings-page__section">
            <h2 className="settings-page__section-title">Приглашение в компанию</h2>
            <div className="settings-page__panel">
              <div className="settings-page__panel-body settings-page__panel-body--staff">
                <div className="settings-page__staff-link-card">
                  <p className="settings-page__staff-link-title">Подключаем рабочий профиль компании</p>
                  <p className="settings-page__staff-link-value">
                    Приглашение применяется автоматически, отдельное подтверждение не требуется.
                  </p>
                  {staffInviteAcceptError ? (
                    <p className="settings-page__form-message settings-page__form-message--error">
                      {staffInviteAcceptError}
                    </p>
                  ) : null}
                  {staffInviteAcceptError && inviteToken ? (
                    <Button
                      type="button"
                      variant={actionVariant}
                      size="md"
                      loading={acceptEmployerStaffInvitationMutation.isPending}
                      onClick={() => {
                        autoAcceptedInviteTokenRef.current = null;
                        acceptEmployerStaffInvitationMutation.mutate(inviteToken);
                      }}
                    >
                      Повторить
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {canViewEmployerStaffSection ? (
          <section className="settings-page__section">
            <h2 className="settings-page__section-title">Доступ для сотрудников</h2>
            <div className="settings-page__panel">
              <div className="settings-page__panel-body settings-page__panel-body--staff">
                <Button
                  type="button"
                  variant={actionVariant}
                  size="md"
                  onClick={() => setIsStaffInviteModalOpen(true)}
                >
                  Пригласить сотрудника
                </Button>
                <div className="settings-page__staff-list">
                  {isEmployerStaffLoading
                    ? Array.from({ length: 2 }, (_, index) => (
                        <article key={`staff-skeleton-${index}`} className="settings-page__staff-card">
                          <div className="settings-page__staff-card-summary">
                            <div className="settings-page__staff-card-title-group">
                              <SettingsSkeleton className="settings-page__skeleton--staff-title" />
                              <SettingsSkeleton className="settings-page__skeleton--staff-subtitle" />
                            </div>
                            <div className="settings-page__staff-actions" aria-hidden="true">
                              <SettingsSkeleton className="settings-page__skeleton--icon-button" />
                              <SettingsSkeleton className="settings-page__skeleton--icon-button" />
                            </div>
                          </div>
                        </article>
                      ))
                    : combinedEmployerStaffItems.length > 0
                      ? combinedEmployerStaffItems.map((member) => {
                        const isExpanded = expandedStaffMemberId === member.id;

                        return (
                          <article
                            key={member.id}
                            className={
                              isExpanded
                                ? "settings-page__staff-card settings-page__staff-card--expanded"
                                : "settings-page__staff-card"
                            }
                          >
                            <div
                              className="settings-page__staff-card-summary"
                              onClick={(event) => {
                                const target = event.target as HTMLElement;
                                if (target.closest(".settings-page__icon-button")) {
                                  return;
                                }

                                setExpandedStaffMemberId((current) => (current === member.id ? null : member.id));
                              }}
                            >
                              <div className="settings-page__staff-card-title-group">
                                <h3 className="settings-page__staff-email">{member.email}</h3>
                                {"kind" in member && member.kind === "invitation" ? (
                                  <p className="settings-page__staff-pending-label">
                                    {resolveStaffInvitationStatusLabel("email")}
                                  </p>
                                ) : null}
                              </div>
                              <div className="settings-page__staff-actions" aria-label={`Действия для ${member.email}`}>
                                <button
                                  type="button"
                                  className="settings-page__icon-button"
                                  aria-label={`Редактировать ${member.email}`}
                                  disabled={member.is_primary || member.is_current_user}
                                >
                                  <img src={editIcon} alt="" aria-hidden="true" className="settings-page__icon" />
                                </button>
                                <button
                                  type="button"
                                  className="settings-page__icon-button"
                                  aria-label={member.is_current_user ? `Покинуть компанию ${member.email}` : `Удалить ${member.email}`}
                                  disabled={
                                    member.is_primary ||
                                    member.is_current_user ||
                                    deleteEmployerStaffMembershipMutation.isPending ||
                                    ("kind" in member &&
                                      member.kind === "invitation" &&
                                      (!isPrimaryEmployerManager || deleteEmployerStaffInvitationMutation.isPending))
                                  }
                                  onClick={() => {
                                    if ("kind" in member && member.kind === "invitation") {
                                      setPendingDeleteItem({
                                        kind: "invitation",
                                        id: member.id.replace("invitation-", ""),
                                        email: member.email,
                                      });
                                      return;
                                    }

                                    setPendingDeleteItem({
                                      kind: "membership",
                                      id: member.id,
                                      email: member.email,
                                      isCurrentUser: member.is_current_user,
                                    });
                                  }}
                                >
                                  <img src={deleteIcon} alt="" aria-hidden="true" className="settings-page__icon" />
                                </button>
                              </div>
                            </div>
                            <div
                              className={
                                isExpanded
                                  ? "settings-page__staff-card-details-shell settings-page__staff-card-details-shell--expanded"
                                  : "settings-page__staff-card-details-shell"
                              }
                              aria-hidden={!isExpanded}
                            >
                              <div className="settings-page__staff-card-details">
                                <div className="settings-page__staff-card-body">
                                  <p className="settings-page__staff-role">Роль: {member.roleLabel}</p>
                                  <ul className="settings-page__staff-permission-list">
                                    {member.permissions.map((permission) => (
                                      <li key={`${member.id}-${permission}`} className="settings-page__staff-permission-option">
                                        {permission}
                                      </li>
                                    ))}
                                  </ul>
                                  {"kind" in member && member.kind === "invitation" ? (
                                    <p className="settings-page__staff-date">Действует до: {member.expiresAtLabel}</p>
                                  ) : (
                                    <p className="settings-page__staff-date">Добавлен: {member.invitedAtLabel}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })
                      : (
                        <div className="settings-page__staff-empty">
                          Пока в компании числится только основной аккаунт работодателя или сотрудники еще не добавлены.
                        </div>
                      )}
                </div>
                {isEmployerStaffInvitationsLoading || linkOnlyInvitationItems.length > 0 ? (
                  <div className="settings-page__staff-invitations">
                    <h3 className="settings-page__staff-subtitle">Активные ссылки приглашений</h3>
                    {isEmployerStaffInvitationsLoading ? (
                      <SettingsSkeleton className="settings-page__skeleton--session-line" />
                    ) : (
                      <div className="settings-page__staff-invitation-list">
                        {linkOnlyInvitationItems.map((item) => (
                          <article
                            key={item.id}
                            className={
                              expandedInvitationId === item.id
                                ? "settings-page__staff-card settings-page__staff-card--expanded"
                                : "settings-page__staff-card"
                            }
                          >
                            <div
                              className="settings-page__staff-card-summary"
                              onClick={(event) => {
                                const target = event.target as HTMLElement;
                                if (target.closest(".settings-page__icon-button") || target.closest(".settings-page__copy-link")) {
                                  return;
                                }

                                setExpandedInvitationId((current) => (current === item.id ? null : item.id));
                              }}
                              >
                                <div className="settings-page__staff-card-title-group">
                                  <h3 className="settings-page__staff-email">Неизвестный пользователь</h3>
                                  <p className="settings-page__staff-pending-label">
                                    {resolveStaffInvitationStatusLabel("link")}
                                  </p>
                              </div>
                              <div className="settings-page__staff-actions" aria-label="Действия для ссылки приглашения">
                                <button
                                  type="button"
                                  className="settings-page__icon-button"
                                  aria-label="Удалить ссылку приглашения"
                                  disabled={!isPrimaryEmployerManager || deleteEmployerStaffInvitationMutation.isPending}
                                  onClick={() => {
                                    setPendingDeleteItem({
                                      kind: "invitation",
                                      id: item.id,
                                      email: "Неизвестный пользователь",
                                    });
                                  }}
                                >
                                  <img src={deleteIcon} alt="" aria-hidden="true" className="settings-page__icon" />
                                </button>
                              </div>
                            </div>
                            <div
                              className={
                                expandedInvitationId === item.id
                                  ? "settings-page__staff-card-details-shell settings-page__staff-card-details-shell--expanded"
                                  : "settings-page__staff-card-details-shell"
                              }
                              aria-hidden={expandedInvitationId !== item.id}
                            >
                                <div className="settings-page__staff-card-details">
                                  <div className="settings-page__staff-card-body">
                                    <p className="settings-page__staff-role">Роль: {item.roleLabel}</p>
                                    <ul className="settings-page__staff-permission-list">
                                      {(item.permissions ?? []).map((permission) => (
                                        <li key={`${item.id}-${permission}`} className="settings-page__staff-permission-option">
                                          {permission}
                                        </li>
                                      ))}
                                    </ul>
                                    {item.invitation_url ? (
                                      <button
                                        type="button"
                                        className="settings-page__copy-link"
                                        onClick={() => {
                                          void navigator.clipboard.writeText(item.invitation_url || "");
                                        }}
                                      >
                                        Скопировать ссылку
                                      </button>
                                    ) : null}
                                    <p className="settings-page__staff-date">Создано: {item.invitedAtLabel}</p>
                                  </div>
                                </div>
                              </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <Modal
              title="Приглашение сотрудника"
              isOpen={isStaffInviteModalOpen}
              onClose={() => {
                setIsStaffInviteModalOpen(false);
                setInviteError(null);
                setLatestInvitationUrl(null);
              }}
              panelClassName="settings-page__staff-modal-panel"
              titleAccentColor={
                pendingDeleteItem?.kind === "membership" && !pendingDeleteItem.isCurrentUser
                  ? "var(--color-danger)"
                  : modalTitleAccentColor
              }
            >
              <div className="modal__body settings-page__staff-modal">
                <label className="modal__field settings-page__field">
                  <span className="modal__field-label settings-page__field-label">Почта сотрудника</span>
                  <Input
                    className="input--sm"
                    value={inviteEmail}
                    error={resolvedInviteEmailError ?? undefined}
                    onChange={(event) => {
                      setInviteEmail(event.target.value);
                      setInviteError(null);
                      setInviteEmailServerError(null);
                    }}
                    placeholder="Введите email или оставьте пустым"
                  />
                </label>
                <div className="modal__section settings-page__staff-permissions">
                  <p className="modal__section-title settings-page__staff-subtitle">Доступы сотрудника</p>
                  <label className="modal__option settings-page__preference-option">
                    <Checkbox
                      checked={invitePermissions.canReviewResponses}
                      variant={checkboxVariant}
                      onChange={(event) =>
                        setInvitePermissions((current) => ({
                          ...current,
                          canReviewResponses: event.target.checked,
                        }))
                      }
                    />
                    <span className="settings-page__preference-label">Просмотр откликов</span>
                  </label>
                  <label className="modal__option settings-page__preference-option">
                    <Checkbox
                      checked={invitePermissions.canManageOpportunities}
                      variant={checkboxVariant}
                      onChange={(event) =>
                        setInvitePermissions((current) => ({
                          ...current,
                          canManageOpportunities: event.target.checked,
                        }))
                      }
                    />
                    <span className="settings-page__preference-label">Управление возможностями</span>
                  </label>
                  <label className="modal__option settings-page__preference-option">
                    <Checkbox
                      checked={invitePermissions.canManageCompanyProfile}
                      variant={checkboxVariant}
                      onChange={(event) =>
                        setInvitePermissions((current) => ({
                          ...current,
                          canManageCompanyProfile: event.target.checked,
                        }))
                      }
                    />
                    <span className="settings-page__preference-label">Управление профилем компании</span>
                  </label>
                  <label className="modal__option settings-page__preference-option">
                    <Checkbox
                      checked={invitePermissions.canManageStaff}
                      variant={checkboxVariant}
                      onChange={(event) =>
                        setInvitePermissions((current) => ({
                          ...current,
                          canManageStaff: event.target.checked,
                        }))
                      }
                    />
                    <span className="settings-page__preference-label">Управление сотрудниками</span>
                  </label>
                  <label className="modal__option settings-page__preference-option">
                    <Checkbox
                      checked={invitePermissions.canAccessChat}
                      variant={checkboxVariant}
                      onChange={(event) =>
                        setInvitePermissions((current) => ({
                          ...current,
                          canAccessChat: event.target.checked,
                        }))
                      }
                    />
                    <span className="settings-page__preference-label">Общение в чате</span>
                  </label>
                </div>
                {inviteError ? (
                  <p className="modal__error settings-page__form-message settings-page__form-message--error">{inviteError}</p>
                ) : null}
                {!trimmedInviteEmail && latestInvitationUrl ? (
                  <label className="modal__field settings-page__field">
                    <span className="modal__field-label settings-page__field-label">Ссылка приглашения</span>
                    <span className="settings-page__invite-link-shell">
                      <input
                        className="input input--sm settings-page__invite-link-input"
                        value={latestInvitationUrl}
                        readOnly
                      />
                      <span className="settings-page__invite-link-actions">
                        <button
                          type="button"
                          className="settings-page__invite-link-button"
                          aria-label={isInviteLinkCopied ? "Скопировано" : "Копировать ссылку"}
                          onClick={() => {
                            void navigator.clipboard.writeText(latestInvitationUrl).then(() => {
                              setIsInviteLinkCopied(true);
                            });
                          }}
                        >
                          <img
                            src={isInviteLinkCopied ? copiedIcon : copyIcon}
                            alt=""
                            aria-hidden="true"
                            className={
                              isInviteLinkCopied
                                ? "settings-page__invite-link-icon settings-page__invite-link-icon--copied"
                                : "settings-page__invite-link-icon"
                            }
                          />
                        </button>
                      </span>
                    </span>
                  </label>
                ) : null}
                <div className="modal__actions settings-page__staff-invite-actions">
                  <Button
                    type="button"
                    variant={isInviteLinkMode ? outlineVariant : "cancel"}
                    size="md"
                    onClick={() => setIsStaffInviteModalOpen(false)}
                  >
                    {isInviteLinkMode ? "Закрыть" : "Отменить"}
                  </Button>
                  <Button
                    type="button"
                    variant={actionVariant}
                    size="md"
                    loading={createEmployerStaffInvitationMutation.isPending}
                    disabled={invitePermissionKeys.length === 0 || Boolean(resolvedInviteEmailError)}
                    onClick={handleCreateStaffInvitation}
                  >
                    {trimmedInviteEmail ? "Отправить" : "Сгенерировать ссылку"}
                  </Button>
                </div>
              </div>
            </Modal>
            <Modal
              title={
                pendingDeleteItem?.kind === "membership"
                  ? pendingDeleteItem.isCurrentUser
                    ? "Выйти из компании"
                    : "Удалить сотрудника"
                  : "Удалить приглашение"
              }
              isOpen={pendingDeleteItem !== null}
              onClose={() => {
                if (isDeleteStaffItemPending) {
                  return;
                }

                setPendingDeleteItem(null);
              }}
              size="small"
              panelClassName="settings-page__staff-modal-panel"
              titleAccentColor={
                pendingDeleteItem?.kind === "membership" && pendingDeleteItem.isCurrentUser
                  ? modalTitleAccentColor
                  : "var(--color-danger)"
              }
            >
              <div className="modal__body settings-page__staff-modal">
                <p className="modal__text settings-page__staff-delete-message">
                  {pendingDeleteItem?.kind === "membership"
                    ? pendingDeleteItem.isCurrentUser
                      ? `Вы уверены, что хотите отвязать рабочий профиль «${pendingDeleteItem.email}» от компании?`
                      : `Вы уверены, что хотите удалить сотрудника «${pendingDeleteItem.email}» из компании?`
                    : `Вы уверены, что хотите удалить приглашение для «${pendingDeleteItem?.email}»?`}
                </p>
                <div className="modal__actions settings-page__staff-invite-actions">
                  <Button
                    type="button"
                    variant={
                      pendingDeleteItem?.kind === "membership" && pendingDeleteItem.isCurrentUser
                        ? outlineVariant
                        : "cancel"
                    }
                    size="md"
                    disabled={isDeleteStaffItemPending}
                    onClick={() => setPendingDeleteItem(null)}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    variant={
                      pendingDeleteItem?.kind === "membership" && pendingDeleteItem.isCurrentUser
                        ? actionVariant
                        : "danger"
                    }
                    size="md"
                    loading={isDeleteStaffItemPending}
                    onClick={handleConfirmDeleteStaffItem}
                  >
                    {pendingDeleteItem?.kind === "membership" && pendingDeleteItem.isCurrentUser
                      ? "Выйти"
                      : "Удалить"}
                  </Button>
                </div>
              </div>
            </Modal>
          </section>
        ) : null}

        <section className="settings-page__section">
          {isApplicant ? (
            <>
              <div className="settings-page__split-headings">
                <h2 className="settings-page__section-title">Настройки приватности</h2>
                <h2 className="settings-page__section-title">Уведомления</h2>
              </div>
              <div className="settings-page__notification-preferences settings-page__notification-preferences--applicant">
              <div className="settings-page__panel settings-page__panel--notification settings-page__panel--notification-wide">
                <div className="settings-page__panel-body settings-page__panel-body--notification">
                  <div className="settings-page__group">
                    <h4 className="settings-page__group-title">Видимость профиля</h4>
                    <div className="settings-page__radio-list">
                      <label className="settings-page__radio-option">
                        <Radio
                          checked={profileVisibility === "public"}
                          onChange={() => setProfileVisibility("public")}
                          variant="secondary"
                          name="applicant-privacy-visibility"
                        />
                        <span className="settings-page__preference-label">Видят все</span>
                      </label>
                      <label className="settings-page__radio-option">
                        <Radio
                          checked={profileVisibility === "authorized"}
                          onChange={() => setProfileVisibility("authorized")}
                          variant="secondary"
                          name="applicant-privacy-visibility"
                        />
                        <span className="settings-page__preference-label">Видят авторизованные пользователи</span>
                      </label>
                      <label className="settings-page__radio-option">
                        <Radio
                          checked={profileVisibility === "hidden"}
                          onChange={() => setProfileVisibility("hidden")}
                          variant="secondary"
                          name="applicant-privacy-visibility"
                        />
                        <span className="settings-page__preference-label">Полностью скрыт</span>
                      </label>
                    </div>
                  </div>
                  <div className="settings-page__group">
                    <h4 className="settings-page__group-title">Видимость резюме</h4>
                    <label className="settings-page__preference-option">
                      <Checkbox
                        variant={checkboxVariant}
                        checked={isResumeVisible}
                        onChange={() => setIsResumeVisible((current) => !current)}
                      />
                      <span className="settings-page__preference-label">Показывать резюме другим пользователям</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="settings-page__panel settings-page__panel--notification">
                <div className="settings-page__panel-body settings-page__panel-body--notification">
                  <div className="settings-page__group">
                    <h4 className="settings-page__group-title">E-mail уведомления</h4>
                    <div className="settings-page__preference-list">
                      {renderNotificationItems(visibleEmailNotifications, toggleEmailNotification, "email")}
                    </div>
                  </div>
                  <div className="settings-page__group">
                    <h4 className="settings-page__group-title">Push-уведомления</h4>
                    <div className="settings-page__preference-list">
                      {renderNotificationItems(visiblePushNotifications, togglePushNotification, "push")}
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </>
          ) : (
            <>
              <h2 className="settings-page__section-title">Уведомления</h2>
              <div className="settings-page__notification-preferences">
                <div className="settings-page__panel settings-page__panel--notification">
                  <div className="settings-page__panel-header">
                    <h3 className="settings-page__panel-title">E-mail уведомления</h3>
                  </div>
                  <div className="settings-page__panel-body settings-page__panel-body--notification">
                    <div className="settings-page__preference-list">
                      {renderNotificationItems(visibleEmailNotifications, toggleEmailNotification, "email")}
                    </div>
                  </div>
                </div>
                <div className="settings-page__panel settings-page__panel--notification">
                  <div className="settings-page__panel-header">
                    <h3 className="settings-page__panel-title">Push-уведомления</h3>
                  </div>
                  <div className="settings-page__panel-body settings-page__panel-body--notification">
                    <div className="settings-page__preference-list">
                      {renderNotificationItems(visiblePushNotifications, togglePushNotification, "push")}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="settings-page__section-actions">
            <Button
              type="button"
              variant={actionVariant}
              size="md"
              loading={updateNotificationPreferencesMutation.isPending || updateApplicantPrivacyMutation.isPending}
              onClick={() => {
                handleNotificationPreferencesSave();
                if (isApplicant) {
                  handleApplicantPrivacySave();
                }
              }}
            >
              Сохранить настройки
            </Button>
            {notificationPreferencesError ? (
              <p className="settings-page__form-message settings-page__form-message--error">
                {notificationPreferencesError}
              </p>
            ) : null}
            {notificationPreferencesSuccess ? (
              <p className="settings-page__form-message settings-page__form-message--success">
                {notificationPreferencesSuccess}
              </p>
            ) : null}
          </div>
        </section>

        <section className="settings-page__section">
          <h2 className="settings-page__section-title">Безопасность</h2>
          {renderSecurityPanel()}
        </section>

        <div className="settings-page__summary-panels">
          {renderLoginHistoryPanel()}
          {renderSessionsPanel()}
        </div>

        <section className="settings-page__section settings-page__section--account-management">
          <h2 className="settings-page__section-title">Управление аккаунтом</h2>
          {renderAccountManagementPanel()}
        </section>
      </>
    );
  };

  const renderModerationLayout = () => {
    return (
      <div className="settings-page__sections">
        <section className="settings-page__card">
          <div className="settings-page__card-header">
            <h2 className="settings-page__card-title">Профиль</h2>
          </div>
          <div className="settings-page__card-body settings-page__card-body--profile">
            <label className="settings-page__field">
              <span className="settings-page__field-label">ФИО</span>
              <Input
                className="input--sm"
                value={moderationProfileFullName}
                onChange={(event) => {
                  setModerationProfileFullName(event.target.value);
                  setModerationProfileError(null);
                  setModerationProfileSuccess(null);
                }}
                placeholder="Введите ФИО"
              />
            </label>
            <label className="settings-page__field">
              <span className="settings-page__field-label">E-mail</span>
              <Input
                className="input--sm"
                type="email"
                value={moderationProfileEmail}
                onChange={(event) => {
                  setModerationProfileEmail(event.target.value);
                  setModerationProfileError(null);
                  setModerationProfileSuccess(null);
                }}
                placeholder="Введите E-mail"
              />
            </label>
          </div>
          <div className="settings-page__card-footer">
            <Button
              type="button"
              variant={actionVariant}
              size="md"
              loading={updateModerationProfileMutation.isPending}
              onClick={handleModerationProfileSave}
            >
              Сохранить изменения
            </Button>
            {moderationProfileError ? (
              <p className="settings-page__form-message settings-page__form-message--error">
                {moderationProfileError}
              </p>
            ) : null}
            {moderationProfileSuccess ? (
              <p className="settings-page__form-message settings-page__form-message--success">
                {moderationProfileSuccess}
              </p>
            ) : null}
          </div>
        </section>

        {renderSecurityPanel("card")}

        <section className="settings-page__card">
          <div className="settings-page__card-header">
            <h2 className="settings-page__card-title">Уведомления</h2>
          </div>
          <div className="settings-page__card-body settings-page__card-body--notifications">
            <div className="settings-page__group">
              <h3 className="settings-page__group-title">E-mail уведомления</h3>
              <div className="settings-page__preference-list">
                {renderNotificationItems(visibleEmailNotifications, toggleEmailNotification, "moderation-email")}
              </div>
            </div>
            <div className="settings-page__group">
              <h3 className="settings-page__group-title">Push-уведомления</h3>
              <div className="settings-page__preference-list">
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
            {notificationPreferencesError ? (
              <p className="settings-page__form-message settings-page__form-message--error">
                {notificationPreferencesError}
              </p>
            ) : null}
            {notificationPreferencesSuccess ? (
              <p className="settings-page__form-message settings-page__form-message--success">
                {notificationPreferencesSuccess}
              </p>
            ) : null}
          </div>
        </section>

        <section className="settings-page__card">
          <div className="settings-page__card-header">
            <h2 className="settings-page__card-title">Активные сессии</h2>
          </div>
          <div className="settings-page__card-body settings-page__card-body--sessions">
            <div
              className={
                hasOtherSessions
                  ? "settings-page__sessions-overview"
                  : "settings-page__sessions-overview settings-page__sessions-overview--without-footer"
              }
            >
              <div className="settings-page__session-list">
                {isSessionsLoading
                  ? Array.from({ length: 3 }, (_, index) => (
                      <div key={`session-skeleton-${index}`} className="settings-page__session-entry">
                        <SettingsSkeleton className="settings-page__skeleton--dot" />
                        <div className="settings-page__session-details">
                          <SettingsSkeleton className="settings-page__skeleton--session-line" />
                          <SettingsSkeleton className="settings-page__skeleton--session-line settings-page__skeleton--session-line-short" />
                          <SettingsSkeleton className="settings-page__skeleton--session-line settings-page__skeleton--session-line-short" />
                          <SettingsSkeleton className="settings-page__skeleton--session-action" />
                        </div>
                      </div>
                    ))
                  : sessionItems.map((session) => (
                      <div key={session.id} className="settings-page__session-entry">
                        <span className="settings-page__session-dot" aria-hidden="true" />
                        <div className="settings-page__session-details">
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
                              revokeSessionMutation.mutate(session.sessionIds);
                            }}
                          >
                            Завершить сессию
                          </Button>
                        </div>
                      </div>
                    ))}
              </div>
              {hasOtherSessions ? (
                <div className="settings-page__sessions-footer">
                  <Button
                    type="button"
                    variant={actionVariant}
                    size="md"
                    loading={revokeOtherSessionsMutation.isPending}
                    disabled={isSessionActionPending}
                    onClick={openRevokeOtherSessionsModal}
                  >
                    Завершить все другие сессии
                  </Button>
                </div>
              ) : null}
            </div>
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
                  <div key={`review-skeleton-${index}`} className="settings-page__review-option">
                    <SettingsSkeleton className="settings-page__skeleton--review-label" />
                    <SettingsSkeleton className="settings-page__skeleton--review-input" />
                    <SettingsSkeleton className="settings-page__skeleton--review-suffix" />
                  </div>
                ))
              : (
                <>
                  <div className="settings-page__review-option">
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
                  <div className="settings-page__review-option">
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
                  <div className="settings-page__review-option">
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
                  <div className="settings-page__review-option">
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
                    <div key={`history-skeleton-${index}`} className="settings-page__history-entry">
                      <SettingsSkeleton className="settings-page__skeleton--dot" />
                      <SettingsSkeleton className="settings-page__skeleton--history-line" />
                      <SettingsSkeleton className="settings-page__skeleton--history-status" />
                    </div>
                  ))
                : loginHistoryItems.map((item) => (
                    <div key={item.id} className="settings-page__history-entry">
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
      <Header
        containerClassName="home-page__shell"
        profileMenuItems={profileMenuItems}
        theme={isModerationRole ? "curator" : role === "employer" ? "employer" : "applicant"}
        city={isCityReady ? displayCity : undefined}
        onCityChange={isCityReady ? handleCityChange : undefined}
        topNavigation={isModerationRole ? null : undefined}
        notificationOnRealtimeMessage={() => {
          if (!canViewEmployerStaffSection) {
            return;
          }

          void queryClient.invalidateQueries({ queryKey: ["companies", "staff"] });
          void queryClient.invalidateQueries({ queryKey: ["companies", "staff", "invitations"] });
        }}
        bottomContent={
          isModerationRole ? (
            <CuratorHeaderNavigation isAdmin={role === "admin"} currentPage="settings" />
          ) : undefined
        }
      />

      <Container className="settings-page__shell">
        {isModerationRole ? (
          <div className="settings-page__header">
            <h1 className="settings-page__title">Настройки</h1>
          </div>
        ) : null}

        {isModerationRole ? renderModerationLayout() : renderPublicLayout()}
      </Container>

      <DeleteAccountModal
        isOpen={isDeleteAccountModalOpen}
        onClose={closeDeleteAccountModal}
        onConfirm={handleDeleteAccount}
        variant={isEmployerDeleteFlow ? "employer" : "applicant"}
        displayName={user?.display_name}
        hasManagedEmployees={isDeletingEmployerWithCascade}
        isPending={deleteCurrentUserMutation.isPending}
        error={deleteAccountError}
      />

      <Modal
        title="Завершить другие сессии"
        isOpen={isRevokeOtherSessionsModalOpen}
        onClose={closeRevokeOtherSessionsModal}
        size="small"
        titleAccentColor={modalTitleAccentColor}
      >
        <div className="modal__body">
          <p className="modal__text">
            Будут завершены все активные сессии, кроме текущей на этом устройстве.
          </p>
          <div className="modal__actions">
            <Button
              type="button"
              variant="cancel"
              size="md"
              onClick={closeRevokeOtherSessionsModal}
              disabled={revokeOtherSessionsMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant={actionVariant}
              size="md"
              onClick={handleConfirmRevokeOtherSessions}
              loading={revokeOtherSessionsMutation.isPending}
              disabled={revokeOtherSessionsMutation.isPending}
            >
              Завершить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title="Несохраненные изменения"
        isOpen={isLeaveConfirmModalOpen}
        onClose={handleCloseLeaveConfirmModal}
        size="small"
        titleAccentColor={modalTitleAccentColor}
        closeOnBackdrop={false}
      >
        <div className="modal__body">
          <p className="modal__text">
            Если перейти на другую страницу сейчас, все несохранённые данные сотрутся.
          </p>
          {leaveConfirmError ? (
            <p className="modal__error settings-page__form-message settings-page__form-message--error">
              {leaveConfirmError}
            </p>
          ) : null}
          <div className="modal__actions">
            <Button
              type="button"
              variant="cancel"
              size="md"
              onClick={handleCloseLeaveConfirmModal}
              disabled={isLeaveSavePending}
            >
              Отменить
            </Button>
            <Button
              type="button"
              variant={actionVariant}
              size="md"
              onClick={() => void handleSaveAndLeave()}
              loading={isLeaveSavePending}
              disabled={isLeaveSavePending}
            >
              Сохранить и выйти
            </Button>
          </div>
        </div>
      </Modal>

      <Footer theme={themeRole} />
    </main>
  );
}
