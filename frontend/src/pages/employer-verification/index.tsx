import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";

import filterIcon from "../../assets/icons/filter.svg";
import narrowIcon from "../../assets/icons/narrow.svg";
import profileIcon from "../../assets/icons/profile.svg";
import {
  meRequest,
  performLogout,
  useAuthStore,
} from "../../features/auth";
import { NotificationMenu } from "../../features/notifications";
import {
  approveEmployerVerificationRequest,
  EmployerVerificationRequestItem,
  EmployerVerificationRequestStatus,
  listEmployerVerificationRequestsRequest,
  rejectEmployerVerificationRequest,
  requestEmployerVerificationChanges,
} from "../../features/moderation";
import { Button, Checkbox, Container, Input, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import "../../widgets/header/header.css";
import "./employer-verification.css";

type VerificationStatusFilter = "all" | EmployerVerificationRequestStatus;
type VerificationPeriodFilter = "all" | "today" | "week" | "month";

const PAGE_SIZE = 6;
const statusOptions: Array<{ value: EmployerVerificationRequestStatus; label: string }> = [
  { value: "pending", label: "На рассмотрении" },
  { value: "under_review", label: "На рассмотрении" },
  { value: "approved", label: "Одобрено" },
  { value: "rejected", label: "Отклонено" },
  { value: "suspended", label: "Запрос информации" },
];

const periodOptions: Array<{ value: VerificationPeriodFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "today", label: "За сегодня" },
  { value: "week", label: "За неделю" },
  { value: "month", label: "За месяц" },
];

function resolveStatusMeta(status: EmployerVerificationRequestStatus) {
  if (status === "approved") {
    return { label: "Одобрено", variant: "approved" as const };
  }

  if (status === "rejected") {
    return { label: "Отклонено", variant: "rejected" as const };
  }

  if (status === "suspended") {
    return { label: "Запрос информации", variant: "info-request" as const };
  }

  return { label: "На рассмотрении", variant: "pending-review" as const };
}

function resolveEmployerTypeLabel(value: string) {
  if (value === "company") {
    return "Компания";
  }

  if (value === "individual_entrepreneur") {
    return "ИП";
  }

  return "Работодатель";
}

function formatSubmissionDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

function formatFileSize(value: number) {
  if (value <= 0) {
    return "0 МБ";
  }

  const sizeInMb = value / (1024 * 1024);
  return `${sizeInMb.toFixed(1).replace(".", ",")} МБ`;
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

export function EmployerVerificationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isModerationRole = role === "curator" || role === "admin";
  const themeRole = role === "admin" ? "admin" : "curator";
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuCloseTimeoutRef = useRef<number | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProfileMenuPinned, setIsProfileMenuPinned] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<VerificationStatusFilter[]>(["all"]);
  const [appliedStatuses, setAppliedStatuses] = useState<VerificationStatusFilter[]>(["all"]);
  const [selectedPeriod, setSelectedPeriod] = useState<VerificationPeriodFilter>("all");
  const [appliedPeriod, setAppliedPeriod] = useState<VerificationPeriodFilter>("all");
  const [page, setPage] = useState(1);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDescending, setIsDescending] = useState(true);
  const [moderatorComment, setModeratorComment] = useState("");

  const { data: meData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const verificationRequestsQuery = useQuery({
    queryKey: [
      "moderation",
      "employer-verification-requests",
      appliedSearch,
      appliedStatuses,
      appliedPeriod,
      page,
    ],
    queryFn: () =>
      listEmployerVerificationRequestsRequest({
        search: appliedSearch,
        statuses:
          appliedStatuses.includes("all")
            ? []
            : (appliedStatuses as EmployerVerificationRequestStatus[]),
        period: appliedPeriod,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: isAuthenticated && isModerationRole,
    staleTime: 30 * 1000,
  });

  const handleMutationSuccess = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["moderation", "employer-verification-requests"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["moderation", "dashboard"],
    });
    setExpandedRequestId(null);
    setModeratorComment("");
  };

  const approveMutation = useMutation({
    mutationFn: ({ requestId, comment }: { requestId: string; comment: string }) =>
      approveEmployerVerificationRequest(requestId, { moderator_comment: comment || null }),
    onSuccess: handleMutationSuccess,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, comment }: { requestId: string; comment: string }) =>
      rejectEmployerVerificationRequest(requestId, { moderator_comment: comment || null }),
    onSuccess: handleMutationSuccess,
  });

  const requestChangesMutation = useMutation({
    mutationFn: ({ requestId, comment }: { requestId: string; comment: string }) =>
      requestEmployerVerificationChanges(requestId, { moderator_comment: comment || null }),
    onSuccess: handleMutationSuccess,
  });

  const user = meData?.data?.user;
  const items = verificationRequestsQuery.data?.data?.items ?? [];
  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      const leftTime = new Date(left.submitted_at).getTime();
      const rightTime = new Date(right.submitted_at).getTime();
      return isDescending ? rightTime - leftTime : leftTime - rightTime;
    });
  }, [isDescending, items]);
  const total = verificationRequestsQuery.data?.data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const pageNumbers = buildPageNumbers(page, totalPages);
  const allRowsSelected = sortedItems.length > 0 && selectedIds.length === sortedItems.length;
  const currentExpandedItem = sortedItems.find((item) => item.id === expandedRequestId) ?? null;
  const anyMutationPending =
    approveMutation.isPending || rejectMutation.isPending || requestChangesMutation.isPending;

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

  useEffect(() => () => {
    clearProfileMenuCloseTimeout();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [sortedItems]);

  const profileMenuItems = [
    { label: "Настройки", isDanger: false, onClick: () => navigate("/settings") },
    { label: "Выход", isDanger: true, onClick: handleLogout },
  ];

  const applyFilters = () => {
    setAppliedSearch(search.trim());
    setAppliedStatuses(selectedStatuses);
    setAppliedPeriod(selectedPeriod);
    setPage(1);
    setExpandedRequestId(null);
    setSelectedIds([]);
    setIsFilterOpen(false);
  };

  const resetFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setSelectedStatuses(["all"]);
    setAppliedStatuses(["all"]);
    setSelectedPeriod("all");
    setAppliedPeriod("all");
    setPage(1);
    setIsFilterOpen(false);
  };

  const toggleStatusFilter = (nextStatus: VerificationStatusFilter) => {
    if (nextStatus === "all") {
      setSelectedStatuses(["all"]);
      return;
    }

    setSelectedStatuses((current) => {
      const normalized = current.filter((item) => item !== "all");
      if (normalized.includes(nextStatus)) {
        const nextItems = normalized.filter((item) => item !== nextStatus);
        return nextItems.length > 0 ? nextItems : ["all"];
      }

      return [...normalized, nextStatus];
    });
  };

  const toggleSelectedId = (requestId: string) => {
    setSelectedIds((current) =>
      current.includes(requestId)
        ? current.filter((item) => item !== requestId)
        : [...current, requestId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allRowsSelected ? [] : sortedItems.map((item) => item.id));
  };

  const handleExpand = (item: EmployerVerificationRequestItem) => {
    const nextId = expandedRequestId === item.id ? null : item.id;
    setExpandedRequestId(nextId);
    setModeratorComment(nextId ? item.moderator_comment ?? item.rejection_reason ?? "" : "");
  };

  const handleApprove = (requestId: string) => {
    approveMutation.mutate({ requestId, comment: moderatorComment.trim() });
  };

  const handleReject = (requestId: string) => {
    rejectMutation.mutate({ requestId, comment: moderatorComment.trim() });
  };

  const handleRequestChanges = (requestId: string) => {
    requestChangesMutation.mutate({ requestId, comment: moderatorComment.trim() });
  };

  return (
    <main className={`employer-verification-page employer-verification-page--${themeRole}`}>
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
              <nav className="header__nav" aria-label="Основная навигация">
                <Link to="/" className="header__nav-link">
                  Главная
                </Link>
                <a href="#about" className="header__nav-link">
                  О проекте
                </a>
              </nav>

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
              <Link to="/" className="header__category-link">
                Дашборд
              </Link>
              <Link to="/moderation/employers" className="header__category-link">
                Верификация работодателей
              </Link>
              <a href="#content-moderation" className="header__category-link">
                Модерация контента
              </a>
              <a href="#curators" className="header__category-link">
                Управление кураторами
              </a>
              <Link to="/settings" className="header__category-link">
                Настройки
              </Link>
            </nav>
          </Container>
        </div>
      </header>

      <Container className="employer-verification-page__container">
        <header className="employer-verification-page__header">
          <h1 className="employer-verification-page__title">
            Верификация работодателей ({total})
          </h1>
        </header>

        <section className="employer-verification-page__toolbar">
          <label className="employer-verification-page__search header__search" aria-label="Поиск работодателей">
            <Input
              type="search"
              placeholder="Поиск"
              className="input--sm employer-verification-page__search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyFilters();
                }
              }}
            />
          </label>

          <div className="employer-verification-page__toolbar-actions">
            <div className="employer-verification-page__filters">
              <button
                type="button"
                className="employer-verification-page__icon-button"
                aria-label="Фильтры"
                aria-expanded={isFilterOpen}
                onClick={() => setIsFilterOpen((current) => !current)}
              >
                <img src={filterIcon} alt="" aria-hidden="true" className="employer-verification-page__icon" />
              </button>

              {isFilterOpen ? (
                <div className="employer-verification-page__filters-popover">
                  <div className="employer-verification-page__filters-section">
                    <div className="employer-verification-page__filters-head">
                      <h2 className="employer-verification-page__filters-title">Фильтры</h2>
                      <button
                        type="button"
                        className="employer-verification-page__filters-reset"
                        onClick={resetFilters}
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="employer-verification-page__filters-section">
                    <div className="employer-verification-page__filters-head">
                      <h3 className="employer-verification-page__filters-group-title">По статусам</h3>
                      <button
                        type="button"
                        className="employer-verification-page__filters-reset"
                        onClick={() => setSelectedStatuses(["all"])}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="employer-verification-page__filters-options employer-verification-page__filters-options--checkboxes">
                      <label className="employer-verification-page__filter-option">
                        <Checkbox
                          checked={selectedStatuses.includes("all")}
                          onChange={() => toggleStatusFilter("all")}
                          variant="accent"
                        />
                        <span>Все</span>
                      </label>
                      {statusOptions.map((option) => (
                        <label key={option.value} className="employer-verification-page__filter-option">
                          <Checkbox
                            checked={selectedStatuses.includes(option.value)}
                            onChange={() => toggleStatusFilter(option.value)}
                            variant="accent"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="employer-verification-page__filters-section">
                    <div className="employer-verification-page__filters-head">
                      <h3 className="employer-verification-page__filters-group-title">Период</h3>
                      <button
                        type="button"
                        className="employer-verification-page__filters-reset"
                        onClick={() => setSelectedPeriod("all")}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="employer-verification-page__filters-options employer-verification-page__filters-options--radio">
                      {periodOptions.map((option) => (
                        <label key={option.value} className="employer-verification-page__filter-option">
                          <Radio
                            checked={selectedPeriod === option.value}
                            onChange={() => setSelectedPeriod(option.value)}
                            variant="accent"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="employer-verification-page__filters-footer">
                    <Button type="button" variant="accent" size="md" fullWidth onClick={applyFilters}>
                      Показать результаты
                    </Button>
                    <Button
                      type="button"
                      variant="accent-outline"
                      size="md"
                      fullWidth
                      onClick={resetFilters}
                    >
                      Сбросить фильтры
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="employer-verification-page__icon-button"
              aria-label="Поменять порядок сортировки"
              onClick={() => setIsDescending((current) => !current)}
            >
              <img
                src={narrowIcon}
                alt=""
                aria-hidden="true"
                className={
                  isDescending
                    ? "employer-verification-page__icon employer-verification-page__icon--descending"
                    : "employer-verification-page__icon employer-verification-page__icon--ascending"
                }
              />
            </button>
          </div>
        </section>

        <section className="employer-verification-page__content">
          <div className="employer-verification-page__table-head">
            <div className="employer-verification-page__table-cell employer-verification-page__table-cell--check">
              <Checkbox checked={allRowsSelected} onChange={toggleSelectAll} variant="accent" />
            </div>
            <div className="employer-verification-page__table-cell">Работодатель</div>
            <div className="employer-verification-page__table-cell">ИНН</div>
            <div className="employer-verification-page__table-cell">Дата подачи</div>
            <div className="employer-verification-page__table-cell employer-verification-page__table-cell--status">Статус</div>
          </div>

          <div className="employer-verification-page__rows">
            {sortedItems.map((item) => {
              const statusMeta = resolveStatusMeta(item.status);
              const isExpanded = expandedRequestId === item.id;

              return (
                <article key={item.id} className="employer-verification-page__row">
                  <div className="employer-verification-page__row-summary">
                    <div className="employer-verification-page__row-leading">
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelectedId(item.id)}
                        variant="accent"
                      />
                    </div>

                    <div
                      className="employer-verification-page__row-main"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleExpand(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleExpand(item);
                        }
                      }}
                    >
                      <div className="employer-verification-page__row-company">
                        <strong className="employer-verification-page__row-title">{item.employer_name}</strong>
                        <div className="employer-verification-page__row-actions">
                          <button
                            type="button"
                            className="employer-verification-page__row-action employer-verification-page__row-action--approve"
                            onClick={(event) => {
                              event.stopPropagation();
                              approveMutation.mutate({ requestId: item.id, comment: "" });
                            }}
                          >
                            Одобрить
                          </button>
                          <button
                            type="button"
                            className="employer-verification-page__row-action employer-verification-page__row-action--reject"
                            onClick={(event) => {
                              event.stopPropagation();
                              rejectMutation.mutate({ requestId: item.id, comment: "" });
                            }}
                          >
                            Отклонить
                          </button>
                        </div>
                      </div>
                      <div className="employer-verification-page__row-inn">{item.inn}</div>
                      <div className="employer-verification-page__row-date">{formatSubmissionDate(item.submitted_at)}</div>
                      <div className="employer-verification-page__row-status">
                        <Status variant={statusMeta.variant}>{statusMeta.label}</Status>
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="employer-verification-page__row-details">
                      <div className="employer-verification-page__details-grid">
                        <div className="employer-verification-page__details-column">
                          <div className="employer-verification-page__detail">
                            <div className="employer-verification-page__detail-label">Статус</div>
                            <div className="employer-verification-page__detail-value">
                              {resolveEmployerTypeLabel(item.employer_type)}
                            </div>
                          </div>
                          <div className="employer-verification-page__detail">
                            <div className="employer-verification-page__detail-label">Корпоративная почта</div>
                            <div className="employer-verification-page__detail-value">
                              {item.corporate_email ?? "Не указано"}
                            </div>
                          </div>
                          <div className="employer-verification-page__detail">
                            <div className="employer-verification-page__detail-label">Подтверждающие документы</div>
                            <div className="employer-verification-page__documents">
                              {item.documents.length > 0 ? (
                                item.documents.map((document) => (
                                  <a
                                    key={document.id}
                                    href={document.file_url ?? "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="employer-verification-page__document"
                                  >
                                    <div className="employer-verification-page__document-preview" />
                                    <span className="employer-verification-page__document-name">
                                      {document.file_name}
                                    </span>
                                    <span className="employer-verification-page__document-size">
                                      {formatFileSize(document.file_size)}
                                    </span>
                                  </a>
                                ))
                              ) : (
                                <span className="employer-verification-page__detail-value">Документы не приложены</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="employer-verification-page__details-column">
                          <div className="employer-verification-page__detail">
                            <div className="employer-verification-page__detail-label">Сайт компании</div>
                            <div className="employer-verification-page__detail-value">
                              {item.website_url ?? "Не указано"}
                            </div>
                          </div>
                          <div className="employer-verification-page__detail">
                            <div className="employer-verification-page__detail-label">Комментарий</div>
                            <textarea
                              className="employer-verification-page__comment"
                              value={currentExpandedItem?.id === item.id ? moderatorComment : ""}
                              onChange={(event) => setModeratorComment(event.target.value)}
                              placeholder="Добавьте комментарий для работодателя"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="employer-verification-page__detail-actions">
                        <Button
                          type="button"
                          variant="accent-outline"
                          size="md"
                          onClick={() => handleRequestChanges(item.id)}
                          loading={requestChangesMutation.isPending && currentExpandedItem?.id === item.id}
                          disabled={anyMutationPending}
                        >
                          Запросить дополнительную информацию
                        </Button>
                        <div className="employer-verification-page__detail-actions-group">
                          <Button
                            type="button"
                            variant="danger"
                            size="md"
                            onClick={() => handleReject(item.id)}
                            loading={rejectMutation.isPending && currentExpandedItem?.id === item.id}
                            disabled={anyMutationPending}
                          >
                            Отклонить
                          </Button>
                          <Button
                            type="button"
                            variant="success"
                            size="md"
                            onClick={() => handleApprove(item.id)}
                            loading={approveMutation.isPending && currentExpandedItem?.id === item.id}
                            disabled={anyMutationPending}
                          >
                            Одобрить
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}

            {sortedItems.length === 0 ? (
              <div className="employer-verification-page__empty">
                По текущим фильтрам заявок на верификацию нет.
              </div>
            ) : null}
          </div>

          {sortedItems.length > 0 ? (
            <nav className="employer-verification-page__pagination" aria-label="Пагинация">
              <button
                type="button"
                className="employer-verification-page__pagination-arrow"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page === 1}
              >
                &lt;
              </button>
              {pageNumbers.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="employer-verification-page__pagination-ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={
                      item === page
                        ? "employer-verification-page__pagination-page employer-verification-page__pagination-page--active"
                        : "employer-verification-page__pagination-page"
                    }
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                className="employer-verification-page__pagination-arrow"
                onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                disabled={page === totalPages}
              >
                &gt;
              </button>
            </nav>
          ) : null}
        </section>
      </Container>

      <Footer hashPrefix="/" theme={themeRole} />
    </main>
  );
}
