import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import adminAvatarIcon from "../../assets/icons/admin.png";
import applicantAvatarIcon from "../../assets/icons/applicant.png";
import employerAvatarIcon from "../../assets/icons/employer.png";
import profileDropdownIcon from "../../assets/icons/profile.png";
import profileIcon from "../../assets/icons/profile.svg";
import {
  listAccountContextsRequest,
  meRequest,
  switchAccountContextRequest,
  useAuthStore,
} from "../../features/auth";
import { abbreviateLegalEntityName } from "../../shared/lib/legal-entity";

export type HeaderProfileMenuItem = {
  label: string;
  isDanger?: boolean;
  onClick?: () => void;
};

type HeaderProfileMenuProps = {
  items: HeaderProfileMenuItem[];
};

function resolveAccountContextAvatar(role: string | undefined) {
  if (role === "employer") {
    return employerAvatarIcon;
  }

  if (role === "applicant") {
    return applicantAvatarIcon;
  }

  if (role === "admin") {
    return adminAvatarIcon;
  }

  return profileDropdownIcon;
}

function resolveAccountContextSubtitle(
  role: string | undefined,
  companyName?: string | null,
  contextLabel?: string,
) {
  if (role === "employer") {
    const source = companyName?.trim() || contextLabel?.trim();
    return source ? abbreviateLegalEntityName(source) : "профиль работодателя";
  }

  if (role === "applicant") {
    return "Профиль соискателя";
  }

  if (role === "curator" || role === "junior") {
    return "Профиль куратора";
  }

  if (role === "admin") {
    return "профиль администратора";
  }

  return "профиль пользователя";
}

export function HeaderProfileMenu({ items }: HeaderProfileMenuProps) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuCloseTimeoutRef = useRef<number | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProfileMenuPinned, setIsProfileMenuPinned] = useState(false);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated,
    retry: false,
  });

  const accountContextsQuery = useQuery({
    queryKey: ["auth", "contexts"],
    queryFn: listAccountContextsRequest,
    staleTime: 30 * 1000,
    enabled: isAuthenticated,
  });

  const accountContextItems = useMemo(() => {
    const currentItems = accountContextsQuery.data?.data?.items ?? [];

    return currentItems.filter((item) => {
      if (!(item.is_default && item.role === "employer")) {
        return true;
      }

      return !currentItems.some((candidate) => candidate.role === "employer" && !candidate.is_default);
    });
  }, [accountContextsQuery.data?.data?.items]);

  const hasAccountContextCards = accountContextItems.length > 0;
  const hasMultipleAccountContexts = accountContextItems.length > 1;

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

  const switchAccountContextMutation = useMutation({
    mutationFn: switchAccountContextRequest,
    onSuccess: async (response) => {
      const nextAccessToken = response?.data?.access_token;
      const nextExpiresIn = response?.data?.expires_in;
      const currentRefreshToken = useAuthStore.getState().refreshToken;
      const nextRole = (response?.data?.active_context?.role ?? response?.data?.user?.role ?? "applicant") as
        | "applicant"
        | "employer"
        | "junior"
        | "curator"
        | "admin";

      if (nextAccessToken && nextExpiresIn && currentRefreshToken) {
        useAuthStore.getState().setSession(nextAccessToken, currentRefreshToken, nextRole, nextExpiresIn);
      }

      setIsProfileMenuPinned(false);
      setIsProfileMenuOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["auth", "contexts"] }),
        queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
        queryClient.invalidateQueries({ queryKey: ["users", "me", "notification-preferences"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["companies", "staff"] }),
        queryClient.invalidateQueries({ queryKey: ["companies", "staff", "invitations"] }),
      ]);
    },
  });

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

  useEffect(
    () => () => {
      if (profileMenuCloseTimeoutRef.current !== null) {
        window.clearTimeout(profileMenuCloseTimeoutRef.current);
      }
    },
    [],
  );

  if (!isAuthenticated) {
    return null;
  }

  const user = meQuery.data?.data?.user;

  return (
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
        <img src={profileIcon} alt="" aria-hidden="true" className="header__icon-button-image" />
      </button>

      <div
        className={
          isProfileMenuOpen
            ? hasMultipleAccountContexts
              ? "header__profile-dropdown header__profile-dropdown--with-contexts"
              : "header__profile-dropdown"
            : hasMultipleAccountContexts
              ? "header__profile-dropdown header__profile-dropdown--with-contexts header__profile-dropdown--hidden"
              : "header__profile-dropdown header__profile-dropdown--hidden"
        }
        role="menu"
        aria-hidden={!isProfileMenuOpen}
      >
        {hasAccountContextCards ? (
          <div
            className={
              hasMultipleAccountContexts
                ? "header__profile-contexts"
                : "header__profile-contexts header__profile-contexts--single"
            }
          >
            {hasMultipleAccountContexts ? (
              <p className="header__profile-contexts-title">
                <span className="header__profile-contexts-title-text">Выбор </span>
                <span className="header__profile-contexts-title-accent">аккаунта</span>
              </p>
            ) : null}
            <div className="header__profile-contexts-list">
              {accountContextItems.map((item) => {
                const isActive = Boolean(item.is_active);

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      hasMultipleAccountContexts
                        ? isActive
                          ? item.role === "applicant"
                            ? "header__profile-context-card header__profile-context-card--active header__profile-context-card--active-applicant"
                            : "header__profile-context-card header__profile-context-card--active header__profile-context-card--active-employer"
                          : "header__profile-context-card"
                        : "header__profile-context-card header__profile-context-card--static"
                    }
                    disabled={!hasMultipleAccountContexts || isActive || switchAccountContextMutation.isPending}
                    onClick={() => {
                      if (!hasMultipleAccountContexts || isActive) {
                        return;
                      }

                      switchAccountContextMutation.mutate(item.id);
                    }}
                  >
                    <span className="header__profile-context-avatar">
                      <img
                        src={resolveAccountContextAvatar(item.role)}
                        alt=""
                        aria-hidden="true"
                        className="header__profile-context-avatar-image"
                      />
                    </span>
                    <span className="header__profile-context-copy">
                      <span className="header__profile-context-name">
                        {user?.display_name ?? item.label ?? "Профиль"}
                      </span>
                      <span className="header__profile-context-role">
                        {resolveAccountContextSubtitle(item.role, item.company_name, item.label)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={
              item.isDanger
                ? "header__profile-dropdown-item header__profile-dropdown-item--danger"
                : "header__profile-dropdown-item"
            }
            role="menuitem"
            onClick={() => {
              item.onClick?.();
              setIsProfileMenuPinned(false);
              setIsProfileMenuOpen(false);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
