import { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction, useEffect, useMemo, useRef, useState } from "react";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Navigate, useNavigate } from "react-router-dom";

import arrowIcon from "../../assets/icons/arrow.svg";
import editIcon from "../../assets/icons/edit.svg";
import { getModerationAccessState, meRequest, performLogout, useAuthStore } from "../../features/auth";
import { useNotificationsRealtime } from "../../features/notifications";
import {
  approveContentModerationItemRequest,
  ContentModerationChecklist,
  ContentModerationItem,
  ContentModerationKind,
  ContentModerationListResponse,
  ContentModerationStatus,
  listContentModerationItemsRequest,
  rejectContentModerationItemRequest,
  requestContentModerationChangesRequest,
  updateContentModerationChecklistRequest,
} from "../../features/moderation";
import { Button, Checkbox, Container, Input, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildModerationProfileMenuItems, CuratorHeaderNavigation, Header } from "../../widgets/header";
import "./content-moderation.css";

type ContentTab = "all" | ContentModerationKind;
type ContentSortField = "date" | "alphabet";
type ContentSortDirection = "asc" | "desc";

const PAGE_SIZE = 10;
const SKELETON_ROW_COUNT = 5;

const tabDefinitions: Array<{ value: ContentTab; label: string; countKey: "all" | "vacancies" | "internships" | "events" | "mentorships" }> = [
  { value: "all", label: "Все", countKey: "all" },
  { value: "vacancy", label: "Вакансии", countKey: "vacancies" },
  { value: "internship", label: "Стажировки", countKey: "internships" },
  { value: "event", label: "Мероприятия", countKey: "events" },
  { value: "mentorship", label: "Менторские программы", countKey: "mentorships" },
];

const statusOptions: Array<{ value: ContentModerationStatus; label: string }> = [
  { value: "pending_review", label: "На проверке" },
  { value: "changes_requested", label: "Требует правок" },
  { value: "approved", label: "Активно" },
  { value: "rejected", label: "Отклонена" },
  { value: "unpublished", label: "Снят с публикации" },
];

const sortFieldOptions: Array<{ value: ContentSortField; label: string }> = [
  { value: "date", label: "По дате" },
  { value: "alphabet", label: "По алфавиту" },
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

function resolveStatusMeta(status: ContentModerationStatus) {
  if (status === "approved") {
    return { label: "Активно", variant: "active" as const };
  }

  if (status === "rejected") {
    return { label: "Отклонена", variant: "rejected" as const };
  }

  if (status === "changes_requested") {
    return { label: "Требует правок", variant: "info-request" as const };
  }

  if (status === "unpublished") {
    return { label: "Снят с публикации", variant: "unpublished" as const };
  }

  return { label: "На проверке", variant: "pending-review" as const };
}

function formatSubmissionDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatSubmissionDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ContentModerationMetricSkeleton({ label }: { label: string }) {
  return (
    <article className="content-moderation-page__metric-card" aria-hidden="true">
      <span className="content-moderation-page__metric-label">{label}</span>
      <span className="content-moderation-page__skeleton content-moderation-page__skeleton--metric-value" />
    </article>
  );
}

function ContentModerationRowSkeleton() {
  return (
    <article className="content-moderation-page__row content-moderation-page__row--skeleton" aria-hidden="true">
      <div className="content-moderation-page__row-summary">
        <div className="content-moderation-page__row-leading">
          <span className="content-moderation-page__skeleton content-moderation-page__skeleton--checkbox" />
        </div>
        <div className="content-moderation-page__row-main">
          <span className="content-moderation-page__skeleton content-moderation-page__skeleton--title" />
          <span className="content-moderation-page__skeleton content-moderation-page__skeleton--cell" />
          <span className="content-moderation-page__skeleton content-moderation-page__skeleton--cell" />
          <span className="content-moderation-page__skeleton content-moderation-page__skeleton--cell" />
          <span className="content-moderation-page__skeleton content-moderation-page__skeleton--badge" />
          <span className="content-moderation-page__skeleton content-moderation-page__skeleton--actions" />
        </div>
      </div>
    </article>
  );
}

export function ContentModerationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const moderationAccess = getModerationAccessState(role);
  const isAdmin = role === "admin";
  const isModerationRole = moderationAccess.isModerationRole;
  const canAccessContentModeration = moderationAccess.canAccessContentModeration;
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
  const [selectedTab, setSelectedTab] = useState<ContentTab>("all");
  const [selectedStatuses, setSelectedStatuses] = useState<Array<ContentModerationStatus | "all">>(["all"]);
  const [appliedStatuses, setAppliedStatuses] = useState<Array<ContentModerationStatus | "all">>(["all"]);
  const [selectedSortField, setSelectedSortField] = useState<ContentSortField>("date");
  const [appliedSortField, setAppliedSortField] = useState<ContentSortField>("date");
  const [selectedSortDirection, setSelectedSortDirection] = useState<ContentSortDirection>("desc");
  const [appliedSortDirection, setAppliedSortDirection] = useState<ContentSortDirection>("desc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [moderatorComment, setModeratorComment] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);

  useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const contentQueryKey = ["moderation", "content-items", appliedSearch, selectedTab, appliedStatuses, page] as const;
  const contentQuery = useQuery<ContentModerationListResponse>({
    queryKey: contentQueryKey,
    queryFn: () =>
      listContentModerationItemsRequest({
        search: appliedSearch,
        kinds: selectedTab === "all" ? [] : [selectedTab],
        statuses: appliedStatuses.includes("all")
          ? []
          : (appliedStatuses as ContentModerationStatus[]),
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: isAuthenticated && canAccessContentModeration,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  useNotificationsRealtime({
    enabled: isAuthenticated && canAccessContentModeration,
    onMessage: (payload) => {
      if (payload?.type !== "content_moderation_updated") {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ["moderation", "content-items"] });
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
      setExpandedItemId(null);
      setPage(1);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [appliedSearch, search]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setIsProfileMenuOpen(false);
        setIsProfileMenuPinned(false);
      }

      if (filtersRef.current && !filtersRef.current.contains(target)) {
        setIsFilterOpen(false);
      }

      if (sortingRef.current && !sortingRef.current.contains(target)) {
        setIsSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const handleMutationError = (error: any) => {
    setReviewError(
      error?.response?.data?.error?.message ?? "Не удалось выполнить действие с публикацией. Попробуйте ещё раз.",
    );
  };

  const applyOptimisticUpdate = (itemIds: string[], nextStatus: ContentModerationStatus, comment: string | null) => {
    queryClient.setQueryData<ContentModerationListResponse | undefined>(contentQueryKey, (current) => {
      const currentItems = current?.data?.items;
      if (!currentItems || !current?.data) {
        return current;
      }

      return {
        ...current,
        data: {
          ...current.data,
          items: currentItems.map((item) =>
            itemIds.includes(item.id)
              ? {
                  ...item,
                  status: nextStatus,
                  priority:
                    nextStatus === "approved"
                      ? "approved"
                      : nextStatus === "rejected"
                        ? "rejected"
                        : nextStatus === "changes_requested"
                          ? "changes"
                          : item.priority,
                  moderator_comment: comment,
                }
              : item,
          ),
        },
      };
    });
    setExpandedItemId((current) => (current && itemIds.includes(current) ? null : current));
    setModeratorComment("");
    setSelectedIds((current) => current.filter((id) => !itemIds.includes(id)));
  };

  const applyChecklistOptimisticUpdate = (itemId: string, checklist: ContentModerationChecklist) => {
    queryClient.setQueryData<ContentModerationListResponse | undefined>(contentQueryKey, (current) => {
      const currentItems = current?.data?.items;
      if (!currentItems || !current?.data) {
        return current;
      }

      return {
        ...current,
        data: {
          ...current.data,
          items: currentItems.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  checklist,
                }
              : item,
          ),
        },
      };
    });
  };

  const createReviewMutationHandlers = (nextStatus: ContentModerationStatus) => ({
    onMutate: async ({ itemId, comment }: { itemId: string; comment: string }) => {
      setReviewError(null);
      await queryClient.cancelQueries({ queryKey: contentQueryKey });
      const previousData = queryClient.getQueryData<ContentModerationListResponse | undefined>(contentQueryKey);
      applyOptimisticUpdate([itemId], nextStatus, comment || null);
      return { previousData };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["moderation", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities", "feed"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] }),
      ]);
    },
    onError: (
      error: unknown,
      _variables: { itemId: string; comment: string },
      context: { previousData?: ContentModerationListResponse } | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(contentQueryKey, context.previousData);
      }
      handleMutationError(error);
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ itemId, comment }: { itemId: string; comment: string }) => {
      await approveContentModerationItemRequest(itemId, { moderator_comment: comment || null });
    },
    ...createReviewMutationHandlers("approved"),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ itemId, comment }: { itemId: string; comment: string }) => {
      await rejectContentModerationItemRequest(itemId, { moderator_comment: comment || null });
    },
    ...createReviewMutationHandlers("rejected"),
  });

  const requestChangesMutation = useMutation({
    mutationFn: async ({ itemId, comment }: { itemId: string; comment: string }) => {
      await requestContentModerationChangesRequest(itemId, { moderator_comment: comment || null });
    },
    ...createReviewMutationHandlers("changes_requested"),
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({
      action,
      itemIds,
    }: {
      action: "request-changes" | "reject" | "approve";
      itemIds: string[];
    }) => {
      if (action === "request-changes") {
        await Promise.all(itemIds.map((itemId) =>
          requestContentModerationChangesRequest(itemId, { moderator_comment: null }),
        ));
        return;
      }

      if (action === "reject") {
        await Promise.all(itemIds.map((itemId) =>
          rejectContentModerationItemRequest(itemId, { moderator_comment: null }),
        ));
        return;
      }

      await Promise.all(itemIds.map((itemId) =>
        approveContentModerationItemRequest(itemId, { moderator_comment: null }),
      ));
    },
    onMutate: async ({
      action,
      itemIds,
    }: {
      action: "request-changes" | "reject" | "approve";
      itemIds: string[];
    }) => {
      setReviewError(null);
      await queryClient.cancelQueries({ queryKey: contentQueryKey });
      const previousData = queryClient.getQueryData<ContentModerationListResponse | undefined>(contentQueryKey);
      applyOptimisticUpdate(
        itemIds,
        action === "approve" ? "approved" : action === "reject" ? "rejected" : "changes_requested",
        null,
      );
      return { previousData };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["moderation", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["opportunities", "feed"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] }),
      ]);
    },
    onError: (
      error,
      _variables,
      context: { previousData?: ContentModerationListResponse } | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(contentQueryKey, context.previousData);
      }
      handleMutationError(error);
    },
  });

  const updateChecklistMutation = useMutation({
    mutationFn: async ({
      itemId,
      checklist,
    }: {
      itemId: string;
      checklist: ContentModerationChecklist;
    }) => updateContentModerationChecklistRequest(itemId, checklist),
    onMutate: async ({
      itemId,
      checklist,
    }: {
      itemId: string;
      checklist: ContentModerationChecklist;
    }) => {
      setReviewError(null);
      await queryClient.cancelQueries({ queryKey: contentQueryKey });
      const previousData = queryClient.getQueryData<ContentModerationListResponse | undefined>(contentQueryKey);
      applyChecklistOptimisticUpdate(itemId, checklist);
      return { previousData };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["moderation", "content-items"] });
    },
    onError: (
      error,
      _variables,
      context: { previousData?: ContentModerationListResponse } | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(contentQueryKey, context.previousData);
      }
      handleMutationError(error);
    },
  });

  const items = contentQuery.data?.data?.items ?? [];
  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      if (appliedSortField === "alphabet") {
        const comparison = left.title.localeCompare(right.title, "ru");
        return appliedSortDirection === "asc" ? comparison : -comparison;
      }

      const leftTime = new Date(left.submitted_at).getTime();
      const rightTime = new Date(right.submitted_at).getTime();
      return appliedSortDirection === "desc" ? rightTime - leftTime : leftTime - rightTime;
    });
  }, [appliedSortDirection, appliedSortField, items]);

  const total = contentQuery.data?.data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const pageNumbers = buildPageNumbers(page, totalPages);
  const allRowsSelected = sortedItems.length > 0 && selectedIds.length === sortedItems.length;
  const currentExpandedItem = sortedItems.find((item) => item.id === expandedItemId) ?? null;
  const anyMutationPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    requestChangesMutation.isPending ||
    bulkActionMutation.isPending ||
    updateChecklistMutation.isPending;
  const isTableLoading = contentQuery.isPending;
  const counts = useMemo(() => {
    return {
      all: contentQuery.data?.data?.counts?.all ?? 0,
      vacancies: contentQuery.data?.data?.counts?.vacancies ?? 0,
      internships: contentQuery.data?.data?.counts?.internships ?? 0,
      events: contentQuery.data?.data?.counts?.events ?? 0,
      mentorships: contentQuery.data?.data?.counts?.mentorships ?? 0,
    };
  }, [contentQuery.data?.data?.counts]);
  const metrics = useMemo(() => {
    return {
      total_on_moderation: contentQuery.data?.data?.metrics?.total_on_moderation ?? 0,
      in_queue: contentQuery.data?.data?.metrics?.in_queue ?? 0,
      reviewed_today: contentQuery.data?.data?.metrics?.reviewed_today ?? 0,
      overdue: contentQuery.data?.data?.metrics?.overdue ?? 0,
    };
  }, [contentQuery.data?.data?.metrics]);

  if (!canAccessContentModeration) {
    return <Navigate to={moderationAccess.isModerationRole ? "/dashboard/curator" : "/"} replace />;
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

  const profileMenuItems = buildModerationProfileMenuItems();

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
    setAppliedStatuses(selectedStatuses);
    setSelectedIds([]);
    setExpandedItemId(null);
    setPage(1);
    setIsFilterOpen(false);
  };

  const resetFilters = () => {
    setSelectedStatuses(["all"]);
    setAppliedStatuses(["all"]);
    setSelectedIds([]);
    setExpandedItemId(null);
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
    setSelectedSortField("date");
    setAppliedSortField("date");
    setSelectedSortDirection("desc");
    setAppliedSortDirection("desc");
    setSelectedIds([]);
    setPage(1);
    setIsSortOpen(false);
  };

  const toggleSelectedId = (itemId: string) => {
    setSelectedIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  };

  const toggleSelectAll = () => {
    setSelectedIds(allRowsSelected ? [] : sortedItems.map((item) => item.id));
  };

  const handleExpand = (item: ContentModerationItem) => {
    setExpandedItemId((current) => (current === item.id ? null : item.id));
    setModeratorComment(item.moderator_comment ?? "");
  };

  const handleRowClick = (event: ReactMouseEvent<HTMLElement>, item: ContentModerationItem) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, label")) {
      return;
    }

    handleExpand(item);
  };

  const handleApprove = (itemId: string) => {
    approveMutation.mutate({ itemId, comment: moderatorComment });
  };

  const handleReject = (itemId: string) => {
    rejectMutation.mutate({ itemId, comment: moderatorComment });
  };

  const handleRequestChanges = (itemId: string) => {
    requestChangesMutation.mutate({ itemId, comment: moderatorComment });
  };

  const handleChecklistChange = (
    itemId: string,
    currentChecklist: ContentModerationChecklist,
    field: keyof ContentModerationChecklist,
  ) => {
    updateChecklistMutation.mutate({
      itemId,
      checklist: {
        ...currentChecklist,
        [field]: !currentChecklist[field],
      },
    });
  };

  const handleBulkAction = (action: "request-changes" | "reject" | "approve") => {
    if (selectedIds.length === 0) {
      return;
    }

    bulkActionMutation.mutate({ action, itemIds: selectedIds });
  };

  return (
    <main className={`content-moderation-page content-moderation-page--${themeRole}`}>
      <Header
        containerClassName="home-page__container"
        profileMenuItems={profileMenuItems}
        theme="curator"
        topNavigation={null}
        bottomContent={<CuratorHeaderNavigation isAdmin={isAdmin} currentPage="content" />}
      />

      <Container className="content-moderation-page__container">
        <header className="content-moderation-page__header">
          <h1 className="content-moderation-page__title">Модерация контента</h1>
        </header>

        <section className="content-moderation-page__metrics" aria-label="Статистика модерации контента">
          {contentQuery.isPending ? (
            <>
              <ContentModerationMetricSkeleton label="Всего на модерации:" />
              <ContentModerationMetricSkeleton label="В очереди:" />
              <ContentModerationMetricSkeleton label="Сегодня проверено:" />
              <ContentModerationMetricSkeleton label="Просрочено:" />
            </>
          ) : (
            <>
              <article className="content-moderation-page__metric-card">
                <span className="content-moderation-page__metric-label">Всего на модерации:</span>
                <strong className="content-moderation-page__metric-value">{metrics?.total_on_moderation ?? 0}</strong>
              </article>
              <article className="content-moderation-page__metric-card">
                <span className="content-moderation-page__metric-label">В очереди:</span>
                <strong className="content-moderation-page__metric-value">{metrics?.in_queue ?? 0}</strong>
              </article>
              <article className="content-moderation-page__metric-card">
                <span className="content-moderation-page__metric-label">Сегодня проверено:</span>
                <strong className="content-moderation-page__metric-value">{metrics?.reviewed_today ?? 0}</strong>
              </article>
              <article className="content-moderation-page__metric-card">
                <span className="content-moderation-page__metric-label">Просрочено:</span>
                <strong className="content-moderation-page__metric-value">{metrics?.overdue ?? 0}</strong>
              </article>
            </>
          )}
        </section>

        <div className="content-moderation-page__tabs" role="tablist" aria-label="Типы контента">
          {tabDefinitions.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={
                selectedTab === tab.value
                  ? "content-moderation-page__tab content-moderation-page__tab--active"
                  : "content-moderation-page__tab"
              }
              onClick={() => {
                setSelectedTab(tab.value);
                setSelectedIds([]);
                setExpandedItemId(null);
                setPage(1);
              }}
            >
              {tab.label} ({counts?.[tab.countKey] ?? 0})
            </button>
          ))}
        </div>

        <section className="content-moderation-page__toolbar">
          <label className="content-moderation-page__search header__search" aria-label="Поиск публикаций">
            <Input
              type="search"
              placeholder="Поиск"
              className="input--sm content-moderation-page__search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="content-moderation-page__toolbar-actions">
            <div ref={filtersRef} className="content-moderation-page__filters">
              <button
                type="button"
                className="content-moderation-page__icon-button content-moderation-page__icon-button--filter"
                aria-label="Фильтры"
                aria-expanded={isFilterOpen}
                onClick={() => {
                  setIsSortOpen(false);
                  setIsFilterOpen((current) => !current);
                }}
              />

              {isFilterOpen ? (
                <div className="content-moderation-page__filters-popover">
                  <div className="content-moderation-page__filters-section">
                    <div className="content-moderation-page__filters-head">
                      <h2 className="content-moderation-page__filters-title">Фильтры</h2>
                      <button type="button" className="content-moderation-page__filters-reset" onClick={resetFilters}>
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="content-moderation-page__filters-section">
                    <div className="content-moderation-page__filters-head">
                      <h3 className="content-moderation-page__filters-group-title">По статусу</h3>
                      <button
                        type="button"
                        className="content-moderation-page__filters-reset"
                        onClick={() => setSelectedStatuses(["all"])}
                      >
                        Сбросить
                      </button>
                    </div>

                    <div className="content-moderation-page__filters-options content-moderation-page__filters-options--checkboxes">
                      <label className="content-moderation-page__filter-option">
                        <Checkbox checked={selectedStatuses.includes("all")} onChange={() => toggleFilterValue("all", setSelectedStatuses)} variant="accent" />
                        <span>Все</span>
                      </label>
                      {statusOptions.map((option) => (
                        <label key={option.value} className="content-moderation-page__filter-option">
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

                  <div className="content-moderation-page__filters-footer">
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

            <div ref={sortingRef} className="content-moderation-page__sorting">
              <button
                type="button"
                className="content-moderation-page__icon-button content-moderation-page__icon-button--sorting"
                aria-label="Сортировка"
                aria-expanded={isSortOpen}
                onClick={() => {
                  setIsFilterOpen(false);
                  setIsSortOpen((current) => !current);
                }}
              >
                <span
                  className={
                    appliedSortDirection === "desc"
                      ? "content-moderation-page__icon content-moderation-page__icon--descending"
                      : "content-moderation-page__icon content-moderation-page__icon--ascending"
                  }
                  aria-hidden="true"
                />
              </button>

              {isSortOpen ? (
                <div className="content-moderation-page__sorting-popover">
                  <div className="content-moderation-page__filters-section">
                    <div className="content-moderation-page__filters-head">
                      <h2 className="content-moderation-page__filters-title">Сортировка</h2>
                      <button type="button" className="content-moderation-page__filters-reset" onClick={resetSorting}>
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="content-moderation-page__filters-section">
                    <div className="content-moderation-page__filters-options content-moderation-page__filters-options--radio">
                      {sortFieldOptions.map((option) => (
                        <label key={option.value} className="content-moderation-page__filter-option">
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

                  <div className="content-moderation-page__filters-section">
                    <div className="content-moderation-page__filters-options content-moderation-page__filters-options--radio">
                      <label className="content-moderation-page__filter-option">
                        <Radio checked={selectedSortDirection === "desc"} onChange={() => setSelectedSortDirection("desc")} variant="accent" />
                        <span>{selectedSortField === "alphabet" ? "Я-А" : "Сначала новые"}</span>
                      </label>
                      <label className="content-moderation-page__filter-option">
                        <Radio checked={selectedSortDirection === "asc"} onChange={() => setSelectedSortDirection("asc")} variant="accent" />
                        <span>{selectedSortField === "alphabet" ? "А-Я" : "Сначала старые"}</span>
                      </label>
                    </div>
                  </div>

                  <div className="content-moderation-page__filters-footer">
                    <Button type="button" variant="accent" size="sm" fullWidth onClick={applySorting}>
                      Применить
                    </Button>
                    <Button type="button" variant="accent-outline" size="sm" fullWidth onClick={resetSorting}>
                      Сбросить
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div
          className={
            selectedIds.length > 0
              ? "content-moderation-page__bulk-bar-shell content-moderation-page__bulk-bar-shell--visible"
              : "content-moderation-page__bulk-bar-shell"
          }
        >
          <div className="content-moderation-page__bulk-bar">
            <div className="content-moderation-page__bulk-bar-selection">
              <Checkbox checked variant="accent" readOnly />
              <span className="content-moderation-page__bulk-bar-count">Выбрано: {selectedIds.length}</span>
            </div>
            <div className="content-moderation-page__bulk-bar-actions">
              <Button type="button" variant="accent-outline" size="md" className="content-moderation-page__bulk-bar-button" onClick={() => handleBulkAction("request-changes")} loading={bulkActionMutation.isPending} disabled={anyMutationPending}>
                Запросить правки
              </Button>
              <Button type="button" variant="danger" size="md" className="content-moderation-page__bulk-bar-button" onClick={() => handleBulkAction("reject")} loading={bulkActionMutation.isPending} disabled={anyMutationPending}>
                Отклонить
              </Button>
              <Button type="button" variant="success" size="md" className="content-moderation-page__bulk-bar-button" onClick={() => handleBulkAction("approve")} loading={bulkActionMutation.isPending} disabled={anyMutationPending}>
                Одобрить
              </Button>
            </div>
          </div>
        </div>

        {reviewError ? <p className="content-moderation-page__review-error">{reviewError}</p> : null}

        <section className="content-moderation-page__content">
          <div className="content-moderation-page__table-head">
            <div className="content-moderation-page__table-cell content-moderation-page__table-cell--check">
              <Checkbox checked={allRowsSelected} onChange={toggleSelectAll} variant="accent" />
            </div>
            <div className="content-moderation-page__table-cell content-moderation-page__table-cell--content">Контент</div>
            <div className="content-moderation-page__table-cell content-moderation-page__table-cell--company">Компания</div>
            <div className="content-moderation-page__table-cell content-moderation-page__table-cell--author">Автор</div>
            <div className="content-moderation-page__table-cell content-moderation-page__table-cell--date">Дата</div>
            <div className="content-moderation-page__table-cell content-moderation-page__table-cell--status">Статус</div>
            <div className="content-moderation-page__table-cell content-moderation-page__table-cell--actions">Действия</div>
          </div>

          <div className="content-moderation-page__rows">
            {isTableLoading
              ? Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                  <ContentModerationRowSkeleton key={`content-skeleton-${index}`} />
                ))
              : sortedItems.map((item) => {
                  const statusMeta = resolveStatusMeta(item.status);
                  const isExpanded = expandedItemId === item.id;
                  const canReview = item.status === "pending_review";

                  return (
                    <article
                      key={item.id}
                      className="content-moderation-page__row"
                      onClick={(event) => handleRowClick(event, item)}
                    >
                      <div className={isExpanded
                        ? "content-moderation-page__row-summary content-moderation-page__row-summary--expanded"
                        : !canReview
                          ? "content-moderation-page__row-summary content-moderation-page__row-summary--centered"
                          : "content-moderation-page__row-summary"}>
                        <div className="content-moderation-page__row-leading">
                          <Checkbox checked={selectedIds.includes(item.id)} onChange={() => toggleSelectedId(item.id)} variant="accent" />
                        </div>

                        <div className="content-moderation-page__row-main">
                          <div className="content-moderation-page__row-title-wrap">
                            <strong className="content-moderation-page__row-title">{item.title}</strong>
                            {!isExpanded && canReview ? (
                              <div className="content-moderation-page__row-actions-inline">
                                <Button
                                  type="button"
                                  variant="success-ghost"
                                  size="sm"
                                  className="content-moderation-page__row-action content-moderation-page__row-action--approve"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    approveMutation.mutate({ itemId: item.id, comment: "" });
                                  }}
                                  disabled={anyMutationPending}
                                >
                                  <span>Одобрить</span>
                                  <span
                                    aria-hidden="true"
                                    className="content-moderation-page__action-icon content-moderation-page__action-icon--approve"
                                  />
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger-ghost"
                                  size="sm"
                                  className="content-moderation-page__row-action content-moderation-page__row-action--reject"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    rejectMutation.mutate({ itemId: item.id, comment: "" });
                                  }}
                                  disabled={anyMutationPending}
                                >
                                  <span>Отклонить</span>
                                  <span
                                    aria-hidden="true"
                                    className="content-moderation-page__action-icon content-moderation-page__action-icon--reject"
                                  />
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          <div className="content-moderation-page__row-company">{item.company_name}</div>
                          <div className="content-moderation-page__row-author">{item.author_email ?? "Не указано"}</div>
                          <div className="content-moderation-page__row-date">{formatSubmissionDate(item.submitted_at)}</div>
                          <div className="content-moderation-page__row-status">
                            <Status variant={statusMeta.variant}>{statusMeta.label}</Status>
                          </div>
                          <div className="content-moderation-page__row-actions">
                            <button
                              type="button"
                              className="content-moderation-page__action-button"
                              aria-label={`Открыть ${item.title}`}
                              onClick={() => handleExpand(item)}
                            >
                              <img src={editIcon} alt="" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className={isExpanded ? "content-moderation-page__row-details-shell content-moderation-page__row-details-shell--expanded" : "content-moderation-page__row-details-shell"} aria-hidden={!isExpanded}>
                        <div className="content-moderation-page__row-details">
                          <div className="content-moderation-page__details-grid">
                            <div className="content-moderation-page__details-column">
                              <div className="content-moderation-page__detail">
                                <div className="content-moderation-page__detail-label">Опубликовано</div>
                                <div className="content-moderation-page__detail-value">{formatSubmissionDateTime(item.submitted_at)}</div>
                              </div>
                              <div className="content-moderation-page__detail">
                                <div className="content-moderation-page__detail-label">Зарплата</div>
                                <div className="content-moderation-page__detail-value">{item.salary_label}</div>
                              </div>
                              <div className="content-moderation-page__detail">
                                <div className="content-moderation-page__detail-label">Навыки</div>
                                <div className="content-moderation-page__tags">
                                  {item.tags.length > 0 ? item.tags.map((tag) => (
                                    <span key={tag} className="content-moderation-page__tag">{tag}</span>
                                  )) : <span className="content-moderation-page__detail-value">Не указано</span>}
                                </div>
                              </div>
                              <div className="content-moderation-page__detail">
                                <div className="content-moderation-page__detail-label">Формат</div>
                                <div className="content-moderation-page__detail-value">{item.format_label}</div>
                              </div>
                              <div className="content-moderation-page__detail">
                                <div className="content-moderation-page__detail-label">Краткое описание</div>
                                <div className="content-moderation-page__detail-rich-text">{item.short_description}</div>
                              </div>
                              <div className="content-moderation-page__detail">
                                <div className="content-moderation-page__detail-label">Описание</div>
                                <div className="content-moderation-page__detail-rich-text">{item.description}</div>
                              </div>
                            </div>

                            <div className="content-moderation-page__details-column content-moderation-page__details-column--actions">
                              <div className="content-moderation-page__review-card">
                                <div className="content-moderation-page__review-title">Проверка: {[
                                  item.checklist.salary_specified,
                                  item.checklist.requirements_completed,
                                  item.checklist.responsibilities_completed,
                                  item.checklist.conditions_specified,
                                ].filter(Boolean).length}/4</div>
                                <div className="content-moderation-page__checklist">
                                  {[
                                    ["Зарплата указана", item.checklist.salary_specified],
                                    ["Требования заполнены", item.checklist.requirements_completed],
                                    ["Обязанности описаны", item.checklist.responsibilities_completed],
                                    ["Условия указаны", item.checklist.conditions_specified],
                                  ].map(([label, checked], index) => (
                                    <label key={String(label)} className="content-moderation-page__checklist-item">
                                      <Checkbox checked={Boolean(checked)} onChange={() => handleChecklistChange(item.id, item.checklist, (["salary_specified", "requirements_completed", "responsibilities_completed", "conditions_specified"] as const)[index])} variant="accent" disabled={updateChecklistMutation.isPending} />
                                      <span>{label}</span>
                                    </label>
                                  ))}
                                </div>

                                <label className="content-moderation-page__comment-field">
                                  <span className="content-moderation-page__detail-label">Комментарий</span>
                                  <textarea
                                    className="content-moderation-page__comment-input"
                                    value={currentExpandedItem?.id === item.id ? moderatorComment : item.moderator_comment ?? ""}
                                    onChange={(event) => setModeratorComment(event.target.value)}
                                    placeholder=""
                                  />
                                </label>

                                {canReview ? (
                                  <div className="content-moderation-page__detail-actions content-moderation-page__detail-actions--stacked">
                                    <Button type="button" variant="accent-outline" size="sm" className="content-moderation-page__detail-action-request" onClick={() => handleRequestChanges(item.id)} loading={requestChangesMutation.isPending && currentExpandedItem?.id === item.id} disabled={anyMutationPending}>
                                      Запросить дополнительную информацию
                                    </Button>
                                    <div className="content-moderation-page__detail-actions-group">
                                      <Button type="button" variant="danger" size="sm" className="content-moderation-page__decision-button" onClick={() => handleReject(item.id)} loading={rejectMutation.isPending && currentExpandedItem?.id === item.id} disabled={anyMutationPending}>
                                        Отклонить
                                      </Button>
                                      <Button type="button" variant="success" size="sm" className="content-moderation-page__decision-button" onClick={() => handleApprove(item.id)} loading={approveMutation.isPending && currentExpandedItem?.id === item.id} disabled={anyMutationPending}>
                                        Одобрить
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}

            {!isTableLoading && isAuthenticated && sortedItems.length === 0 ? (
              <div className="content-moderation-page__empty">По выбранным параметрам публикации не найдены.</div>
            ) : null}
          </div>

          {!isTableLoading && sortedItems.length > 0 ? (
            <nav className="content-moderation-page__pagination" aria-label="Пагинация">
              <button
                type="button"
                className="content-moderation-page__pagination-arrow"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page === 1}
                aria-label="Предыдущая страница"
              >
                <img
                  src={arrowIcon}
                  alt=""
                  aria-hidden="true"
                  className="content-moderation-page__pagination-arrow-icon content-moderation-page__pagination-arrow-icon--prev"
                />
              </button>
              {pageNumbers.map((pageNumber, index) =>
                pageNumber === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="content-moderation-page__pagination-ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    key={pageNumber}
                    type="button"
                    className={
                      page === pageNumber
                        ? "content-moderation-page__pagination-page content-moderation-page__pagination-page--active"
                        : "content-moderation-page__pagination-page"
                    }
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ),
              )}
              <button
                type="button"
                className="content-moderation-page__pagination-arrow"
                onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                disabled={page === totalPages}
                aria-label="Следующая страница"
              >
                <img
                  src={arrowIcon}
                  alt=""
                  aria-hidden="true"
                  className="content-moderation-page__pagination-arrow-icon"
                />
              </button>
            </nav>
          ) : null}
        </section>
      </Container>

      <Footer theme={themeRole} />
    </main>
  );
}
