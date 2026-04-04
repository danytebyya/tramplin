import { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction, useEffect, useMemo, useRef, useState } from "react";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Navigate, useNavigate } from "react-router-dom";

import arrowIcon from "../../assets/icons/arrow.svg";
import editIcon from "../../assets/icons/edit.svg";
import sadSearchIcon from "../../assets/icons/sad-search.png";
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

function easeOutQuad(value: number) {
  return 1 - (1 - value) * (1 - value);
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

function hasSelectedText() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.getSelection()?.toString().trim());
}

function stopCheckboxEvent(event: ReactMouseEvent<HTMLInputElement>) {
  event.stopPropagation();
}

function ContentModerationMetricSkeleton({ label }: { label: string }) {
  return (
    <article className="moderation-queue-page__metric-card stats-panel__card" aria-hidden="true">
      <span className="moderation-queue-page__metric-label stats-panel__label">{label}</span>
      <span className="moderation-queue-page__skeleton moderation-queue-page__skeleton--metric-value" />
    </article>
  );
}

function ContentModerationRowSkeleton() {
  return (
    <article className="moderation-queue-page__submission moderation-queue-page__submission--skeleton" aria-hidden="true">
      <div className="moderation-queue-page__submission-summary">
        <div className="moderation-queue-page__submission-select" />
        <div className="moderation-queue-page__submission-overview">
          <span className="moderation-queue-page__skeleton moderation-queue-page__skeleton--title" />
          <span className="moderation-queue-page__skeleton moderation-queue-page__skeleton--cell" />
          <span className="moderation-queue-page__skeleton moderation-queue-page__skeleton--cell" />
          <span className="moderation-queue-page__skeleton moderation-queue-page__skeleton--cell" />
          <span className="moderation-queue-page__skeleton moderation-queue-page__skeleton--badge" />
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
  const selectableItems = useMemo(
    () => sortedItems.filter((item) => item.status === "pending_review" || item.status === "changes_requested"),
    [sortedItems],
  );
  const allRowsSelected =
    selectableItems.length > 0 && selectableItems.every((item) => selectedIds.includes(item.id));
  const currentExpandedItem = sortedItems.find((item) => item.id === expandedItemId) ?? null;
  const selectedItemsForBulkActions = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    return sortedItems.filter((item) => selectedIdSet.has(item.id));
  }, [selectedIds, sortedItems]);
  const anyMutationPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    requestChangesMutation.isPending ||
    bulkActionMutation.isPending ||
    updateChecklistMutation.isPending;
  const isBulkRequestChangesDisabled =
    anyMutationPending || selectedItemsForBulkActions.some((item) => item.status === "changes_requested");
  const isBulkRejectDisabled =
    anyMutationPending || selectedItemsForBulkActions.some((item) => item.status === "rejected");
  const isBulkApproveDisabled =
    anyMutationPending || selectedItemsForBulkActions.some((item) => item.status === "approved");
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

  const profileMenuItems = buildModerationProfileMenuItems(navigate);

  useEffect(() => {
    if (!isFilterOpen) {
      return;
    }

    let scrollAnimationFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      const filtersElement = filtersRef.current;
      if (!filtersElement) {
        return;
      }

      const viewportPadding = 16;
      const rect = filtersElement.getBoundingClientRect();
      const startScrollY = window.scrollY;
      const targetScrollY = Math.max(startScrollY + rect.top - viewportPadding, 0);
      const distance = targetScrollY - startScrollY;

      if (Math.abs(distance) < 4) {
        return;
      }

      const duration = 620;
      const animationStart = window.performance.now();

      const animateScroll = (currentTime: number) => {
        const elapsed = currentTime - animationStart;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutQuad(progress);

        window.scrollTo({
          top: startScrollY + distance * easedProgress,
          behavior: "auto",
        });

        if (progress < 1) {
          scrollAnimationFrameId = window.requestAnimationFrame(animateScroll);
        }
      };

      scrollAnimationFrameId = window.requestAnimationFrame(animateScroll);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(scrollAnimationFrameId);
    };
  }, [isFilterOpen]);

  useEffect(() => {
    if (!isSortOpen) {
      return;
    }

    let scrollAnimationFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      const sortingElement = sortingRef.current;
      if (!sortingElement) {
        return;
      }

      const viewportPadding = 16;
      const rect = sortingElement.getBoundingClientRect();
      const startScrollY = window.scrollY;
      const targetScrollY = Math.max(startScrollY + rect.top - viewportPadding, 0);
      const distance = targetScrollY - startScrollY;

      if (Math.abs(distance) < 4) {
        return;
      }

      const duration = 620;
      const animationStart = window.performance.now();

      const animateScroll = (currentTime: number) => {
        const elapsed = currentTime - animationStart;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutQuad(progress);

        window.scrollTo({
          top: startScrollY + distance * easedProgress,
          behavior: "auto",
        });

        if (progress < 1) {
          scrollAnimationFrameId = window.requestAnimationFrame(animateScroll);
        }
      };

      scrollAnimationFrameId = window.requestAnimationFrame(animateScroll);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(scrollAnimationFrameId);
    };
  }, [isSortOpen]);

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
    const targetItem = sortedItems.find((item) => item.id === itemId);
    if (!targetItem || (targetItem.status !== "pending_review" && targetItem.status !== "changes_requested")) {
      return;
    }

    setSelectedIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  };

  const toggleSelectAll = () => {
    setSelectedIds(allRowsSelected ? [] : selectableItems.map((item) => item.id));
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

    if (hasSelectedText()) {
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
    <main className={`moderation-queue-page moderation-queue-page--${themeRole}`}>
      <Header
        containerClassName="home-page__shell"
        profileMenuItems={profileMenuItems}
        theme="curator"
        topNavigation={null}
        bottomContent={<CuratorHeaderNavigation isAdmin={isAdmin} currentPage="content" />}
      />

      <Container className="moderation-queue-page__shell">
        <header className="moderation-queue-page__header">
          <h1 className="moderation-queue-page__title">Модерация контента</h1>
        </header>

        <section className="moderation-queue-page__metrics stats-panel" aria-label="Статистика модерации контента">
          {contentQuery.isPending ? (
            <>
              <ContentModerationMetricSkeleton label="Всего на модерации:" />
              <ContentModerationMetricSkeleton label="В очереди:" />
              <ContentModerationMetricSkeleton label="Сегодня проверено:" />
              <ContentModerationMetricSkeleton label="Просрочено:" />
            </>
          ) : (
            <>
              <article className="moderation-queue-page__metric-card stats-panel__card">
                <span className="moderation-queue-page__metric-label stats-panel__label">Всего на модерации:</span>
                <strong className="moderation-queue-page__metric-value stats-panel__value">{metrics?.total_on_moderation ?? 0}</strong>
              </article>
              <article className="moderation-queue-page__metric-card stats-panel__card">
                <span className="moderation-queue-page__metric-label stats-panel__label">В очереди:</span>
                <strong className="moderation-queue-page__metric-value stats-panel__value">{metrics?.in_queue ?? 0}</strong>
              </article>
              <article className="moderation-queue-page__metric-card stats-panel__card">
                <span className="moderation-queue-page__metric-label stats-panel__label">Сегодня проверено:</span>
                <strong className="moderation-queue-page__metric-value stats-panel__value">{metrics?.reviewed_today ?? 0}</strong>
              </article>
              <article className="moderation-queue-page__metric-card stats-panel__card">
                <span className="moderation-queue-page__metric-label stats-panel__label">Просрочено:</span>
                <strong className="moderation-queue-page__metric-value stats-panel__value">{metrics?.overdue ?? 0}</strong>
              </article>
            </>
          )}
        </section>

        <div className="moderation-queue-page__tabs" role="tablist" aria-label="Типы контента">
          {tabDefinitions.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={
                selectedTab === tab.value
                  ? "moderation-queue-page__tab moderation-queue-page__tab--active"
                  : "moderation-queue-page__tab"
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

        <section className="moderation-queue-page__toolbar">
          <label className="moderation-queue-page__search header__search" aria-label="Поиск публикаций">
            <Input
              type="search"
              placeholder="Поиск"
              className="input--sm moderation-queue-page__search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="moderation-queue-page__toolbar-actions">
            <div ref={filtersRef} className="moderation-queue-page__filters">
              <button
                type="button"
                className="moderation-queue-page__icon-button moderation-queue-page__icon-button--filter"
                aria-label="Фильтры"
                aria-expanded={isFilterOpen}
                onClick={() => {
                  setIsSortOpen(false);
                  setIsFilterOpen((current) => !current);
                }}
              >
                <span
                  className={
                    isFilterOpen
                      ? "moderation-queue-page__icon moderation-queue-page__icon--filter-open"
                      : "moderation-queue-page__icon moderation-queue-page__icon--filter"
                  }
                  aria-hidden="true"
                />
              </button>

              {isFilterOpen ? (
                <div className="moderation-queue-page__filters-popover">
                  <div className="moderation-queue-page__filters-section">
                    <div className="moderation-queue-page__filters-head">
                      <h2 className="moderation-queue-page__filters-title">Фильтры</h2>
                      <button type="button" className="moderation-queue-page__filters-reset" onClick={resetFilters}>
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="moderation-queue-page__filters-section">
                    <div className="moderation-queue-page__filters-head">
                      <h3 className="moderation-queue-page__filters-group-title">По статусу</h3>
                      <button
                        type="button"
                        className="moderation-queue-page__filters-reset"
                        onClick={() => setSelectedStatuses(["all"])}
                      >
                        Сбросить
                      </button>
                    </div>

                    <div className="moderation-queue-page__filters-options moderation-queue-page__filters-options--choices">
                      <label className="moderation-queue-page__filter-option">
                        <Checkbox checked={selectedStatuses.includes("all")} onChange={() => toggleFilterValue("all", setSelectedStatuses)} variant="accent" />
                        <span>Все</span>
                      </label>
                      {statusOptions.map((option) => (
                        <label key={option.value} className="moderation-queue-page__filter-option">
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

                  <div className="moderation-queue-page__filters-footer">
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

            <div ref={sortingRef} className="moderation-queue-page__sorting">
              <button
                type="button"
                className="moderation-queue-page__icon-button moderation-queue-page__icon-button--sorting"
                aria-label="Сортировка"
                aria-expanded={isSortOpen}
                onClick={() => {
                  setIsFilterOpen(false);
                  setIsSortOpen((current) => !current);
                }}
              >
                <span className="moderation-queue-page__icon-stack" aria-hidden="true">
                  <span
                    className={
                      isSortOpen
                        ? `moderation-queue-page__icon ${appliedSortDirection === "desc" ? "moderation-queue-page__icon--sorting" : "moderation-queue-page__icon--sorting moderation-queue-page__icon--ascending"} moderation-queue-page__icon--hidden`
                        : appliedSortDirection === "desc"
                          ? "moderation-queue-page__icon moderation-queue-page__icon--sorting"
                          : "moderation-queue-page__icon moderation-queue-page__icon--sorting moderation-queue-page__icon--ascending"
                    }
                  />
                  <span
                    className={
                      isSortOpen
                        ? "moderation-queue-page__icon moderation-queue-page__icon--filter-open moderation-queue-page__icon--visible"
                        : "moderation-queue-page__icon moderation-queue-page__icon--filter-open moderation-queue-page__icon--hidden"
                    }
                  />
                </span>
              </button>

              {isSortOpen ? (
                <div className="moderation-queue-page__sorting-popover">
                  <div className="moderation-queue-page__filters-section">
                    <div className="moderation-queue-page__filters-head">
                      <h2 className="moderation-queue-page__filters-title">Сортировка</h2>
                      <button type="button" className="moderation-queue-page__filters-reset" onClick={resetSorting}>
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="moderation-queue-page__filters-section">
                    <div className="moderation-queue-page__filters-options moderation-queue-page__filters-options--radio">
                      {sortFieldOptions.map((option) => (
                        <label key={option.value} className="moderation-queue-page__filter-option">
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

                  <div className="moderation-queue-page__filters-section">
                    <div className="moderation-queue-page__filters-options moderation-queue-page__filters-options--radio">
                      <label className="moderation-queue-page__filter-option">
                        <Radio checked={selectedSortDirection === "asc"} onChange={() => setSelectedSortDirection("asc")} variant="accent" />
                        <span>{selectedSortField === "alphabet" ? "А-Я" : "Сначала старые"}</span>
                      </label>
                      <label className="moderation-queue-page__filter-option">
                        <Radio checked={selectedSortDirection === "desc"} onChange={() => setSelectedSortDirection("desc")} variant="accent" />
                        <span>{selectedSortField === "alphabet" ? "Я-А" : "Сначала новые"}</span>
                      </label>
                    </div>
                  </div>

                  <div className="moderation-queue-page__filters-footer">
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
              ? "moderation-queue-page__bulk-bar-shell moderation-queue-page__bulk-bar-shell--visible"
              : "moderation-queue-page__bulk-bar-shell"
          }
        >
          <div className="moderation-queue-page__bulk-bar">
            <div className="moderation-queue-page__bulk-bar-selection">
              <Checkbox checked variant="accent" readOnly />
              <span className="moderation-queue-page__bulk-bar-count">Выбрано: {selectedIds.length}</span>
            </div>
            <div className="moderation-queue-page__bulk-bar-actions">
              <Button type="button" variant="accent-outline" size="md" className="moderation-queue-page__bulk-bar-button" onClick={() => handleBulkAction("request-changes")} loading={bulkActionMutation.isPending} disabled={isBulkRequestChangesDisabled}>
                Запросить правки
              </Button>
              <Button type="button" variant="danger" size="md" className="moderation-queue-page__bulk-bar-button" onClick={() => handleBulkAction("reject")} loading={bulkActionMutation.isPending} disabled={isBulkRejectDisabled}>
                Отклонить
              </Button>
              <Button type="button" variant="success" size="md" className="moderation-queue-page__bulk-bar-button" onClick={() => handleBulkAction("approve")} loading={bulkActionMutation.isPending} disabled={isBulkApproveDisabled}>
                Одобрить
              </Button>
            </div>
          </div>
        </div>

        {reviewError ? <p className="moderation-queue-page__review-error">{reviewError}</p> : null}

        <section className="moderation-queue-page__records">
          <div className="moderation-queue-page__table-head">
            <div className="moderation-queue-page__table-cell moderation-queue-page__table-cell--check">
              <Checkbox
                checked={allRowsSelected}
                onChange={toggleSelectAll}
                onClick={stopCheckboxEvent}
                onMouseDown={stopCheckboxEvent}
                variant="accent"
                disabled={selectableItems.length === 0}
              />
            </div>
            <div className="moderation-queue-page__table-cell moderation-queue-page__table-cell--subject">Контент</div>
            <div className="moderation-queue-page__table-cell moderation-queue-page__table-cell--company">Компания</div>
            <div className="moderation-queue-page__table-cell moderation-queue-page__table-cell--author">Автор</div>
            <div className="moderation-queue-page__table-cell moderation-queue-page__table-cell--date">Дата</div>
            <div className="moderation-queue-page__table-cell moderation-queue-page__table-cell--status">Статус</div>
            <div className="moderation-queue-page__table-cell moderation-queue-page__table-cell--actions">Действия</div>
          </div>

          <div className="moderation-queue-page__submissions">
            {isTableLoading
              ? Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                  <ContentModerationRowSkeleton key={`content-skeleton-${index}`} />
                ))
              : sortedItems.map((item) => {
                  const statusMeta = resolveStatusMeta(item.status);
                  const isExpanded = expandedItemId === item.id;
                  const canReview = item.status === "pending_review";
                  const canEditChecklist = item.status === "pending_review" || item.status === "changes_requested";
                  const isSelectable = item.status === "pending_review" || item.status === "changes_requested";

                  return (
                    <article
                      key={item.id}
                      className="moderation-queue-page__submission"
                      onClick={(event) => handleRowClick(event, item)}
                    >
                      <div className={isExpanded
                        ? "moderation-queue-page__submission-summary moderation-queue-page__submission-summary--expanded"
                        : !canReview
                          ? "moderation-queue-page__submission-summary moderation-queue-page__submission-summary--centered"
                          : "moderation-queue-page__submission-summary"}>
                        <div className="moderation-queue-page__submission-select">
                          <Checkbox
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelectedId(item.id)}
                            onClick={stopCheckboxEvent}
                            onMouseDown={stopCheckboxEvent}
                            variant="accent"
                            disabled={!isSelectable}
                          />
                        </div>

                        <div className="moderation-queue-page__submission-overview">
                          <div className="moderation-queue-page__submission-heading">
                            <strong className="moderation-queue-page__submission-title">{item.title}</strong>
                            {!isExpanded && canReview ? (
                              <div className="moderation-queue-page__submission-actions">
                                <Button
                                  type="button"
                                  variant="success-ghost"
                                  size="sm"
                                  className="moderation-queue-page__submission-action moderation-queue-page__submission-action--approve"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    approveMutation.mutate({ itemId: item.id, comment: "" });
                                  }}
                                  disabled={anyMutationPending}
                                >
                                  <span>Одобрить</span>
                                  <span
                                    aria-hidden="true"
                                    className="moderation-queue-page__action-icon moderation-queue-page__action-icon--approve"
                                  />
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger-ghost"
                                  size="sm"
                                  className="moderation-queue-page__submission-action moderation-queue-page__submission-action--reject"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    rejectMutation.mutate({ itemId: item.id, comment: "" });
                                  }}
                                  disabled={anyMutationPending}
                                >
                                  <span>Отклонить</span>
                                  <span
                                    aria-hidden="true"
                                    className="moderation-queue-page__action-icon moderation-queue-page__action-icon--reject"
                                  />
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          <div className="moderation-queue-page__submission-company">{item.company_name}</div>
                          <div className="moderation-queue-page__submission-author">{item.author_email ?? "Не указано"}</div>
                          <div className="moderation-queue-page__submission-date">{formatSubmissionDate(item.submitted_at)}</div>
                          <div className="moderation-queue-page__submission-status">
                            <Status variant={statusMeta.variant}>{statusMeta.label}</Status>
                          </div>
                          <div className="moderation-queue-page__submission-actions-panel">
                            <button
                              type="button"
                              className="moderation-queue-page__action-button"
                              aria-label={`Открыть ${item.title}`}
                              onClick={() => {
                                if (hasSelectedText()) {
                                  return;
                                }

                                handleExpand(item);
                              }}
                            >
                              <img src={editIcon} alt="" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className={isExpanded ? "moderation-queue-page__submission-details-shell moderation-queue-page__submission-details-shell--expanded" : "moderation-queue-page__submission-details-shell"} aria-hidden={!isExpanded}>
                        <div className="moderation-queue-page__submission-details">
                          <div className="moderation-queue-page__details-sections">
                            <div className="moderation-queue-page__details-section">
                              <div className="moderation-queue-page__detail">
                                <div className="moderation-queue-page__detail-label">Опубликовано</div>
                                <div className="moderation-queue-page__detail-value">{formatSubmissionDateTime(item.submitted_at)}</div>
                              </div>
                              <div className="moderation-queue-page__detail">
                                <div className="moderation-queue-page__detail-label">Зарплата</div>
                                <div className="moderation-queue-page__detail-value">{item.salary_label}</div>
                              </div>
                              <div className="moderation-queue-page__detail">
                                <div className="moderation-queue-page__detail-label">Навыки</div>
                                <div className="moderation-queue-page__tags">
                                  {item.tags.length > 0 ? item.tags.map((tag) => (
                                    <span key={tag} className="moderation-queue-page__tag">{tag}</span>
                                  )) : <span className="moderation-queue-page__detail-value">Не указано</span>}
                                </div>
                              </div>
                              <div className="moderation-queue-page__detail">
                                <div className="moderation-queue-page__detail-label">Формат</div>
                                <div className="moderation-queue-page__detail-value">{item.format_label}</div>
                              </div>
                              <div className="moderation-queue-page__detail">
                                <div className="moderation-queue-page__detail-label">Описание</div>
                                <div className="moderation-queue-page__detail-rich-text">{item.description}</div>
                              </div>
                            </div>

                            <div className="moderation-queue-page__details-section moderation-queue-page__details-section--actions">
                              <div className="moderation-queue-page__review-card">
                                <div className="moderation-queue-page__review-title">Проверка: {[
                                  item.checklist.salary_specified,
                                  item.checklist.requirements_completed,
                                  item.checklist.responsibilities_completed,
                                  item.checklist.conditions_specified,
                                ].filter(Boolean).length}/4</div>
                                <div className="moderation-queue-page__checklist">
                                  {[
                                    ["Зарплата указана", item.checklist.salary_specified],
                                    ["Требования заполнены", item.checklist.requirements_completed],
                                    ["Обязанности описаны", item.checklist.responsibilities_completed],
                                    ["Условия указаны", item.checklist.conditions_specified],
                                  ].map(([label, checked], index) => (
                                    <label key={String(label)} className="moderation-queue-page__checklist-option">
                                      <Checkbox
                                        checked={Boolean(checked)}
                                        onChange={() =>
                                          handleChecklistChange(
                                            item.id,
                                            item.checklist,
                                            ([
                                              "salary_specified",
                                              "requirements_completed",
                                              "responsibilities_completed",
                                              "conditions_specified",
                                            ] as const)[index],
                                          )
                                        }
                                        variant="accent"
                                        disabled={!canEditChecklist || updateChecklistMutation.isPending}
                                      />
                                      <span>{label}</span>
                                    </label>
                                  ))}
                                </div>

                                <label className="moderation-queue-page__comment-field">
                                  <span className="moderation-queue-page__detail-label">Комментарий</span>
                                  <textarea
                                    className="moderation-queue-page__comment-input"
                                    value={currentExpandedItem?.id === item.id ? moderatorComment : item.moderator_comment ?? ""}
                                    onChange={(event) => setModeratorComment(event.target.value)}
                                    placeholder=""
                                  />
                                </label>

                                {canReview ? (
                                  <div className="moderation-queue-page__detail-actions moderation-queue-page__detail-actions--stacked">
                                    <Button type="button" variant="accent-outline" size="sm" className="moderation-queue-page__detail-action-request" onClick={() => handleRequestChanges(item.id)} loading={requestChangesMutation.isPending && currentExpandedItem?.id === item.id} disabled={anyMutationPending}>
                                      Запросить дополнительную информацию
                                    </Button>
                                    <div className="moderation-queue-page__detail-actions-group">
                                      <Button type="button" variant="danger" size="sm" className="moderation-queue-page__decision-button" onClick={() => handleReject(item.id)} loading={rejectMutation.isPending && currentExpandedItem?.id === item.id} disabled={anyMutationPending}>
                                        Отклонить
                                      </Button>
                                      <Button type="button" variant="success" size="sm" className="moderation-queue-page__decision-button" onClick={() => handleApprove(item.id)} loading={approveMutation.isPending && currentExpandedItem?.id === item.id} disabled={anyMutationPending}>
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
              <div className="moderation-queue-page__empty moderation-queue-page__empty--search">
                <img src={sadSearchIcon} alt="" aria-hidden="true" className="moderation-queue-page__empty-icon" />
                <span>По выбранным параметрам публикации не найдены.</span>
              </div>
            ) : null}
          </div>

          {!isTableLoading && sortedItems.length > 0 && totalPages > 1 ? (
            <nav className="moderation-queue-page__pagination" aria-label="Пагинация">
              <button
                type="button"
                className="moderation-queue-page__pager-button"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page === 1}
                aria-label="Предыдущая страница"
              >
                <img
                  src={arrowIcon}
                  alt=""
                  aria-hidden="true"
                  className="moderation-queue-page__pager-button-icon moderation-queue-page__pager-button-icon--prev"
                />
              </button>
              {pageNumbers.map((pageNumber, index) =>
                pageNumber === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="moderation-queue-page__pagination-ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    key={pageNumber}
                    type="button"
                    className={
                      page === pageNumber
                        ? "moderation-queue-page__pagination-page moderation-queue-page__pagination-page--active"
                        : "moderation-queue-page__pagination-page"
                    }
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ),
              )}
              <button
                type="button"
                className="moderation-queue-page__pager-button"
                onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                disabled={page === totalPages}
                aria-label="Следующая страница"
              >
                <img
                  src={arrowIcon}
                  alt=""
                  aria-hidden="true"
                  className="moderation-queue-page__pager-button-icon"
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
