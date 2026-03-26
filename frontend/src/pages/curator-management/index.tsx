import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Navigate, useNavigate } from "react-router-dom";

import arrowIcon from "../../assets/icons/arrow.svg";
import deleteIcon from "../../assets/icons/delete.svg";
import editIcon from "../../assets/icons/edit.svg";
import profileIcon from "../../assets/icons/profile.svg";
import { meRequest, performLogout, useAuthStore } from "../../features/auth";
import { NotificationMenu } from "../../features/notifications";
import { Button, Checkbox, Container, Input, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import "../../widgets/header/header.css";
import "./curator-management.css";

type CuratorRole = "junior" | "middle" | "senior";
type CuratorPresence = "online" | "offline";
type CuratorSortField = "alphabet" | "workload" | "activity";
type CuratorSortDirection = "asc" | "desc";

type CuratorItem = {
  id: string;
  fullName: string;
  email: string;
  role: CuratorRole;
  workloadCurrent: number;
  workloadLimit: number;
  status: CuratorPresence;
  lastActivityLabel: string;
  lastActivityMinutes: number;
  reviewedToday: number;
};

const PAGE_SIZE = 5;

const curatorItems: CuratorItem[] = [
  {
    id: "1",
    fullName: "Иванов Иван Иванович",
    email: "curator1@tramplin.ru",
    role: "junior",
    workloadCurrent: 12,
    workloadLimit: 20,
    status: "online",
    lastActivityLabel: "Сейчас",
    lastActivityMinutes: 0,
    reviewedToday: 1,
  },
  {
    id: "2",
    fullName: "Петрова Мария Сергеевна",
    email: "curator2@tramplin.ru",
    role: "middle",
    workloadCurrent: 9,
    workloadLimit: 20,
    status: "offline",
    lastActivityLabel: "15 мин назад",
    lastActivityMinutes: 15,
    reviewedToday: 0,
  },
  {
    id: "3",
    fullName: "Сидоров Алексей Павлович",
    email: "curator3@tramplin.ru",
    role: "senior",
    workloadCurrent: 12,
    workloadLimit: 20,
    status: "online",
    lastActivityLabel: "Сейчас",
    lastActivityMinutes: 0,
    reviewedToday: 1,
  },
  {
    id: "4",
    fullName: "Козлова Анна Дмитриевна",
    email: "curator4@tramplin.ru",
    role: "junior",
    workloadCurrent: 8,
    workloadLimit: 20,
    status: "online",
    lastActivityLabel: "Сейчас",
    lastActivityMinutes: 0,
    reviewedToday: 0,
  },
  {
    id: "5",
    fullName: "Морозов Денис Ильич",
    email: "curator5@tramplin.ru",
    role: "junior",
    workloadCurrent: 10,
    workloadLimit: 20,
    status: "online",
    lastActivityLabel: "Сейчас",
    lastActivityMinutes: 0,
    reviewedToday: 0,
  },
  {
    id: "6",
    fullName: "Федорова Екатерина Олеговна",
    email: "curator6@tramplin.ru",
    role: "middle",
    workloadCurrent: 14,
    workloadLimit: 20,
    status: "offline",
    lastActivityLabel: "1 час назад",
    lastActivityMinutes: 60,
    reviewedToday: 0,
  },
];

const roleOptions: Array<{ value: CuratorRole; label: string }> = [
  { value: "junior", label: "Junior" },
  { value: "middle", label: "Middle" },
  { value: "senior", label: "Senior" },
];

const statusOptions: Array<{ value: CuratorPresence; label: string }> = [
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
];

const sortFieldOptions: Array<{ value: CuratorSortField; label: string }> = [
  { value: "alphabet", label: "По алфавиту" },
  { value: "workload", label: "По нагрузке" },
  { value: "activity", label: "По активности" },
];

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
  if (role === "junior") {
    return { label: "Junior", variant: "approved" as const };
  }

  if (role === "middle") {
    return { label: "Middle", variant: "pending-review" as const };
  }

  return { label: "Senior", variant: "rejected" as const };
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
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isModerationRole = role === "curator" || role === "admin";
  const themeRole = role === "admin" ? "admin" : "curator";
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

  useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

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

    return curatorItems.filter((item) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        item.fullName.toLowerCase().includes(normalizedSearch) ||
        item.email.toLowerCase().includes(normalizedSearch);
      const matchesRole = appliedRoles.includes("all") || appliedRoles.includes(item.role);
      const matchesStatus = appliedStatuses.includes("all") || appliedStatuses.includes(item.status);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [appliedRoles, appliedSearch, appliedStatuses]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((left, right) => {
      let comparison = 0;

      if (appliedSortField === "workload") {
        comparison =
          left.workloadCurrent / left.workloadLimit - right.workloadCurrent / right.workloadLimit;
      } else if (appliedSortField === "activity") {
        comparison = left.lastActivityMinutes - right.lastActivityMinutes;
      } else {
        comparison = left.fullName.localeCompare(right.fullName, "ru");
      }

      return appliedSortDirection === "asc" ? comparison : -comparison;
    });
  }, [appliedSortDirection, appliedSortField, filteredItems]);

  const totalPages = Math.max(Math.ceil(sortedItems.length / PAGE_SIZE), 1);
  const safePage = Math.min(page, totalPages);
  const pageNumbers = buildPageNumbers(safePage, totalPages);
  const paginatedItems = sortedItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const allRowsSelected = paginatedItems.length > 0 && selectedIds.length === paginatedItems.length;
  const hasAppliedFilters =
    appliedSearch.length > 0 || !appliedRoles.includes("all") || !appliedStatuses.includes("all");

  const totalCurators = curatorItems.length;
  const onlineCurators = curatorItems.filter((item) => item.status === "online").length;
  const queuedRequests = curatorItems.filter((item) => item.workloadCurrent < item.workloadLimit).length;
  const reviewedToday = curatorItems.reduce((sum, item) => sum + item.reviewedToday, 0);

  if (!isModerationRole) {
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
    setSelectedIds((current) =>
      current.includes(curatorId) ? current.filter((item) => item !== curatorId) : [...current, curatorId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allRowsSelected ? [] : paginatedItems.map((item) => item.id));
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
              <a href="#content-moderation" className="header__category-link">
                Модерация контента
              </a>
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
          <article className="curator-management-page__metric-card">
            <span className="curator-management-page__metric-label">Всего кураторов:</span>
            <strong className="curator-management-page__metric-value">{totalCurators}</strong>
          </article>
          <article className="curator-management-page__metric-card">
            <span className="curator-management-page__metric-label">Онлайн:</span>
            <strong className="curator-management-page__metric-value">{onlineCurators}</strong>
          </article>
          <article className="curator-management-page__metric-card">
            <span className="curator-management-page__metric-label">В очереди заявок:</span>
            <strong className="curator-management-page__metric-value">{queuedRequests}</strong>
          </article>
          <article className="curator-management-page__metric-card">
            <span className="curator-management-page__metric-label">Сегодня проверено:</span>
            <strong className="curator-management-page__metric-value">{reviewedToday}</strong>
          </article>
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
                  applyFilters();
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
                        <span>{selectedSortField === "alphabet" ? "А-Я" : "По возрастанию"}</span>
                      </label>
                      <label className="curator-management-page__filter-option">
                        <Radio
                          checked={selectedSortDirection === "desc"}
                          onChange={() => setSelectedSortDirection("desc")}
                          variant="accent"
                        />
                        <span>{selectedSortField === "alphabet" ? "Я-А" : "По убыванию"}</span>
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

            <Button type="button" variant="accent" size="md" className="curator-management-page__add-button">
              Добавить куратора
            </Button>
          </div>
        </section>

        <section className="curator-management-page__content">
          <div className="curator-management-page__table-head">
            <div className="curator-management-page__table-cell curator-management-page__table-cell--check">
              <Checkbox checked={allRowsSelected} onChange={toggleSelectAll} variant="accent" />
            </div>
            <div className="curator-management-page__table-cell">ФИО</div>
            <div className="curator-management-page__table-cell">E-mail</div>
            <div className="curator-management-page__table-cell">Роль</div>
            <div className="curator-management-page__table-cell">Нагрузка</div>
            <div className="curator-management-page__table-cell">Статус</div>
            <div className="curator-management-page__table-cell">Активность</div>
            <div className="curator-management-page__table-cell">Действия</div>
          </div>

          <div className="curator-management-page__rows">
            {!isAuthenticated
              ? Array.from({ length: 3 }, (_, index) => (
                  <CuratorManagementRowSkeleton key={`skeleton-${index}`} />
                ))
              : paginatedItems.map((item) => {
                  const roleMeta = resolveRoleMeta(item.role);
                  const loadPercent = Math.min((item.workloadCurrent / item.workloadLimit) * 100, 100);

                  return (
                    <article key={item.id} className="curator-management-page__row">
                      <div className="curator-management-page__row-summary">
                        <div className="curator-management-page__row-leading">
                          <Checkbox
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelectedId(item.id)}
                            variant="accent"
                          />
                        </div>

                        <div className="curator-management-page__row-main">
                          <div className="curator-management-page__row-name">
                            <strong className="curator-management-page__row-title">{item.fullName}</strong>
                          </div>
                          <div className="curator-management-page__row-email">{item.email}</div>
                          <div className="curator-management-page__row-role">
                            <Status variant={roleMeta.variant}>{roleMeta.label}</Status>
                          </div>
                          <div className="curator-management-page__row-workload">
                            <span className="curator-management-page__row-workload-value">
                              {item.workloadCurrent}/{item.workloadLimit}
                            </span>
                            <span className="curator-management-page__row-workload-bar" aria-hidden="true">
                              <span
                                className="curator-management-page__row-workload-progress"
                                style={{ width: `${loadPercent}%` }}
                              />
                            </span>
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
                          <div className="curator-management-page__row-activity">{item.lastActivityLabel}</div>
                          <div className="curator-management-page__row-actions">
                            <button
                              type="button"
                              className="curator-management-page__action-button"
                              aria-label={`Редактировать ${item.fullName}`}
                            >
                              <img src={editIcon} alt="" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="curator-management-page__action-button"
                              aria-label={`Удалить ${item.fullName}`}
                            >
                              <img src={deleteIcon} alt="" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}

            {isAuthenticated && paginatedItems.length === 0 ? (
              <div className="curator-management-page__empty">
                {hasAppliedFilters ? "По выбранным параметрам кураторы не найдены." : "Кураторы пока не добавлены."}
              </div>
            ) : null}
          </div>

          {isAuthenticated && paginatedItems.length > 0 ? (
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

      <Footer hashPrefix="/" theme={themeRole} />
    </main>
  );
}
