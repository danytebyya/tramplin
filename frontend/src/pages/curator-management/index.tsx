import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Navigate, useNavigate } from "react-router-dom";

import arrowIcon from "../../assets/icons/arrow.svg";
import deleteIcon from "../../assets/icons/delete.svg";
import editIcon from "../../assets/icons/edit.svg";
import profileIcon from "../../assets/icons/profile.svg";
import { meRequest, performLogout, useAuthStore } from "../../features/auth";
import {
  createCuratorRequest,
  CuratorManagementResponse,
  listCuratorsRequest,
} from "../../features/moderation";
import { NotificationMenu } from "../../features/notifications";
import { Button, Checkbox, Container, Input, Modal, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import "../../widgets/header/header.css";
import "./curator-management.css";

type CuratorRole = "curator" | "admin" | "junior";
type CuratorPresence = "online" | "offline";
type CuratorSortField = "alphabet" | "activity";
type CuratorSortDirection = "asc" | "desc";

const PAGE_SIZE = 5;

const roleOptions: Array<{ value: CuratorRole; label: string }> = [
  { value: "admin", label: "Senior" },
  { value: "curator", label: "Middle" },
  { value: "junior", label: "Junior" },
];

const statusOptions: Array<{ value: CuratorPresence; label: string }> = [
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
];

const sortFieldOptions: Array<{ value: CuratorSortField; label: string }> = [
  { value: "alphabet", label: "По алфавиту" },
  { value: "activity", label: "По активности" },
];

const curatorMetricDefinitions = [
  { key: "totalCurators", label: "Всего кураторов:" },
  { key: "onlineCurators", label: "Онлайн:" },
  { key: "queuedRequests", label: "В очереди заявок:" },
  { key: "reviewedToday", label: "Сегодня проверено:" },
] as const;

function generateCuratorPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const targetLength = 10;

  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(targetLength);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  return Array.from(
    { length: targetLength },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [1, currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages] as const;
}

function resolveRoleMeta(role: CuratorRole) {
  if (role === "admin") {
    return { label: "Senior", variant: "rejected" as const };
  }

  if (role === "junior") {
    return { label: "Junior", variant: "approved" as const };
  }

  return { label: "Middle", variant: "pending-review" as const };
}

function formatActivityMeta(value: string | null) {
  if (!value) {
    return {
      minutes: Number.POSITIVE_INFINITY,
      label: "Нет активности",
    };
  }

  const diffMs = Math.max(Date.now() - new Date(value).getTime(), 0);
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes <= 1) {
    return { minutes: 0, label: "Сейчас" };
  }

  if (diffMinutes < 60) {
    return { minutes: diffMinutes, label: `${diffMinutes} мин назад` };
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return { minutes: diffMinutes, label: `${diffHours} ч назад` };
  }

  const diffDays = Math.round(diffHours / 24);
  return { minutes: diffMinutes, label: `${diffDays} дн назад` };
}

function CuratorManagementRowSkeleton() {
  return (
    <article className="curator-management-page__row curator-management-page__row--skeleton" aria-hidden="true">
      <div className="curator-management-page__row-summary">
        <div className="curator-management-page__row-leading">
          <span className="curator-management-page__skeleton curator-management-page__skeleton--checkbox" />
        </div>
        <div className="curator-management-page__row-main">
          <span className="curator-management-page__skeleton curator-management-page__skeleton--title" />
          <span className="curator-management-page__skeleton curator-management-page__skeleton--cell" />
          <span className="curator-management-page__skeleton curator-management-page__skeleton--badge" />
          <span className="curator-management-page__skeleton curator-management-page__skeleton--cell" />
          <span className="curator-management-page__skeleton curator-management-page__skeleton--cell" />
          <span className="curator-management-page__skeleton curator-management-page__skeleton--cell" />
          <span className="curator-management-page__skeleton curator-management-page__skeleton--actions" />
        </div>
      </div>
    </article>
  );
}

export function CuratorManagementPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isAdmin = role === "admin";
  const isModerationRole = role === "junior" || role === "curator" || role === "admin";
  const themeRole = isAdmin ? "admin" : "curator";
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const sortingRef = useRef<HTMLDivElement | null>(null);
  const profileMenuCloseTimeoutRef = useRef<number | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProfileMenuPinned, setIsProfileMenuPinned] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Array<CuratorRole | "all">>(["all"]);
  const [appliedRoles, setAppliedRoles] = useState<Array<CuratorRole | "all">>(["all"]);
  const [selectedStatuses, setSelectedStatuses] = useState<Array<CuratorPresence | "all">>(["all"]);
  const [appliedStatuses, setAppliedStatuses] = useState<Array<CuratorPresence | "all">>(["all"]);
  const [selectedSortField, setSelectedSortField] = useState<CuratorSortField>("alphabet");
  const [appliedSortField, setAppliedSortField] = useState<CuratorSortField>("alphabet");
  const [selectedSortDirection, setSelectedSortDirection] = useState<CuratorSortDirection>("asc");
  const [appliedSortDirection, setAppliedSortDirection] = useState<CuratorSortDirection>("asc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreateCuratorModalOpen, setIsCreateCuratorModalOpen] = useState(false);
  const [newCuratorName, setNewCuratorName] = useState("");
  const [newCuratorEmail, setNewCuratorEmail] = useState("");
  const [newCuratorPassword, setNewCuratorPassword] = useState("");
  const [newCuratorRole, setNewCuratorRole] = useState<"admin" | "curator" | "junior">("curator");
  const [createCuratorError, setCreateCuratorError] = useState<string | null>(null);

  useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const curatorsQuery = useQuery<CuratorManagementResponse>({
    queryKey: ["moderation", "curators"],
    queryFn: listCuratorsRequest,
    enabled: isAuthenticated && isModerationRole,
    staleTime: 30 * 1000,
  });
  const createCuratorMutation = useMutation({
    mutationFn: createCuratorRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["moderation", "curators"],
      });
      setCreateCuratorError(null);
      setNewCuratorName("");
      setNewCuratorEmail("");
      setNewCuratorPassword(generateCuratorPassword());
      setNewCuratorRole("curator");
      setIsCreateCuratorModalOpen(false);
    },
    onError: (error: any) => {
      setCreateCuratorError(
        error?.response?.data?.error?.message ?? "Не удалось добавить куратора. Попробуйте ещё раз.",
      );
    },
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const normalizedSearch = search.trim();
    if (normalizedSearch === appliedSearch) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAppliedSearch(normalizedSearch);
      setSelectedIds([]);
      setPage(1);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [appliedSearch, search]);

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

  useEffect(() => {
    if (!isFilterOpen && !isSortOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (isFilterOpen && !filtersRef.current?.contains(target)) {
        setIsFilterOpen(false);
      }

      if (isSortOpen && !sortingRef.current?.contains(target)) {
        setIsSortOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFilterOpen(false);
        setIsSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isFilterOpen, isSortOpen]);

  useEffect(
    () => () => {
      if (profileMenuCloseTimeoutRef.current !== null) {
        window.clearTimeout(profileMenuCloseTimeoutRef.current);
      }
    },
    [],
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = appliedSearch.trim().toLowerCase();
    const items = curatorsQuery.data?.data?.items ?? [];

    return items.filter((item) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        item.full_name.toLowerCase().includes(normalizedSearch) ||
        item.email.toLowerCase().includes(normalizedSearch);
      const matchesRole = appliedRoles.includes("all") || appliedRoles.includes(item.role);
      const matchesStatus = appliedStatuses.includes("all") || appliedStatuses.includes(item.status);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [appliedRoles, appliedSearch, appliedStatuses, curatorsQuery.data]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((left, right) => {
      let comparison = 0;

      if (appliedSortField === "activity") {
        comparison = formatActivityMeta(left.last_activity_at).minutes - formatActivityMeta(right.last_activity_at).minutes;
      } else {
        comparison = left.full_name.localeCompare(right.full_name, "ru");
      }

      return appliedSortDirection === "asc" ? comparison : -comparison;
    });
  }, [appliedSortDirection, appliedSortField, filteredItems]);

  const totalPages = Math.max(Math.ceil(sortedItems.length / PAGE_SIZE), 1);
  const safePage = Math.min(page, totalPages);
  const pageNumbers = buildPageNumbers(safePage, totalPages);
  const paginatedItems = sortedItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectablePaginatedItems = paginatedItems.filter((item) => item.role !== "admin");
  const allRowsSelected =
    selectablePaginatedItems.length > 0 &&
    selectablePaginatedItems.every((item) => selectedIds.includes(item.id));
  const hasAppliedFilters =
    appliedSearch.length > 0 || !appliedRoles.includes("all") || !appliedStatuses.includes("all");
  const metrics = curatorsQuery.data?.data?.metrics;
  const totalCurators = metrics?.total_curators ?? 0;
  const onlineCurators = metrics?.online_curators ?? 0;
  const queuedRequests = metrics?.queued_requests ?? 0;
  const reviewedToday = metrics?.reviewed_today ?? 0;
  const isTableLoading = curatorsQuery.isPending || curatorsQuery.isFetching;

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

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

  const profileMenuItems = [
    { label: "Настройки", isDanger: false, onClick: () => navigate("/settings") },
    { label: "Выход", isDanger: true, onClick: handleLogout },
  ];

  const toggleFilterValue = <T extends string>(
    nextValue: T | "all",
    setter: Dispatch<SetStateAction<Array<T | "all">>>,
  ) => {
    if (nextValue === "all") {
      setter(["all"]);
      return;
    }

    setter((current) => {
      const normalized = current.filter((item) => item !== "all");
      if (normalized.includes(nextValue)) {
        const nextItems = normalized.filter((item) => item !== nextValue);
        return nextItems.length > 0 ? nextItems : ["all"];
      }

      return [...normalized, nextValue];
    });
  };

  const applyFilters = () => {
    setAppliedSearch(search.trim());
    setAppliedRoles(selectedRoles);
    setAppliedStatuses(selectedStatuses);
    setSelectedIds([]);
    setPage(1);
    setIsFilterOpen(false);
  };

  const resetFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setSelectedRoles(["all"]);
    setAppliedRoles(["all"]);
    setSelectedStatuses(["all"]);
    setAppliedStatuses(["all"]);
    setSelectedIds([]);
    setPage(1);
    setIsFilterOpen(false);
  };

  const applySorting = () => {
    setAppliedSortField(selectedSortField);
    setAppliedSortDirection(selectedSortDirection);
    setSelectedIds([]);
    setPage(1);
    setIsSortOpen(false);
  };

  const resetSorting = () => {
    setSelectedSortField("alphabet");
    setAppliedSortField("alphabet");
    setSelectedSortDirection("asc");
    setAppliedSortDirection("asc");
    setSelectedIds([]);
    setPage(1);
    setIsSortOpen(false);
  };

  const toggleSelectedId = (curatorId: string) => {
    if (paginatedItems.find((item) => item.id === curatorId)?.role === "admin") {
      return;
    }

    setSelectedIds((current) =>
      current.includes(curatorId) ? current.filter((item) => item !== curatorId) : [...current, curatorId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      if (allRowsSelected) {
        return current.filter((id) => !selectablePaginatedItems.some((item) => item.id === id));
      }

      const nextIds = new Set(current);
      selectablePaginatedItems.forEach((item) => {
        nextIds.add(item.id);
      });
      return Array.from(nextIds);
    });
  };

  const handleCreateCurator = () => {
    setCreateCuratorError(null);
    createCuratorMutation.mutate({
      full_name: newCuratorName.trim(),
      email: newCuratorEmail.trim(),
      password: newCuratorPassword,
      role: newCuratorRole,
    });
  };

  useEffect(() => {
    setSelectedIds([]);
  }, [safePage, appliedRoles, appliedSearch, appliedSortDirection, appliedSortField, appliedStatuses]);

  return (
    <main className={`curator-management-page curator-management-page--${themeRole}`}>
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
              <NavLink to="/moderation/curators" className="header__category-link">
                Управление кураторами
              </NavLink>
              <NavLink to="/settings" className="header__category-link">
                Настройки
              </NavLink>
            </nav>
          </Container>
        </div>
      </header>

      <Container className="curator-management-page__container">
        <header className="curator-management-page__header">
          <h1 className="curator-management-page__title">Управление кураторами</h1>
        </header>

        <section className="curator-management-page__metrics" aria-label="Статистика кураторов">
          {curatorMetricDefinitions.map((metric) => (
            <article key={metric.key} className="curator-management-page__metric-card">
              <span className="curator-management-page__metric-label">{metric.label}</span>
              {curatorsQuery.isPending ? (
                <span
                  className="curator-management-page__skeleton curator-management-page__skeleton--metric-value"
                  aria-hidden="true"
                />
              ) : (
                <strong className="curator-management-page__metric-value">
                  {
                    {
                      totalCurators,
                      onlineCurators,
                      queuedRequests,
                      reviewedToday,
                    }[metric.key]
                  }
                </strong>
              )}
            </article>
          ))}
        </section>

        <section className="curator-management-page__toolbar">
          <label className="curator-management-page__search header__search" aria-label="Поиск кураторов">
            <Input
              type="search"
              placeholder="Поиск"
              className="input--sm curator-management-page__search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedSearch(search.trim());
                  setSelectedIds([]);
                  setPage(1);
                }
              }}
            />
          </label>

          <div className="curator-management-page__toolbar-actions">
            <div ref={filtersRef} className="curator-management-page__filters">
              <button
                type="button"
                className="curator-management-page__icon-button curator-management-page__icon-button--filter"
                aria-label="Фильтры"
                aria-expanded={isFilterOpen}
                onClick={() => {
                  setIsSortOpen(false);
                  setIsFilterOpen((current) => !current);
                }}
              />

              {isFilterOpen ? (
                <div className="curator-management-page__filters-popover">
                  <div className="curator-management-page__filters-section">
                    <div className="curator-management-page__filters-head">
                      <h2 className="curator-management-page__filters-title">Фильтры</h2>
                      <button
                        type="button"
                        className="curator-management-page__filters-reset"
                        onClick={resetFilters}
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="curator-management-page__filters-section">
                    <div className="curator-management-page__filters-head">
                      <h3 className="curator-management-page__filters-group-title">По ролям</h3>
                      <button
                        type="button"
                        className="curator-management-page__filters-reset"
                        onClick={() => setSelectedRoles(["all"])}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="curator-management-page__filters-options curator-management-page__filters-options--checkboxes">
                      <label className="curator-management-page__filter-option">
                        <Checkbox
                          checked={selectedRoles.includes("all")}
                          onChange={() => toggleFilterValue("all", setSelectedRoles)}
                          variant="accent"
                        />
                        <span>Все</span>
                      </label>
                      {roleOptions.map((option) => (
                        <label key={option.value} className="curator-management-page__filter-option">
                          <Checkbox
                            checked={selectedRoles.includes(option.value)}
                            onChange={() => toggleFilterValue(option.value, setSelectedRoles)}
                            variant="accent"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="curator-management-page__filters-section">
                    <div className="curator-management-page__filters-head">
                      <h3 className="curator-management-page__filters-group-title">По статусу</h3>
                      <button
                        type="button"
                        className="curator-management-page__filters-reset"
                        onClick={() => setSelectedStatuses(["all"])}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="curator-management-page__filters-options curator-management-page__filters-options--checkboxes">
                      <label className="curator-management-page__filter-option">
                        <Checkbox
                          checked={selectedStatuses.includes("all")}
                          onChange={() => toggleFilterValue("all", setSelectedStatuses)}
                          variant="accent"
                        />
                        <span>Все</span>
                      </label>
                      {statusOptions.map((option) => (
                        <label key={option.value} className="curator-management-page__filter-option">
                          <Checkbox
                            checked={selectedStatuses.includes(option.value)}
                            onChange={() => toggleFilterValue(option.value, setSelectedStatuses)}
                            variant="accent"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="curator-management-page__filters-footer">
                    <Button type="button" variant="accent" size="sm" fullWidth onClick={applyFilters}>
                      Показать результаты
                    </Button>
                    <Button type="button" variant="accent-outline" size="sm" fullWidth onClick={resetFilters}>
                      Сбросить фильтры
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div ref={sortingRef} className="curator-management-page__sorting">
              <button
                type="button"
                className="curator-management-page__icon-button curator-management-page__icon-button--sorting"
                aria-label="Сортировка"
                aria-expanded={isSortOpen}
                onClick={() => {
                  setIsFilterOpen(false);
                  setIsSortOpen((current) => !current);
                }}
              >
                <span
                  aria-hidden="true"
                  className={
                    appliedSortDirection === "desc"
                      ? "curator-management-page__icon curator-management-page__icon--descending"
                      : "curator-management-page__icon curator-management-page__icon--ascending"
                  }
                />
              </button>

              {isSortOpen ? (
                <div className="curator-management-page__sorting-popover">
                  <div className="curator-management-page__filters-section">
                    <div className="curator-management-page__filters-head">
                      <h2 className="curator-management-page__filters-title">Сортировка</h2>
                      <button
                        type="button"
                        className="curator-management-page__filters-reset"
                        onClick={resetSorting}
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="curator-management-page__filters-section">
                    <div className="curator-management-page__filters-options curator-management-page__filters-options--radio">
                      {sortFieldOptions.map((option) => (
                        <label key={option.value} className="curator-management-page__filter-option">
                          <Radio
                            checked={selectedSortField === option.value}
                            onChange={() => setSelectedSortField(option.value)}
                            variant="accent"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="curator-management-page__filters-section">
                    <div className="curator-management-page__filters-options curator-management-page__filters-options--radio">
                      <label className="curator-management-page__filter-option">
                        <Radio
                          checked={selectedSortDirection === "asc"}
                          onChange={() => setSelectedSortDirection("asc")}
                          variant="accent"
                        />
                        <span>{selectedSortField === "alphabet" ? "Я-А" : "По возрастанию"}</span>
                      </label>
                      <label className="curator-management-page__filter-option">
                        <Radio
                          checked={selectedSortDirection === "desc"}
                          onChange={() => setSelectedSortDirection("desc")}
                          variant="accent"
                        />
                        <span>{selectedSortField === "alphabet" ? "А-Я" : "По убыванию"}</span>
                      </label>
                    </div>
                  </div>

                  <div className="curator-management-page__filters-footer">
                    <Button type="button" variant="accent" size="sm" fullWidth onClick={applySorting}>
                      Показать результаты
                    </Button>
                    <Button type="button" variant="accent-outline" size="sm" fullWidth onClick={resetSorting}>
                      Сбросить сортировку
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              type="button"
              variant="success"
              size="md"
              className="curator-management-page__add-button"
              onClick={() => {
                setCreateCuratorError(null);
                setNewCuratorPassword(generateCuratorPassword());
                setIsCreateCuratorModalOpen(true);
              }}
            >
              Добавить куратора
            </Button>
          </div>
        </section>

        <div
          className={
            selectedIds.length > 0
              ? "curator-management-page__bulk-bar-shell curator-management-page__bulk-bar-shell--visible"
              : "curator-management-page__bulk-bar-shell"
          }
          aria-hidden={selectedIds.length === 0}
        >
          <div className="curator-management-page__bulk-bar">
            <div className="curator-management-page__bulk-bar-selection">
              <Checkbox checked={selectedIds.length > 0} variant="accent" disabled readOnly />
              <span className="curator-management-page__bulk-bar-count">Выбрано: {selectedIds.length}</span>
            </div>

            <div className="curator-management-page__bulk-bar-actions">
              <Button
                type="button"
                variant="accent"
                size="md"
                className="curator-management-page__bulk-bar-button"
              >
                Изменить роли
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                className="curator-management-page__bulk-bar-button"
              >
                Удалить кураторов
              </Button>
            </div>
          </div>
        </div>

        <section className="curator-management-page__content">
          <div className="curator-management-page__table-head">
            <div className="curator-management-page__table-cell curator-management-page__table-cell--check">
              <Checkbox checked={allRowsSelected} onChange={toggleSelectAll} variant="accent" />
            </div>
            <div className="curator-management-page__table-cell">ФИО</div>
            <div className="curator-management-page__table-cell">E-mail</div>
            <div className="curator-management-page__table-cell">Роль</div>
            <div className="curator-management-page__table-cell">Статус</div>
            <div className="curator-management-page__table-cell">Активность</div>
            <div className="curator-management-page__table-cell">Действия</div>
          </div>

          <div className="curator-management-page__rows">
            {isTableLoading
              ? Array.from({ length: 3 }, (_, index) => (
                  <CuratorManagementRowSkeleton key={`skeleton-${index}`} />
                ))
              : paginatedItems.map((item) => {
                  const roleMeta = resolveRoleMeta(item.role);
                  const activityMeta = formatActivityMeta(item.last_activity_at);
                  const isSeniorCurator = item.role === "admin";

                  return (
                    <article key={item.id} className="curator-management-page__row">
                      <div className="curator-management-page__row-summary">
                        <div className="curator-management-page__row-leading">
                          <Checkbox
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelectedId(item.id)}
                            variant="accent"
                            disabled={isSeniorCurator}
                          />
                        </div>

                        <div className="curator-management-page__row-main">
                          <div className="curator-management-page__row-name">
                            <strong className="curator-management-page__row-title">{item.full_name}</strong>
                          </div>
                          <div className="curator-management-page__row-email">{item.email}</div>
                          <div className="curator-management-page__row-role">
                            <Status variant={roleMeta.variant}>{roleMeta.label}</Status>
                          </div>
                          <div className="curator-management-page__row-status">
                            <span
                              className={
                                item.status === "online"
                                  ? "curator-management-page__row-status-dot curator-management-page__row-status-dot--online"
                                  : "curator-management-page__row-status-dot curator-management-page__row-status-dot--offline"
                              }
                              aria-hidden="true"
                            />
                            <span>{item.status === "online" ? "Online" : "Offline"}</span>
                          </div>
                          <div className="curator-management-page__row-activity">{activityMeta.label}</div>
                          <div className="curator-management-page__row-actions">
                            <button
                              type="button"
                              className="curator-management-page__action-button"
                              aria-label={`Редактировать ${item.full_name}`}
                            >
                              <img src={editIcon} alt="" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="curator-management-page__action-button"
                              aria-label={`Удалить ${item.full_name}`}
                              disabled={isSeniorCurator}
                            >
                              <img src={deleteIcon} alt="" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}

            {!isTableLoading && isAuthenticated && paginatedItems.length === 0 ? (
              <div className="curator-management-page__empty">
                {hasAppliedFilters ? "По выбранным параметрам кураторы не найдены." : "Кураторы пока не добавлены."}
              </div>
            ) : null}
          </div>

          {!isTableLoading && isAuthenticated && paginatedItems.length > 0 ? (
            <nav className="curator-management-page__pagination" aria-label="Пагинация">
              <button
                type="button"
                className="curator-management-page__pagination-arrow"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={safePage === 1}
                aria-label="Предыдущая страница"
              >
                <img
                  src={arrowIcon}
                  alt=""
                  aria-hidden="true"
                  className="curator-management-page__pagination-arrow-icon curator-management-page__pagination-arrow-icon--prev"
                />
              </button>
              {pageNumbers.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="curator-management-page__pagination-ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={
                      item === safePage
                        ? "curator-management-page__pagination-page curator-management-page__pagination-page--active"
                        : "curator-management-page__pagination-page"
                    }
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                className="curator-management-page__pagination-arrow"
                onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                disabled={safePage === totalPages}
                aria-label="Следующая страница"
              >
                <img
                  src={arrowIcon}
                  alt=""
                  aria-hidden="true"
                  className="curator-management-page__pagination-arrow-icon"
                />
              </button>
            </nav>
          ) : null}
        </section>
      </Container>

      <Modal
        isOpen={isCreateCuratorModalOpen}
        onClose={() => {
          if (createCuratorMutation.isPending) {
            return;
          }

          setCreateCuratorError(null);
          setIsCreateCuratorModalOpen(false);
        }}
        title="Добавить куратора"
        panelClassName="curator-management-page__modal-panel"
      >
        <div className="curator-management-page__modal-form">
          <label className="curator-management-page__modal-field">
            <span className="curator-management-page__modal-label">ФИО</span>
            <Input
              value={newCuratorName}
              onChange={(event) => setNewCuratorName(event.target.value)}
              placeholder="Введите имя куратора"
              className="curator-management-page__modal-input"
            />
          </label>

          <label className="curator-management-page__modal-field">
            <span className="curator-management-page__modal-label">E-mail</span>
            <Input
              type="email"
              value={newCuratorEmail}
              onChange={(event) => setNewCuratorEmail(event.target.value)}
              placeholder="name@example.com"
              className="curator-management-page__modal-input"
            />
          </label>

          <label className="curator-management-page__modal-field">
            <span className="curator-management-page__modal-label">Пароль</span>
            <Input
              type="password"
              value={newCuratorPassword}
              onChange={(event) => setNewCuratorPassword(event.target.value)}
              maxLength={10}
              placeholder="Введите пароль"
              className="curator-management-page__modal-input"
            />
          </label>

          <div className="curator-management-page__modal-field">
            <span className="curator-management-page__modal-label">Роль</span>
            <div className="curator-management-page__modal-role-options">
              <label className="curator-management-page__modal-role-option">
                <Radio
                  checked={newCuratorRole === "junior"}
                  onChange={() => setNewCuratorRole("junior")}
                  variant="accent"
                />
                <span>Junior</span>
              </label>
              <label className="curator-management-page__modal-role-option">
                <Radio
                  checked={newCuratorRole === "curator"}
                  onChange={() => setNewCuratorRole("curator")}
                  variant="accent"
                />
                <span>Middle</span>
              </label>
              <label className="curator-management-page__modal-role-option">
                <Radio
                  checked={newCuratorRole === "admin"}
                  onChange={() => setNewCuratorRole("admin")}
                  variant="accent"
                />
                <span>Senior</span>
              </label>
            </div>
          </div>

          {createCuratorError ? (
            <p className="curator-management-page__modal-error">{createCuratorError}</p>
          ) : null}

          <div className="curator-management-page__modal-actions">
            <Button
              type="button"
              variant="accent-outline"
              size="md"
              onClick={() => {
                setCreateCuratorError(null);
                setIsCreateCuratorModalOpen(false);
              }}
              disabled={createCuratorMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="accent"
              size="md"
              onClick={handleCreateCurator}
              loading={createCuratorMutation.isPending}
              disabled={
                createCuratorMutation.isPending ||
                newCuratorName.trim().length < 2 ||
                newCuratorEmail.trim().length === 0 ||
                newCuratorPassword.length < 8
              }
            >
              Добавить
            </Button>
          </div>
        </div>
      </Modal>

      <Footer hashPrefix="/" theme={themeRole} />
    </main>
  );
}
