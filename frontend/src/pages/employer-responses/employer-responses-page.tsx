import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useNavigationType } from "react-router-dom";

import arrowIcon from "../../assets/icons/arrow.svg";
import jobIcon from "../../assets/icons/job.svg";
import locationIcon from "../../assets/icons/location.svg";
import sadSearchIcon from "../../assets/icons/sad-search.png";
import timeIcon from "../../assets/icons/time.svg";
import {
  CitySelection,
  readSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import {
  formatEmployerResponseAppliedAt,
} from "../../features/employer-responses";
import {
  getEmployerAccessState,
  resolveEmployerFallbackRoute,
  useAuthStore,
} from "../../features/auth";
import {
  listEmployerApplicationsRequest,
  updateEmployerApplicationStatusRequest,
  type ApplicationDetails,
  type EmployerApplicationUiStatus,
} from "../../features/applications";
import { useNotificationsRealtime } from "../../features/notifications";
import { createApplicantChatRequest, formatPresenceStatus, resolveAvatarIcon, updateApplicantChatRequestStatus } from "../../shared/lib";
import { Button, Checkbox, Container, DateInput, Input, Modal, ProfileTabs, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildEmployerProfileMenuItems, Header } from "../../widgets/header";
import "../favorites/favorites.css";
import "../opportunity-details/opportunity-details.css";
import "./employer-responses.css";

type EmployerResponseStatus = "new" | "accepted" | "reserve" | "rejected";
type EmployerResponseMetricKey = "total" | "new" | "accepted" | "reserve";
type ResponseSortField = "date" | "name" | "status";
type ResponseSortDirection = "asc" | "desc";
type OpportunityKindFilter = "all" | "vacancy" | "internship" | "event" | "mentorship";
type GroupSortField = "date" | "title" | "count";
type ResponseDatePreset = "all" | "today" | "3days" | "week" | "custom";
type RangeSelectionStep = "start" | "end";
type RangeCalendarCell = {
  isoValue: string;
  label: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isInRange: boolean;
};
type ResponseCard = {
  applicationId: string;
  id: string;
  userId: string;
  publicId: string | null;
  name: string;
  subtitle: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  levelLabel: string | null;
  tags: string[];
  city: string;
  salaryLabel: string;
  formatLabel: string;
  employmentLabel: string;
  avatarSrc: string;
  status: EmployerResponseStatus;
  appliedAt: string;
  interviewDate: string | null;
  interviewStartTime: string | null;
  interviewEndTime: string | null;
  interviewFormat: string | null;
  meetingLink: string | null;
  contactEmail: string | null;
  checklist: string | null;
  employerComment: string | null;
};

type ResponseGroup = {
  opportunityId: string;
  title: string;
  publishedAt: string | null;
  kind: "vacancy" | "internship" | "event" | "mentorship";
  responses: ResponseCard[];
};

type EmployerResponsesPageSnapshot = {
  opportunitySearch: string;
  expandedOpportunityIds: string[];
  groupPage: number;
  cardPages: Record<string, number>;
  groupSearch: Record<string, string>;
  groupStatuses: Record<string, EmployerResponseStatus[]>;
  groupDatePresets: Record<string, ResponseDatePreset>;
  groupDateFrom: Record<string, string>;
  groupDateTo: Record<string, string>;
  groupSortFields: Record<string, ResponseSortField>;
  groupSortDirections: Record<string, ResponseSortDirection>;
  scrollY: number;
};

const RESPONSE_CARDS_PER_PAGE = 3;
const OPPORTUNITY_GROUPS_PER_PAGE = 5;
const EMPLOYER_RESPONSES_SNAPSHOT_KEY = "employer-responses-page-snapshot";

const metricDefinitions: Array<{ key: EmployerResponseMetricKey; label: string }> = [
  { key: "total", label: "Всего откликов:" },
  { key: "new", label: "Новые:" },
  { key: "accepted", label: "Принятые:" },
  { key: "reserve", label: "В резерве:" },
];

const responseStatusOptions: Array<{ value: EmployerResponseStatus; label: string }> = [
  { value: "new", label: "Новый" },
  { value: "accepted", label: "Принято" },
  { value: "rejected", label: "Отклонено" },
  { value: "reserve", label: "В резерве" },
];

const responseDatePresetOptions: Array<{ value: ResponseDatePreset; label: string }> = [
  { value: "today", label: "За сегодня" },
  { value: "3days", label: "За 3 дня" },
  { value: "week", label: "За неделю" },
  { value: "custom", label: "За произвольный период" },
];

const responseSortOptions: Array<{ value: ResponseSortField; label: string }> = [
  { value: "date", label: "По дате отклика" },
  { value: "name", label: "По имени" },
  { value: "status", label: "По статусу" },
];

const statusWeights: Record<EmployerResponseStatus, number> = {
  new: 0,
  accepted: 1,
  reserve: 2,
  rejected: 3,
};

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Дата публикации не указана";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Дата публикации не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function formatDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatIsoDate(date: Date) {
  return [
    date.getFullYear(),
    formatDatePart(date.getMonth() + 1),
    formatDatePart(date.getDate()),
  ].join("-");
}

function formatDisplayDate(value: string) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return "";
  }

  return `${day}.${month}.${year}`;
}

function formatRangeDisplayValue(dateFrom: string, dateTo: string) {
  if (dateFrom && dateTo) {
    return `${formatDisplayDate(dateFrom)} - ${formatDisplayDate(dateTo)}`;
  }

  if (dateFrom) {
    return `${formatDisplayDate(dateFrom)} -`;
  }

  return "";
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildRangeCalendarCells(visibleMonth: Date, dateFrom: string, dateTo: string) {
  const firstDay = startOfMonth(visibleMonth);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);

  gridStart.setDate(firstDay.getDate() - firstWeekday);

  const todayValue = formatIsoDate(new Date());
  const rangeStart = dateFrom && dateTo && dateFrom <= dateTo ? dateFrom : dateTo && !dateFrom ? dateTo : dateFrom;
  const rangeEnd = dateFrom && dateTo && dateFrom <= dateTo ? dateTo : dateFrom && dateTo ? dateFrom : dateTo;
  const items: RangeCalendarCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);

    const isoValue = formatIsoDate(current);
    const dayOfWeek = (current.getDay() + 6) % 7;

    items.push({
      isoValue,
      label: current.getDate(),
      isCurrentMonth: current.getMonth() === visibleMonth.getMonth(),
      isToday: isoValue === todayValue,
      isWeekend: dayOfWeek >= 5,
      isRangeStart: Boolean(rangeStart) && isoValue === rangeStart,
      isRangeEnd: Boolean(rangeEnd) && isoValue === rangeEnd,
      isInRange: Boolean(rangeStart && rangeEnd && isoValue >= rangeStart && isoValue <= rangeEnd),
    });
  }

  return items;
}

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getEndOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

function isResponseAppliedInRange(
  appliedAt: string,
  preset: ResponseDatePreset,
  dateFrom: string,
  dateTo: string,
) {
  const appliedAtDate = new Date(appliedAt);

  if (Number.isNaN(appliedAtDate.getTime())) {
    return false;
  }

  const appliedAtMs = appliedAtDate.getTime();
  const now = new Date();

  if (preset === "all") {
    return true;
  }

  if (preset === "today") {
    return appliedAtMs >= getStartOfDay(now);
  }

  if (preset === "3days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 2);
    return appliedAtMs >= getStartOfDay(start);
  }

  if (preset === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return appliedAtMs >= getStartOfDay(start);
  }

  if (!dateFrom && !dateTo) {
    return true;
  }

  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    if (!Number.isNaN(fromDate.getTime()) && appliedAtMs < getStartOfDay(fromDate)) {
      return false;
    }
  }

  if (dateTo) {
    const toDate = new Date(dateTo);
    if (!Number.isNaN(toDate.getTime()) && appliedAtMs > getEndOfDay(toDate)) {
      return false;
    }
  }

  return true;
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [1, "ellipsis", currentPage, "ellipsis-right", totalPages] as const;
}

function resolveStatusVariant(status: EmployerResponseStatus) {
  if (status === "accepted") {
    return "approved" as const;
  }

  if (status === "reserve") {
    return "info-request" as const;
  }

  if (status === "rejected") {
    return "rejected" as const;
  }

  return "active" as const;
}

function resolveStatusLabel(status: EmployerResponseStatus) {
  if (status === "accepted") {
    return "Принято";
  }

  if (status === "reserve") {
    return "В резерве";
  }

  if (status === "rejected") {
    return "Отклонено";
  }

  return "Новый";
}

function resolveStatusClassName(status: EmployerResponseStatus) {
  if (status === "new") {
    return "employer-responses-page__status-badge employer-responses-page__status-badge--new";
  }

  return "employer-responses-page__status-badge";
}

function resolveLevelClassName(levelLabel: string | null) {
  const normalized = levelLabel?.trim().toLowerCase();

  if (normalized === "middle" || normalized === "мидл") {
    return "opportunity-details-page__contact-level-badge opportunity-details-page__contact-level-badge--warning";
  }

  if (normalized === "senior" || normalized === "сеньор") {
    return "opportunity-details-page__contact-level-badge opportunity-details-page__contact-level-badge--danger";
  }

  return "opportunity-details-page__contact-level-badge opportunity-details-page__contact-level-badge--success";
}

function mapBackendStatusToUiStatus(status: ApplicationDetails["status"]): EmployerResponseStatus {
  if (status === "rejected" || status === "canceled") {
    return "rejected";
  }

  if (status === "reserved") {
    return "reserve";
  }

  if (status === "interview" || status === "offer" || status === "accepted") {
    return "accepted";
  }

  return "new";
}

function mapApplicationToResponseCard(item: ApplicationDetails): ResponseCard | null {
  if (!item.applicant) {
    return null;
  }

  const [firstTag, ...remainingTags] = item.applicant.tags;
  const normalizedLevel = firstTag?.trim().toLowerCase();
  const isLevelTag = normalizedLevel === "junior" || normalizedLevel === "middle" || normalizedLevel === "senior";

  return {
    applicationId: item.id,
    id: item.applicant.public_id || item.applicant.user_id,
    userId: item.applicant.user_id,
    publicId: item.applicant.public_id ?? null,
    name: item.applicant.display_name,
    subtitle: item.applicant.subtitle,
    isOnline: item.applicant.is_online,
    lastSeenAt: item.applicant.last_seen_at ?? null,
    levelLabel: isLevelTag ? firstTag : null,
    tags: isLevelTag ? remainingTags : item.applicant.tags,
    city: item.applicant.city,
    salaryLabel: item.applicant.salary_label,
    formatLabel: item.applicant.format_label,
    employmentLabel: item.applicant.employment_label,
    avatarSrc: resolveAvatarIcon("applicant"),
    status: mapBackendStatusToUiStatus(item.status),
    appliedAt: item.submitted_at,
    interviewDate: item.interview_date ?? null,
    interviewStartTime: item.interview_start_time ?? null,
    interviewEndTime: item.interview_end_time ?? null,
    interviewFormat: item.interview_format ?? "Онлайн (Яндекс Телемост)",
    meetingLink: item.meeting_link ?? null,
    contactEmail: item.contact_email ?? null,
    checklist: item.checklist ?? null,
    employerComment: item.employer_comment ?? null,
  };
}

function compareResponses(left: ResponseCard, right: ResponseCard, field: ResponseSortField, direction: ResponseSortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;

  if (field === "name") {
    return left.name.localeCompare(right.name, "ru") * multiplier;
  }

  if (field === "status") {
    return (statusWeights[left.status] - statusWeights[right.status]) * multiplier;
  }

  return (new Date(left.appliedAt).getTime() - new Date(right.appliedAt).getTime()) * multiplier;
}

export function EmployerResponsesPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const [opportunitySearch, setOpportunitySearch] = useState("");
  const [expandedOpportunityIds, setExpandedOpportunityIds] = useState<string[]>([]);
  const [groupPage, setGroupPage] = useState(1);
  const [cardPages, setCardPages] = useState<Record<string, number>>({});
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});
  const [groupStatuses, setGroupStatuses] = useState<Record<string, EmployerResponseStatus[]>>({});
  const [groupDatePresets, setGroupDatePresets] = useState<Record<string, ResponseDatePreset>>({});
  const [groupDateFrom, setGroupDateFrom] = useState<Record<string, string>>({});
  const [groupDateTo, setGroupDateTo] = useState<Record<string, string>>({});
  const [groupSortFields, setGroupSortFields] = useState<Record<string, ResponseSortField>>({});
  const [groupSortDirections, setGroupSortDirections] = useState<Record<string, ResponseSortDirection>>({});
  const [editingResponseContext, setEditingResponseContext] = useState<{
    opportunityId: string;
    opportunityTitle: string;
    response: ResponseCard;
  } | null>(null);
  const [draftStatus, setDraftStatus] = useState<EmployerResponseStatus>("new");
  const [draftInterviewDate, setDraftInterviewDate] = useState("");
  const [draftInterviewStartTime, setDraftInterviewStartTime] = useState("");
  const [draftInterviewEndTime, setDraftInterviewEndTime] = useState("");
  const [draftInterviewFormat, setDraftInterviewFormat] = useState("Онлайн (Яндекс Телемост)");
  const [draftMeetingLink, setDraftMeetingLink] = useState("");
  const [draftContactEmail, setDraftContactEmail] = useState("");
  const [draftChecklist, setDraftChecklist] = useState("");
  const [draftComment, setDraftComment] = useState("");
  const [openedFilterGroupId, setOpenedFilterGroupId] = useState<string | null>(null);
  const [openedSortGroupId, setOpenedSortGroupId] = useState<string | null>(null);
  const [rangeSelectionStep, setRangeSelectionStep] = useState<RangeSelectionStep>("start");
  const [rangeVisibleMonth, setRangeVisibleMonth] = useState<Date>(() => startOfMonth(new Date()));
  const filterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sortRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mainToolbarRef = useRef<HTMLElement | null>(null);
  const groupToolbarRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const employerAccess = getEmployerAccessState(role, accessToken);

  const applicationsQuery = useQuery({
    queryKey: ["applications", "employer"],
    queryFn: listEmployerApplicationsRequest,
    enabled: role === "employer",
    staleTime: 30_000,
  });
  const updateStatusMutation = useMutation({
    mutationFn: ({
      applicationId,
      payload,
    }: {
      applicationId: string;
      payload: {
        status: EmployerApplicationUiStatus;
        employer_comment?: string | null;
        interview_date?: string | null;
        interview_start_time?: string | null;
        interview_end_time?: string | null;
        interview_format?: string | null;
        meeting_link?: string | null;
        contact_email?: string | null;
        checklist?: string | null;
      };
    }) => updateEmployerApplicationStatusRequest(applicationId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["applications", "employer"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });

  const employerApplications = applicationsQuery.data?.data?.items ?? [];
  const isLoading = applicationsQuery.isPending;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (navigationType !== "POP") {
      sessionStorage.removeItem(EMPLOYER_RESPONSES_SNAPSHOT_KEY);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    const rawSnapshot = sessionStorage.getItem(EMPLOYER_RESPONSES_SNAPSHOT_KEY);

    if (!rawSnapshot) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    try {
      const snapshot = JSON.parse(rawSnapshot) as Partial<EmployerResponsesPageSnapshot>;

      setOpportunitySearch(snapshot.opportunitySearch ?? "");
      setExpandedOpportunityIds(snapshot.expandedOpportunityIds ?? []);
      setGroupPage(snapshot.groupPage ?? 1);
      setCardPages(snapshot.cardPages ?? {});
      setGroupSearch(snapshot.groupSearch ?? {});
      setGroupStatuses(snapshot.groupStatuses ?? {});
      setGroupDatePresets(snapshot.groupDatePresets ?? {});
      setGroupDateFrom(snapshot.groupDateFrom ?? {});
      setGroupDateTo(snapshot.groupDateTo ?? {});
      setGroupSortFields(snapshot.groupSortFields ?? {});
      setGroupSortDirections(snapshot.groupSortDirections ?? {});

      window.requestAnimationFrame(() => {
        window.scrollTo({ top: snapshot.scrollY ?? 0, behavior: "auto" });
      });
    } catch {
      sessionStorage.removeItem(EMPLOYER_RESPONSES_SNAPSHOT_KEY);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [navigationType]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const snapshot: EmployerResponsesPageSnapshot = {
      opportunitySearch,
      expandedOpportunityIds,
      groupPage,
      cardPages,
      groupSearch,
      groupStatuses,
      groupDatePresets,
      groupDateFrom,
      groupDateTo,
      groupSortFields,
      groupSortDirections,
      scrollY: window.scrollY,
    };

    sessionStorage.setItem(EMPLOYER_RESPONSES_SNAPSHOT_KEY, JSON.stringify(snapshot));
  }, [
    cardPages,
    expandedOpportunityIds,
    groupPage,
    groupSearch,
    groupDateFrom,
    groupDatePresets,
    groupDateTo,
    groupSortDirections,
    groupSortFields,
    groupStatuses,
    opportunitySearch,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleScroll = () => {
      const rawSnapshot = sessionStorage.getItem(EMPLOYER_RESPONSES_SNAPSHOT_KEY);

      if (!rawSnapshot) {
        return;
      }

      try {
        const snapshot = JSON.parse(rawSnapshot) as EmployerResponsesPageSnapshot;
        sessionStorage.setItem(
          EMPLOYER_RESPONSES_SNAPSHOT_KEY,
          JSON.stringify({
            ...snapshot,
            scrollY: window.scrollY,
          }),
        );
      } catch {
        sessionStorage.removeItem(EMPLOYER_RESPONSES_SNAPSHOT_KEY);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      handleScroll();
    };
  }, []);

  useNotificationsRealtime({
    enabled: role === "employer",
    onMessage: (payload) => {
      if (payload?.type !== "notification_created") {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ["applications", "employer"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  useEffect(() => {
    if (!openedFilterGroupId && !openedSortGroupId) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (openedFilterGroupId && !filterRefs.current[openedFilterGroupId]?.contains(target)) {
        setOpenedFilterGroupId(null);
      }

      if (openedSortGroupId && !sortRefs.current[openedSortGroupId]?.contains(target)) {
        setOpenedSortGroupId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenedFilterGroupId(null);
        setOpenedSortGroupId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openedFilterGroupId, openedSortGroupId]);

  useEffect(() => {
    setGroupPage(1);
  }, [opportunitySearch]);

  const scrollToElement = (element: HTMLElement | null) => {
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openedFilterDateFrom = openedFilterGroupId ? (groupDateFrom[openedFilterGroupId] ?? "") : "";
  const openedFilterDateTo = openedFilterGroupId ? (groupDateTo[openedFilterGroupId] ?? "") : "";
  const rangeCalendarCells = useMemo(
    () => buildRangeCalendarCells(rangeVisibleMonth, openedFilterDateFrom, openedFilterDateTo),
    [openedFilterDateFrom, openedFilterDateTo, rangeVisibleMonth],
  );

  const responseGroups = useMemo<ResponseGroup[]>(() => {
    const groups = new Map<string, ResponseGroup>();

    employerApplications.forEach((item) => {
      if (!item.opportunity) {
        return;
      }

      const response = mapApplicationToResponseCard(item);
      if (!response) {
        return;
      }

      const existingGroup = groups.get(item.opportunity.id);
      if (existingGroup) {
        existingGroup.responses.push(response);
        return;
      }

      groups.set(item.opportunity.id, {
        opportunityId: item.opportunity.id,
        title: item.opportunity.title,
        publishedAt: item.opportunity.published_at ?? null,
        kind: item.opportunity.kind,
        responses: [response],
      });
    });

    return Array.from(groups.values());
  }, [employerApplications]);

  const availableGroups = useMemo(
    () => responseGroups.filter((group) => group.responses.length > 0),
    [responseGroups],
  );

  useEffect(() => {
    setExpandedOpportunityIds((current) => {
      const nextValue = current.filter((id) => availableGroups.some((group) => group.opportunityId === id));

      if (nextValue.length === current.length && nextValue.every((item, index) => item === current[index])) {
        return current;
      }

      return nextValue;
    });
  }, [availableGroups]);

  const metrics = useMemo(() => availableGroups.reduce(
    (accumulator, group) => {
      group.responses.forEach((response) => {
        accumulator.total += 1;
        if (response.status !== "rejected") {
          accumulator[response.status] += 1;
        }
      });
      return accumulator;
    },
    {
      total: 0,
      new: 0,
      accepted: 0,
      reserve: 0,
    } satisfies Record<EmployerResponseMetricKey, number>,
  ), [availableGroups]);

  const filteredGroups = useMemo(() => {
    const normalizedSearch = normalizeText(opportunitySearch);

    const nextGroups = availableGroups.filter((group) => {
      if (normalizedSearch && !normalizeText(group.title).includes(normalizedSearch)) {
        return false;
      }

      return true;
    });

    return nextGroups.sort(
      (left, right) => new Date(right.publishedAt ?? 0).getTime() - new Date(left.publishedAt ?? 0).getTime(),
    );
  }, [availableGroups, opportunitySearch]);

  const totalGroupPages = Math.max(1, Math.ceil(filteredGroups.length / OPPORTUNITY_GROUPS_PER_PAGE));
  const visibleGroups = filteredGroups.slice(
    (Math.min(groupPage, totalGroupPages) - 1) * OPPORTUNITY_GROUPS_PER_PAGE,
    Math.min(groupPage, totalGroupPages) * OPPORTUNITY_GROUPS_PER_PAGE,
  );
  const groupPaginationItems = buildPaginationItems(Math.min(groupPage, totalGroupPages), totalGroupPages);

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  const profileMenuItems = buildEmployerProfileMenuItems(navigate, employerAccess);

  const handleToggleGroup = (opportunityId: string) => {
    const isExpanded = expandedOpportunityIds.includes(opportunityId);

    setExpandedOpportunityIds((current) =>
      current.includes(opportunityId)
        ? current.filter((item) => item !== opportunityId)
        : [...current, opportunityId],
    );

    if (!isExpanded) {
      window.requestAnimationFrame(() => {
        scrollToElement(groupToolbarRefs.current[opportunityId]);
      });
    }
  };

  const handleToggleStatus = (opportunityId: string, status: EmployerResponseStatus) => {
    setGroupStatuses((current) => {
      const selected = current[opportunityId] ?? [];
      return {
        ...current,
        [opportunityId]: selected.includes(status)
          ? selected.filter((item) => item !== status)
          : [...selected, status],
      };
    });
    setCardPages((current) => ({ ...current, [opportunityId]: 1 }));
  };

  const handleResetGroupFilters = (opportunityId: string) => {
    setGroupStatuses((current) => ({ ...current, [opportunityId]: [] }));
    setGroupDatePresets((current) => ({ ...current, [opportunityId]: "all" }));
    setGroupDateFrom((current) => ({ ...current, [opportunityId]: "" }));
    setGroupDateTo((current) => ({ ...current, [opportunityId]: "" }));
    setCardPages((current) => ({ ...current, [opportunityId]: 1 }));
    setRangeSelectionStep("start");
    setRangeVisibleMonth(startOfMonth(new Date()));
  };

  const handleApplyGroupFilters = (opportunityId: string) => {
    setOpenedFilterGroupId(null);
    setCardPages((current) => ({ ...current, [opportunityId]: 1 }));
  };

  const handleOpenGroupFilter = (opportunityId: string) => {
    const isOpening = openedFilterGroupId !== opportunityId;

    if (isOpening) {
      const nextFrom = groupDateFrom[opportunityId] ?? "";
      const nextTo = groupDateTo[opportunityId] ?? "";
      const anchorDate = parseIsoDate(nextTo || nextFrom) ?? new Date();

      scrollToElement(groupToolbarRefs.current[opportunityId]);
      setRangeVisibleMonth(startOfMonth(anchorDate));
      setRangeSelectionStep(nextFrom && !nextTo ? "end" : "start");
    }

    setOpenedSortGroupId(null);
    setOpenedFilterGroupId((current) => current === opportunityId ? null : opportunityId);
  };

  const handleCustomRangePresetSelect = (opportunityId: string) => {
    const nextFrom = groupDateFrom[opportunityId] ?? "";
    const nextTo = groupDateTo[opportunityId] ?? "";
    const anchorDate = parseIsoDate(nextTo || nextFrom) ?? new Date();

    setGroupDatePresets((current) => ({ ...current, [opportunityId]: "custom" }));
    setRangeVisibleMonth(startOfMonth(anchorDate));
    setRangeSelectionStep(nextFrom && !nextTo ? "end" : "start");
  };

  const handleRangeDateSelect = (opportunityId: string, isoValue: string) => {
    const currentFrom = groupDateFrom[opportunityId] ?? "";
    const currentTo = groupDateTo[opportunityId] ?? "";

    if (rangeSelectionStep === "start" || !currentFrom || (currentFrom && currentTo)) {
      setGroupDateFrom((current) => ({ ...current, [opportunityId]: isoValue }));
      setGroupDateTo((current) => ({ ...current, [opportunityId]: "" }));
      setRangeSelectionStep("end");
      return;
    }

    if (isoValue < currentFrom) {
      setGroupDateFrom((current) => ({ ...current, [opportunityId]: isoValue }));
      setGroupDateTo((current) => ({ ...current, [opportunityId]: currentFrom }));
    } else {
      setGroupDateTo((current) => ({ ...current, [opportunityId]: isoValue }));
    }

    setRangeSelectionStep("start");
  };

  const handleWriteMessage = (response: ResponseCard) => {
    const currentUserId = useAuthStore.getState().accessToken
      ? (() => {
          try {
            const [, payload] = (useAuthStore.getState().accessToken as string).split(".");
            const decodedPayload = window.atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
            return (JSON.parse(decodedPayload) as { sub?: string }).sub ?? null;
          } catch {
            return null;
          }
        })()
      : null;

    if (currentUserId) {
      createApplicantChatRequest({
        requesterUserId: response.userId,
        recipientUserId: currentUserId,
      });
      updateApplicantChatRequestStatus({
        requesterUserId: response.userId,
        recipientUserId: currentUserId,
        status: "accepted",
      });
    }

    navigate(`/employer/chat?recipient=${encodeURIComponent(response.userId)}`);
  };

  const closeStatusModal = () => {
    setEditingResponseContext(null);
    setDraftStatus("new");
    setDraftInterviewDate("");
    setDraftInterviewStartTime("");
    setDraftInterviewEndTime("");
    setDraftInterviewFormat("Онлайн (Яндекс Телемост)");
    setDraftMeetingLink("");
    setDraftContactEmail("");
    setDraftChecklist("");
    setDraftComment("");
  };

  const openStatusModal = (opportunityId: string, opportunityTitle: string, response: ResponseCard) => {
    setEditingResponseContext({
      opportunityId,
      opportunityTitle,
      response,
    });
    setDraftStatus(response.status);
    setDraftInterviewDate(response.interviewDate ?? "");
    setDraftInterviewStartTime(response.interviewStartTime ?? "");
    setDraftInterviewEndTime(response.interviewEndTime ?? "");
    setDraftInterviewFormat(response.interviewFormat ?? "Онлайн (Яндекс Телемост)");
    setDraftMeetingLink(response.meetingLink ?? "");
    setDraftContactEmail(response.contactEmail ?? "");
    setDraftChecklist(response.checklist ?? "");
    setDraftComment(response.employerComment ?? "");
  };

  const handleSaveStatus = () => {
    if (!editingResponseContext || updateStatusMutation.isPending) {
      return;
    }

    updateStatusMutation.mutate({
      applicationId: editingResponseContext.response.applicationId,
      payload: {
        status: draftStatus,
        employer_comment: draftComment.trim() || null,
        interview_date: draftStatus === "accepted" ? (draftInterviewDate || null) : null,
        interview_start_time: draftStatus === "accepted" ? (draftInterviewStartTime || null) : null,
        interview_end_time: draftStatus === "accepted" ? (draftInterviewEndTime || null) : null,
        interview_format: draftStatus === "accepted" ? (draftInterviewFormat.trim() || null) : null,
        meeting_link: draftStatus === "accepted" ? (draftMeetingLink.trim() || null) : null,
        contact_email: draftStatus === "accepted" ? (draftContactEmail.trim() || null) : null,
        checklist: draftStatus === "accepted" ? (draftChecklist.trim() || null) : null,
      },
    }, {
      onSuccess: () => {
        closeStatusModal();
      },
    });
  };

  if (role !== "employer") {
    return <Navigate to="/" replace />;
  }

  if (!employerAccess.canReviewResponses) {
    return <Navigate to={resolveEmployerFallbackRoute(employerAccess)} replace />;
  }

  return (
    <main className="employer-responses-page">
      <Header
        containerClassName="employer-responses-page__header-shell"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
      />

      <Container className="employer-responses-page__shell settings-page__shell">
        <ProfileTabs
          navigate={navigate}
          audience="employer"
          current="responses"
          employerAccess={employerAccess}
          tabsClassName="employer-responses-page__tabs"
          tabClassName="employer-responses-page__tab"
          activeTabClassName="employer-responses-page__tab--active"
        />

        <div className="employer-responses-page__summary">
          <section className="employer-responses-page__section">
            <section className="favorites-page__metrics stats-panel" aria-label="Статистика откликов">
              {metricDefinitions.map((metric) => (
                <article key={metric.key} className="favorites-page__metric-card stats-panel__card">
                  {isLoading ? (
                    <>
                      <span className="favorites-page__skeleton favorites-page__skeleton--metric-label" />
                      <span className="favorites-page__skeleton favorites-page__skeleton--metric-value" />
                    </>
                  ) : (
                    <>
                      <span className="favorites-page__metric-label stats-panel__label">{metric.label}</span>
                      <strong className="favorites-page__metric-value stats-panel__value">{formatCount(metrics[metric.key])}</strong>
                    </>
                  )}
                </article>
              ))}
            </section>
          </section>

          <section className="employer-responses-page__section">
            <section ref={mainToolbarRef} className="favorites-page__toolbar employer-responses-page__main-toolbar">
              <label className="favorites-page__search" aria-label="Поиск по вакансиям">
                <Input
                  type="search"
                  placeholder="Поиск по вакансиям"
                  className="input--sm favorites-page__search-input"
                  value={opportunitySearch}
                  clearable
                  onChange={(event) => setOpportunitySearch(event.target.value)}
                />
              </label>
            </section>
          </section>

          {filteredGroups.length === 0 && !isLoading ? (
            <section className="employer-responses-page__section favorites-page__empty">
              <h2 className="favorites-page__empty-title">Откликов пока нет</h2>
              <p className="favorites-page__empty-text">
                Когда соискатели начнут откликаться на ваши возможности, они появятся здесь.
              </p>
            </section>
          ) : null}

          <section className="employer-responses-page__section employer-responses-page__section--list">
            <div className="employer-responses-page__list">
          {visibleGroups.map((group) => {
            const isExpanded = expandedOpportunityIds.includes(group.opportunityId);
            const selectedStatuses = groupStatuses[group.opportunityId] ?? [];
            const selectedDatePreset = groupDatePresets[group.opportunityId] ?? "all";
            const selectedDateFrom = groupDateFrom[group.opportunityId] ?? "";
            const selectedDateTo = groupDateTo[group.opportunityId] ?? "";
            const groupSortField = groupSortFields[group.opportunityId] ?? "date";
            const groupSortDirection = groupSortDirections[group.opportunityId] ?? "desc";
            const normalizedGroupSearch = normalizeText(groupSearch[group.opportunityId] ?? "");
            const filteredResponses = group.responses
              .filter((response) => {
                if (
                  normalizedGroupSearch &&
                  ![
                    response.name,
                    response.subtitle,
                    response.city,
                    ...response.tags,
                    resolveStatusLabel(response.status),
                  ].some((item) => normalizeText(item).includes(normalizedGroupSearch))
                ) {
                  return false;
                }

                if (selectedStatuses.length > 0 && !selectedStatuses.includes(response.status)) {
                  return false;
                }

                if (!isResponseAppliedInRange(response.appliedAt, selectedDatePreset, selectedDateFrom, selectedDateTo)) {
                  return false;
                }

                return true;
              })
              .sort((left, right) => compareResponses(left, right, groupSortField, groupSortDirection));
            const currentPage = cardPages[group.opportunityId] ?? 1;
            const totalPages = Math.max(1, Math.ceil(filteredResponses.length / RESPONSE_CARDS_PER_PAGE));
            const safePage = Math.min(currentPage, totalPages);
            const visibleResponses = filteredResponses.slice(
              (safePage - 1) * RESPONSE_CARDS_PER_PAGE,
              safePage * RESPONSE_CARDS_PER_PAGE,
            );
            const paginationItems = buildPaginationItems(safePage, totalPages);
            const layoutClassName =
              visibleResponses.length <= 1
                ? "employer-responses-page__candidates employer-responses-page__candidates--single"
                : visibleResponses.length === 2
                  ? "employer-responses-page__candidates employer-responses-page__candidates--double"
                  : "employer-responses-page__candidates employer-responses-page__candidates--triple";

            return (
              <section
                key={group.opportunityId}
                className={`employer-responses-page__group${isExpanded ? " employer-responses-page__group--expanded" : ""}`}
              >
                <button
                  type="button"
                  className="employer-responses-page__group-toggle"
                  onClick={() => handleToggleGroup(group.opportunityId)}
                  aria-expanded={isExpanded}
                >
                  <div className="employer-responses-page__group-copy">
                    <h2 className="employer-responses-page__group-title">
                      {group.title} ({filteredResponses.length})
                    </h2>
                    <p className="employer-responses-page__group-date">Дата публикации: {formatDate(group.publishedAt)}</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`employer-responses-page__group-toggle-icon${isExpanded ? " employer-responses-page__group-toggle-icon--expanded" : ""}`}
                  />
                </button>

                <div
                  className={
                    isExpanded
                      ? "employer-responses-page__group-body-shell employer-responses-page__group-body-shell--expanded"
                      : "employer-responses-page__group-body-shell"
                  }
                  aria-hidden={!isExpanded}
                >
                  <div className="employer-responses-page__group-body">
                    <div
                      ref={(node) => {
                        groupToolbarRefs.current[group.opportunityId] = node;
                      }}
                      className="favorites-page__toolbar employer-responses-page__group-toolbar"
                    >
                      <label className="favorites-page__search" aria-label={`Поиск откликов по ${group.title}`}>
                        <Input
                          type="search"
                          placeholder="Поиск"
                          className="input--sm favorites-page__search-input"
                          value={groupSearch[group.opportunityId] ?? ""}
                          clearable
                          onChange={(event) => {
                            setGroupSearch((current) => ({ ...current, [group.opportunityId]: event.target.value }));
                            setCardPages((current) => ({ ...current, [group.opportunityId]: 1 }));
                          }}
                        />
                      </label>

                      <div className="favorites-page__toolbar-actions">
                        <div
                          ref={(node) => {
                            filterRefs.current[group.opportunityId] = node;
                          }}
                          className="favorites-page__filters"
                        >
                          <button
                            type="button"
                            className="favorites-page__icon-button favorites-page__icon-button--filter"
                            aria-label="Фильтры откликов"
                            aria-expanded={openedFilterGroupId === group.opportunityId}
                            onClick={() => handleOpenGroupFilter(group.opportunityId)}
                          >
                            <span className="favorites-page__icon-stack" aria-hidden="true">
                              <span
                                className={
                                  openedFilterGroupId === group.opportunityId
                                    ? "favorites-page__icon favorites-page__icon--filter favorites-page__icon--hidden"
                                    : "favorites-page__icon favorites-page__icon--filter"
                                }
                              />
                              <span
                                className={
                                  openedFilterGroupId === group.opportunityId
                                    ? "favorites-page__icon favorites-page__icon--filter-open favorites-page__icon--visible"
                                    : "favorites-page__icon favorites-page__icon--filter-open favorites-page__icon--hidden"
                                }
                              />
                            </span>
                          </button>

                          {openedFilterGroupId === group.opportunityId ? (
                            <div className="favorites-page__popover favorites-page__popover--compact">
                              <div className="favorites-page__popover-section">
                                <div className="favorites-page__popover-head">
                                  <h2 className="favorites-page__popover-title">Фильтры</h2>
                                  <button
                                    type="button"
                                    className="favorites-page__popover-reset"
                                    onClick={() => setGroupStatuses((current) => ({ ...current, [group.opportunityId]: [] }))}
                                  >
                                    Сбросить
                                  </button>
                                </div>
                              </div>

                              <div className="favorites-page__popover-section">
                                <div className="favorites-page__option-list">
                                  {responseStatusOptions.map((option) => (
                                    <label key={option.value} className="favorites-page__option">
                                      <Checkbox
                                        checked={selectedStatuses.includes(option.value)}
                                        onChange={() => handleToggleStatus(group.opportunityId, option.value)}
                                        variant="primary"
                                      />
                                      <span>{option.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              <div className="favorites-page__popover-section">
                                <div className="favorites-page__popover-head">
                                  <h3 className="favorites-page__popover-group-title">Дата отклика</h3>
                                  <button
                                    type="button"
                                    className="favorites-page__popover-reset"
                                    onClick={() => {
                                      setGroupDatePresets((current) => ({ ...current, [group.opportunityId]: "all" }));
                                      setGroupDateFrom((current) => ({ ...current, [group.opportunityId]: "" }));
                                      setGroupDateTo((current) => ({ ...current, [group.opportunityId]: "" }));
                                    }}
                                  >
                                    Сбросить
                                  </button>
                                </div>

                                <div className="employer-responses-page__filter-options employer-responses-page__filter-options--date">
                                  {responseDatePresetOptions.map((option) => (
                                    <label key={option.value} className="favorites-page__option employer-responses-page__filter-option">
                                      <Radio
                                        checked={selectedDatePreset === option.value}
                                        onChange={() => {
                                          if (option.value === "custom") {
                                            handleCustomRangePresetSelect(group.opportunityId);
                                            return;
                                          }

                                          setGroupDatePresets((current) => ({ ...current, [group.opportunityId]: option.value }));
                                          setRangeSelectionStep("start");
                                        }}
                                        variant="primary"
                                      />
                                      <span>{option.label}</span>
                                    </label>
                                  ))}
                                </div>

                                {selectedDatePreset === "custom" ? (
                                  <div className="employer-responses-page__range-picker">
                                    <button
                                      type="button"
                                      className="employer-responses-page__filter-date-range"
                                      onClick={() => {
                                        setRangeVisibleMonth(startOfMonth(parseIsoDate(selectedDateTo || selectedDateFrom) ?? new Date()));
                                      }}
                                    >
                                      <span
                                        className={
                                          selectedDateFrom || selectedDateTo
                                            ? "employer-responses-page__filter-date-value"
                                            : "employer-responses-page__filter-date-value employer-responses-page__filter-date-value--placeholder"
                                        }
                                      >
                                        {formatRangeDisplayValue(selectedDateFrom, selectedDateTo) || "дд.мм.гггг - дд.мм.гггг"}
                                      </span>
                                      <span aria-hidden="true" className="employer-responses-page__filter-date-icon" />
                                    </button>

                                    <div className="employer-responses-page__range-calendar">
                                      <div className="date-input__calendar employer-responses-page__range-calendar-surface">
                                        <div className="date-input__calendar-header">
                                          <button
                                            type="button"
                                            className="date-input__calendar-nav date-input__calendar-nav--prev"
                                            aria-label="Предыдущий месяц"
                                            onClick={() => setRangeVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                                          />
                                          <div className="date-input__calendar-month">
                                            {
                                              [
                                                "Январь",
                                                "Февраль",
                                                "Март",
                                                "Апрель",
                                                "Май",
                                                "Июнь",
                                                "Июль",
                                                "Август",
                                                "Сентябрь",
                                                "Октябрь",
                                                "Ноябрь",
                                                "Декабрь",
                                              ][rangeVisibleMonth.getMonth()]
                                            } {rangeVisibleMonth.getFullYear()}
                                          </div>
                                          <button
                                            type="button"
                                            className="date-input__calendar-nav date-input__calendar-nav--next"
                                            aria-label="Следующий месяц"
                                            onClick={() => setRangeVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                                          />
                                        </div>

                                        <div className="date-input__calendar-days date-input__calendar-days--weekdays">
                                          {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((item, index) => (
                                            <span
                                              key={item}
                                              className={`date-input__calendar-weekday${index >= 5 ? " date-input__calendar-weekday--weekend" : ""}`}
                                            >
                                              {item}
                                            </span>
                                          ))}
                                        </div>

                                        <div className="date-input__calendar-days">
                                          {rangeCalendarCells.map((item) => (
                                            <button
                                              key={item.isoValue}
                                              type="button"
                                              className={[
                                                "date-input__calendar-day",
                                                !item.isCurrentMonth ? "date-input__calendar-day--outside" : "",
                                                item.isWeekend ? "date-input__calendar-day--weekend" : "",
                                                item.isToday ? "date-input__calendar-day--today" : "",
                                                item.isInRange ? "employer-responses-page__range-day--in-range" : "",
                                                item.isRangeStart ? "date-input__calendar-day--selected employer-responses-page__range-day--start" : "",
                                                item.isRangeEnd ? "date-input__calendar-day--selected employer-responses-page__range-day--end" : "",
                                              ].filter(Boolean).join(" ")}
                                              onClick={() => handleRangeDateSelect(group.opportunityId, item.isoValue)}
                                            >
                                              {item.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </div>

                              <div className="favorites-page__popover-footer employer-responses-page__filter-footer">
                                <Button type="button" variant="primary" size="sm" fullWidth onClick={() => handleApplyGroupFilters(group.opportunityId)}>
                                  Показать результаты
                                </Button>
                                <Button type="button" variant="primary-outline" size="sm" fullWidth onClick={() => handleResetGroupFilters(group.opportunityId)}>
                                  Сбросить фильтры
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div
                          ref={(node) => {
                            sortRefs.current[group.opportunityId] = node;
                          }}
                          className="favorites-page__sorting"
                        >
                          <button
                            type="button"
                            className="favorites-page__icon-button favorites-page__icon-button--sorting"
                            aria-label="Сортировка откликов"
                            aria-expanded={openedSortGroupId === group.opportunityId}
                            onClick={() => {
                              if (openedSortGroupId !== group.opportunityId) {
                                scrollToElement(groupToolbarRefs.current[group.opportunityId]);
                              }
                              setOpenedFilterGroupId(null);
                              setOpenedSortGroupId((current) => current === group.opportunityId ? null : group.opportunityId);
                            }}
                          >
                            <span className="favorites-page__icon-stack" aria-hidden="true">
                              <span
                                className={
                                  openedSortGroupId === group.opportunityId
                                    ? `favorites-page__icon ${groupSortDirection === "desc" ? "favorites-page__icon--sorting" : "favorites-page__icon--sorting favorites-page__icon--ascending"} favorites-page__icon--hidden`
                                    : groupSortDirection === "desc"
                                      ? "favorites-page__icon favorites-page__icon--sorting"
                                      : "favorites-page__icon favorites-page__icon--sorting favorites-page__icon--ascending"
                                }
                              />
                              <span
                                className={
                                  openedSortGroupId === group.opportunityId
                                    ? "favorites-page__icon favorites-page__icon--filter-open favorites-page__icon--visible"
                                    : "favorites-page__icon favorites-page__icon--filter-open favorites-page__icon--hidden"
                                }
                              />
                            </span>
                          </button>

                          {openedSortGroupId === group.opportunityId ? (
                            <div className="favorites-page__popover favorites-page__popover--compact">
                              <div className="favorites-page__popover-section">
                                <div className="favorites-page__popover-head">
                                  <h2 className="favorites-page__popover-title">Сортировка</h2>
                                  <button
                                    type="button"
                                    className="favorites-page__popover-reset"
                                    onClick={() => {
                                      setGroupSortFields((current) => ({ ...current, [group.opportunityId]: "date" }));
                                      setGroupSortDirections((current) => ({ ...current, [group.opportunityId]: "desc" }));
                                    }}
                                  >
                                    Сбросить
                                  </button>
                                </div>
                              </div>

                              <div className="favorites-page__popover-section">
                                <div className="favorites-page__option-list">
                                  {responseSortOptions.map((option) => (
                                    <label key={option.value} className="favorites-page__option">
                                      <Radio
                                        checked={groupSortField === option.value}
                                        onChange={() => setGroupSortFields((current) => ({ ...current, [group.opportunityId]: option.value }))}
                                        variant="primary"
                                      />
                                      <span>{option.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              <div className="favorites-page__popover-section">
                                <div className="favorites-page__option-list">
                                  <label className="favorites-page__option">
                                    <Radio
                                      checked={groupSortDirection === "asc"}
                                      onChange={() => setGroupSortDirections((current) => ({ ...current, [group.opportunityId]: "asc" }))}
                                      variant="primary"
                                    />
                                    <span>{groupSortField === "name" ? "А-Я" : "По возрастанию"}</span>
                                  </label>
                                  <label className="favorites-page__option">
                                    <Radio
                                      checked={groupSortDirection === "desc"}
                                      onChange={() => setGroupSortDirections((current) => ({ ...current, [group.opportunityId]: "desc" }))}
                                      variant="primary"
                                    />
                                    <span>{groupSortField === "name" ? "Я-А" : "По убыванию"}</span>
                                  </label>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {visibleResponses.length > 0 ? (
                      <>
                        <div className={layoutClassName}>
                          {visibleResponses.map((response) => (
                            <article key={`${group.opportunityId}-${response.id}`} className="opportunity-details-page__contact-card employer-responses-page__response-card contact-profile-card">
                              <div className="opportunity-details-page__contact-badge contact-profile-card__badge">
                                <span className="opportunity-details-page__contact-id contact-profile-card__id">ID: {response.id.slice(-6)}</span>
                              </div>

                              <div className="opportunity-details-page__contact-primary contact-profile-card__primary">
                                <div className="opportunity-details-page__contact-avatar-shell contact-profile-card__avatar-shell">
                                  <img src={response.avatarSrc} alt="" aria-hidden="true" className="opportunity-details-page__contact-avatar contact-profile-card__avatar" />
                                </div>
                                <h3 className="opportunity-details-page__contact-name contact-profile-card__name">{response.name}</h3>
                                <p className={`opportunity-details-page__contact-status contact-profile-card__status${response.isOnline ? " contact-profile-card__status--online" : " contact-profile-card__status--offline"}`}>
                                  <span className={`opportunity-details-page__contact-dot contact-profile-card__dot${response.isOnline ? " opportunity-details-page__contact-dot--online contact-profile-card__dot--online" : ""}`} />
                                  {formatPresenceStatus({ isOnline: response.isOnline, lastSeenAt: response.lastSeenAt })}
                                </p>
                                <p className="opportunity-details-page__contact-subtitle contact-profile-card__subtitle">{response.subtitle}</p>
                              </div>

                              <div className="opportunity-details-page__contact-tags contact-profile-card__tags">
                                {response.levelLabel ? (
                                  <span className={resolveLevelClassName(response.levelLabel)}>{response.levelLabel}</span>
                                ) : null}
                                {response.tags.map((tag) => (
                                  <span key={`${response.id}-${tag}`} className="opportunity-details-page__contact-tag contact-profile-card__tag">
                                    {tag}
                                  </span>
                                ))}
                              </div>

                              <div className="opportunity-details-page__contact-facts employer-responses-page__contact-meta contact-profile-card__facts">
                                <span className="opportunity-details-page__contact-fact contact-profile-card__fact">
                                  <img src={locationIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon contact-profile-card__fact-icon" />
                                  {response.city}
                                </span>
                                <span className="opportunity-details-page__contact-fact contact-profile-card__fact">
                                  <img src={jobIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon contact-profile-card__fact-icon" />
                                  {response.salaryLabel}
                                </span>
                                <span className="opportunity-details-page__contact-fact contact-profile-card__fact">
                                  <img src={jobIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon contact-profile-card__fact-icon" />
                                  {response.formatLabel}
                                </span>
                                <span className="opportunity-details-page__contact-fact contact-profile-card__fact">
                                  <img src={timeIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon contact-profile-card__fact-icon" />
                                  {response.employmentLabel}
                                </span>
                              </div>

                              <p className="employer-responses-page__response-date">
                                Отклик: {formatEmployerResponseAppliedAt(response.appliedAt)}
                              </p>

                              <div className="employer-responses-page__status-summary">
                                <span className="employer-responses-page__status-label">Статус:</span>
                                <Status
                                  className={resolveStatusClassName(response.status)}
                                  variant={resolveStatusVariant(response.status)}
                                >
                                  {resolveStatusLabel(response.status)}
                                </Status>
                                <button
                                  type="button"
                                  className="employer-responses-page__status-edit"
                                  aria-label={`Изменить статус кандидата ${response.name}`}
                                  onClick={() => openStatusModal(group.opportunityId, group.title, response)}
                                >
                                  <span aria-hidden="true" className="employer-responses-page__status-edit-icon" />
                                </button>
                              </div>

                              <div className="employer-responses-page__response-actions">
                                <Button type="button" variant="primary" size="md" fullWidth onClick={() => handleWriteMessage(response)}>
                                  Написать
                                </Button>
                                <Button
                                  type="button"
                                  variant="primary-outline"
                                  size="md"
                                  fullWidth
                                  disabled={!response.publicId}
                                  onClick={() => {
                                    if (response.publicId) {
                                      navigate(`/profiles/${response.publicId}`, {
                                        state: {
                                          ownerRole: "applicant",
                                        },
                                      });
                                    }
                                  }}
                                >
                                  Просмотреть профиль
                                </Button>
                              </div>
                            </article>
                          ))}
                        </div>

                        {totalPages > 1 ? (
                          <nav className="opportunity-details-page__pagination" aria-label={`Пагинация откликов по ${group.title}`}>
                            <button
                              type="button"
                              className="opportunity-details-page__pagination-arrow"
                              onClick={() => {
                                setCardPages((current) => ({ ...current, [group.opportunityId]: Math.max(1, safePage - 1) }));
                                scrollToElement(groupToolbarRefs.current[group.opportunityId]);
                              }}
                              disabled={safePage === 1}
                              aria-label="Предыдущая страница"
                            >
                              <img
                                src={arrowIcon}
                                alt=""
                                aria-hidden="true"
                                className="opportunity-details-page__pagination-arrow-icon opportunity-details-page__pagination-arrow-icon--prev"
                              />
                            </button>
                            {paginationItems.map((item, index) =>
                              typeof item === "number" ? (
                                <button
                                  key={`${group.opportunityId}-${item}-${index}`}
                                  type="button"
                                  className={
                                    safePage === item
                                      ? "opportunity-details-page__pagination-page opportunity-details-page__pagination-page--active"
                                      : "opportunity-details-page__pagination-page"
                                  }
                                  onClick={() => {
                                    setCardPages((current) => ({ ...current, [group.opportunityId]: item }));
                                    scrollToElement(groupToolbarRefs.current[group.opportunityId]);
                                  }}
                                >
                                  {item}
                                </button>
                              ) : (
                                <span key={`${group.opportunityId}-${item}-${index}`} className="opportunity-details-page__pagination-ellipsis">
                                  ...
                                </span>
                              ),
                            )}
                            <button
                              type="button"
                              className="opportunity-details-page__pagination-arrow"
                              onClick={() => {
                                setCardPages((current) => ({ ...current, [group.opportunityId]: Math.min(totalPages, safePage + 1) }));
                                scrollToElement(groupToolbarRefs.current[group.opportunityId]);
                              }}
                              disabled={safePage === totalPages}
                              aria-label="Следующая страница"
                            >
                              <img src={arrowIcon} alt="" aria-hidden="true" className="opportunity-details-page__pagination-arrow-icon" />
                            </button>
                          </nav>
                        ) : null}
                      </>
                    ) : (
                      <div className="employer-responses-page__empty-group">
                        <img src={sadSearchIcon} alt="" aria-hidden="true" className="employer-responses-page__empty-group-icon" />
                        <p className="employer-responses-page__empty-group-text">По текущим фильтрам отклики не найдены.</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
            </div>
          </section>
        </div>

        {totalGroupPages > 1 ? (
          <nav className="opportunity-details-page__pagination employer-responses-page__groups-pagination" aria-label="Пагинация вакансий с откликами">
            <button
              type="button"
              className="opportunity-details-page__pagination-arrow"
              onClick={() => {
                setGroupPage((current) => Math.max(1, current - 1));
                scrollToElement(mainToolbarRef.current);
              }}
              disabled={groupPage === 1}
              aria-label="Предыдущая страница вакансий"
            >
              <img
                src={arrowIcon}
                alt=""
                aria-hidden="true"
                className="opportunity-details-page__pagination-arrow-icon opportunity-details-page__pagination-arrow-icon--prev"
              />
            </button>
            {groupPaginationItems.map((item, index) =>
              typeof item === "number" ? (
                <button
                  key={`groups-${item}-${index}`}
                  type="button"
                  className={
                    groupPage === item
                      ? "opportunity-details-page__pagination-page opportunity-details-page__pagination-page--active"
                      : "opportunity-details-page__pagination-page"
                  }
                  onClick={() => {
                    setGroupPage(item);
                    scrollToElement(mainToolbarRef.current);
                  }}
                >
                  {item}
                </button>
              ) : (
                <span key={`groups-${item}-${index}`} className="opportunity-details-page__pagination-ellipsis">
                  ...
                </span>
              ),
            )}
            <button
              type="button"
              className="opportunity-details-page__pagination-arrow"
              onClick={() => {
                setGroupPage((current) => Math.min(totalGroupPages, current + 1));
                scrollToElement(mainToolbarRef.current);
              }}
              disabled={groupPage === totalGroupPages}
              aria-label="Следующая страница вакансий"
            >
              <img src={arrowIcon} alt="" aria-hidden="true" className="opportunity-details-page__pagination-arrow-icon" />
            </button>
          </nav>
        ) : null}
      </Container>

      <Modal
        title="Изменение статуса"
        isOpen={Boolean(editingResponseContext)}
        onClose={closeStatusModal}
        panelClassName="employer-responses-page__status-modal"
      >
        {editingResponseContext ? (
          <div className="modal__form employer-responses-page__status-modal-body">
            <div className="modal__copy employer-responses-page__status-modal-copy">
              <p>Кандидат: {editingResponseContext.response.name}</p>
              <p>Вакансия: {editingResponseContext.opportunityTitle}</p>
              <p>Отклик: {formatEmployerResponseAppliedAt(editingResponseContext.response.appliedAt)}</p>
            </div>

            <div className="modal__field modal__field--compact employer-responses-page__status-field employer-responses-page__status-field--selector">
              <span className="modal__field-label employer-responses-page__status-field-label">Выберите статус:</span>
              <div className="employer-responses-page__status-options">
                {responseStatusOptions.map((option) => (
                  <label key={option.value} className="modal__option employer-responses-page__status-radio">
                    <Radio
                      checked={draftStatus === option.value}
                      onChange={() => setDraftStatus(option.value)}
                      variant="primary"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {draftStatus === "accepted" ? (
              <>
                <div className="modal__field modal__field--compact employer-responses-page__status-field">
                  <span className="modal__field-label employer-responses-page__status-field-label">Назначьте дату собеседования:</span>
                  <DateInput className="input--sm" value={draftInterviewDate} onChange={setDraftInterviewDate} variant="primary" />
                </div>

                <div className="employer-responses-page__meeting-schedule">
                  <label className="modal__field modal__field--compact employer-responses-page__status-field">
                    <span className="modal__field-label employer-responses-page__status-field-label">Начало:</span>
                    <Input className="input--sm employer-responses-page__time-input" type="time" value={draftInterviewStartTime} onChange={(event) => setDraftInterviewStartTime(event.target.value)} clearable={false} />
                  </label>
                  <label className="modal__field modal__field--compact employer-responses-page__status-field">
                    <span className="modal__field-label employer-responses-page__status-field-label">Окончание:</span>
                    <Input className="input--sm employer-responses-page__time-input" type="time" value={draftInterviewEndTime} onChange={(event) => setDraftInterviewEndTime(event.target.value)} clearable={false} />
                  </label>
                </div>

                <label className="modal__field modal__field--compact employer-responses-page__status-field">
                  <span className="modal__field-label employer-responses-page__status-field-label">Формат:</span>
                  <Input className="input--sm" value={draftInterviewFormat} onChange={(event) => setDraftInterviewFormat(event.target.value)} />
                </label>

                <label className="modal__field modal__field--compact employer-responses-page__status-field">
                  <span className="modal__field-label employer-responses-page__status-field-label">Ссылка:</span>
                  <Input className="input--sm" value={draftMeetingLink} onChange={(event) => setDraftMeetingLink(event.target.value)} />
                </label>

                <label className="modal__field modal__field--compact employer-responses-page__status-field">
                  <span className="modal__field-label employer-responses-page__status-field-label">Контакты:</span>
                  <Input className="input--sm" value={draftContactEmail} onChange={(event) => setDraftContactEmail(event.target.value)} />
                </label>

                <label className="modal__field modal__field--compact employer-responses-page__status-field">
                  <span className="modal__field-label employer-responses-page__status-field-label">Что взять с собой:</span>
                  <textarea
                    className="modal__textarea employer-responses-page__status-textarea employer-responses-page__status-textarea--sm"
                    placeholder="Каждый пункт с новой строки"
                    value={draftChecklist}
                    onChange={(event) => setDraftChecklist(event.target.value)}
                  />
                </label>
              </>
            ) : null}

            <label className="modal__field modal__field--compact employer-responses-page__status-field">
              <span className="modal__field-label employer-responses-page__status-field-label">Комментарий:</span>
              <textarea
                className="modal__textarea employer-responses-page__status-textarea employer-responses-page__status-textarea--sm"
                placeholder="Введите комментарий"
                value={draftComment}
                onChange={(event) => setDraftComment(event.target.value)}
              />
            </label>

            <div className="modal__actions employer-responses-page__status-actions">
              <Button type="button" variant="cancel" size="md" fullWidth onClick={closeStatusModal}>
                Отмена
              </Button>
              <Button type="button" variant="primary" size="md" fullWidth onClick={handleSaveStatus}>
                Подтвердить
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Footer theme="employer" />
    </main>
  );
}
