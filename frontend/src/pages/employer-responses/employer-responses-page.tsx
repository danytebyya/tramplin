import { useEffect, useMemo, useRef, useState } from "react";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useNavigationType } from "react-router-dom";

import arrowIcon from "../../assets/icons/arrow.svg";
import jobIcon from "../../assets/icons/job.svg";
import locationIcon from "../../assets/icons/location.svg";
import searchIcon from "../../assets/icons/search.svg";
import timeIcon from "../../assets/icons/time.svg";
import {
  CitySelection,
  readSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import {
  formatEmployerResponseAppliedAt,
  getEmployerResponseRecord,
  listEmployerResponseRecords,
  saveEmployerResponse,
  subscribeEmployerResponses,
  type EmployerResponseRecord,
} from "../../features/employer-responses";
import {
  getEmployerAccessState,
  resolveEmployerFallbackRoute,
  useAuthStore,
} from "../../features/auth";
import { createApplicantChatRequest, resolveAvatarIcon, updateApplicantChatRequestStatus } from "../../shared/lib";
import { Button, Checkbox, Container, DateInput, Input, Modal, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildEmployerProfileMenuItems, Header } from "../../widgets/header";
import {
  EmployerOpportunityItem,
  listEmployerOpportunitiesRequest,
} from "../../features/opportunity";
import { listOpportunityRecommendationCandidatesRequest, type OpportunityRecommendationCandidate } from "../../entities/opportunity/api";
import "../favorites/favorites.css";
import "../opportunity-details/opportunity-details.css";
import "./employer-responses.css";

type EmployerResponseStatus = "new" | "accepted" | "reserve" | "rejected";
type EmployerResponseMetricKey = "total" | "new" | "accepted" | "reserve";
type ResponseSortField = "date" | "name" | "status";
type ResponseSortDirection = "asc" | "desc";
type OpportunityKindFilter = "all" | EmployerOpportunityItem["kind"];
type GroupSortField = "date" | "title" | "count";
type ResponseCard = {
  id: string;
  userId: string;
  publicId: string | null;
  name: string;
  subtitle: string;
  isOnline: boolean;
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
  kind: EmployerOpportunityItem["kind"];
  responses: ResponseCard[];
};

type EmployerResponsesPageSnapshot = {
  opportunitySearch: string;
  selectedKinds: OpportunityKindFilter[];
  expandedOpportunityIds: string[];
  groupPage: number;
  cardPages: Record<string, number>;
  groupSearch: Record<string, string>;
  groupStatuses: Record<string, EmployerResponseStatus[]>;
  groupSortFields: Record<string, ResponseSortField>;
  groupSortDirections: Record<string, ResponseSortDirection>;
  mainSortField: GroupSortField;
  mainSortDirection: ResponseSortDirection;
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
  { value: "reserve", label: "В резерве" },
  { value: "rejected", label: "Отклонено" },
];

const opportunityKindOptions: Array<{ value: OpportunityKindFilter; label: string }> = [
  { value: "all", label: "Все возможности" },
  { value: "vacancy", label: "Вакансии" },
  { value: "internship", label: "Стажировки" },
  { value: "event", label: "Мероприятия" },
  { value: "mentorship", label: "Менторские программы" },
];

const groupSortOptions: Array<{ value: GroupSortField; label: string }> = [
  { value: "date", label: "По дате публикации" },
  { value: "title", label: "По названию" },
  { value: "count", label: "По числу откликов" },
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

function addDays(value: string | null | undefined, days: number) {
  const baseDate = value ? new Date(value) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return new Date().toISOString();
  }

  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString();
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

function resolveResponseStatus(index: number): EmployerResponseStatus {
  const sequence: EmployerResponseStatus[] = ["new", "accepted", "reserve", "rejected"];
  return sequence[index % sequence.length] ?? "new";
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

function resolveLevelClassName(levelLabel: string | null) {
  const normalized = levelLabel?.trim().toLowerCase();

  if (normalized === "middle") {
    return "opportunity-details-page__contact-level-badge opportunity-details-page__contact-level-badge--warning";
  }

  if (normalized === "senior") {
    return "opportunity-details-page__contact-level-badge opportunity-details-page__contact-level-badge--danger";
  }

  return "opportunity-details-page__contact-level-badge opportunity-details-page__contact-level-badge--success";
}

function mapCandidateToResponseCard(
  candidate: OpportunityRecommendationCandidate,
  opportunity: EmployerOpportunityItem,
  index: number,
  savedRecord: EmployerResponseRecord | null,
): ResponseCard {
  const [firstTag, ...remainingTags] = candidate.tags;
  const normalizedLevel = firstTag?.trim().toLowerCase();
  const isLevelTag = normalizedLevel === "junior" || normalizedLevel === "middle" || normalizedLevel === "senior";

  return {
    id: candidate.publicId || candidate.userId,
    userId: candidate.userId,
    publicId: candidate.publicId,
    name: candidate.displayName,
    subtitle: candidate.subtitle,
    isOnline: candidate.isOnline,
    levelLabel: isLevelTag ? firstTag : null,
    tags: isLevelTag ? remainingTags : candidate.tags,
    city: candidate.city,
    salaryLabel: candidate.salaryLabel,
    formatLabel: candidate.formatLabel,
    employmentLabel: candidate.employmentLabel,
    avatarSrc: resolveAvatarIcon("applicant"),
    status: savedRecord?.status ?? resolveResponseStatus(index),
    appliedAt: savedRecord?.appliedAt ?? addDays(opportunity.publishedAt, index + 1),
    interviewDate: savedRecord?.interviewDate ?? null,
    interviewStartTime: savedRecord?.interviewStartTime ?? null,
    interviewEndTime: savedRecord?.interviewEndTime ?? null,
    interviewFormat: savedRecord?.interviewFormat ?? "Онлайн (Яндекс Телемост)",
    meetingLink: savedRecord?.meetingLink ?? null,
    contactEmail: savedRecord?.contactEmail ?? null,
    checklist: savedRecord?.checklist ?? null,
    employerComment: savedRecord?.employerComment ?? null,
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
  const [selectedKinds, setSelectedKinds] = useState<OpportunityKindFilter[]>(["all"]);
  const [expandedOpportunityIds, setExpandedOpportunityIds] = useState<string[]>([]);
  const [groupPage, setGroupPage] = useState(1);
  const [cardPages, setCardPages] = useState<Record<string, number>>({});
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});
  const [groupStatuses, setGroupStatuses] = useState<Record<string, EmployerResponseStatus[]>>({});
  const [groupSortFields, setGroupSortFields] = useState<Record<string, ResponseSortField>>({});
  const [groupSortDirections, setGroupSortDirections] = useState<Record<string, ResponseSortDirection>>({});
  const [isMainFilterOpen, setIsMainFilterOpen] = useState(false);
  const [isMainSortOpen, setIsMainSortOpen] = useState(false);
  const [mainSortField, setMainSortField] = useState<GroupSortField>("date");
  const [mainSortDirection, setMainSortDirection] = useState<ResponseSortDirection>("desc");
  const [responseWorkflowVersion, setResponseWorkflowVersion] = useState(0);
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
  const mainFiltersRef = useRef<HTMLDivElement | null>(null);
  const mainSortingRef = useRef<HTMLDivElement | null>(null);
  const filterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sortRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const employerAccess = getEmployerAccessState(role, accessToken);

  const opportunitiesQuery = useQuery({
    queryKey: ["employer", "opportunities"],
    queryFn: listEmployerOpportunitiesRequest,
    enabled: role === "employer",
    staleTime: 30_000,
  });

  const employerOpportunities = opportunitiesQuery.data ?? [];
  const responseQueries = useQueries({
    queries: employerOpportunities.map((opportunity) => ({
      queryKey: ["opportunities", opportunity.id, "recommendation-candidates"],
      queryFn: () => listOpportunityRecommendationCandidatesRequest(opportunity.id),
      enabled: role === "employer",
      staleTime: 30_000,
    })),
  });

  const isLoading = opportunitiesQuery.isPending || responseQueries.some((query) => query.isPending);
  const savedResponseRecords = useMemo(() => listEmployerResponseRecords(), [responseWorkflowVersion]);

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
      setSelectedKinds(snapshot.selectedKinds?.length ? snapshot.selectedKinds : ["all"]);
      setExpandedOpportunityIds(snapshot.expandedOpportunityIds ?? []);
      setGroupPage(snapshot.groupPage ?? 1);
      setCardPages(snapshot.cardPages ?? {});
      setGroupSearch(snapshot.groupSearch ?? {});
      setGroupStatuses(snapshot.groupStatuses ?? {});
      setGroupSortFields(snapshot.groupSortFields ?? {});
      setGroupSortDirections(snapshot.groupSortDirections ?? {});
      setMainSortField(snapshot.mainSortField ?? "date");
      setMainSortDirection(snapshot.mainSortDirection ?? "desc");

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
      selectedKinds,
      expandedOpportunityIds,
      groupPage,
      cardPages,
      groupSearch,
      groupStatuses,
      groupSortFields,
      groupSortDirections,
      mainSortField,
      mainSortDirection,
      scrollY: window.scrollY,
    };

    sessionStorage.setItem(EMPLOYER_RESPONSES_SNAPSHOT_KEY, JSON.stringify(snapshot));
  }, [
    cardPages,
    expandedOpportunityIds,
    groupPage,
    groupSearch,
    groupSortDirections,
    groupSortFields,
    groupStatuses,
    mainSortDirection,
    mainSortField,
    opportunitySearch,
    selectedKinds,
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

  useEffect(() => subscribeEmployerResponses(() => setResponseWorkflowVersion((current) => current + 1)), []);

  useEffect(() => {
    if (!openedFilterGroupId && !openedSortGroupId && !isMainFilterOpen && !isMainSortOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (isMainFilterOpen && !mainFiltersRef.current?.contains(target)) {
        setIsMainFilterOpen(false);
      }

      if (isMainSortOpen && !mainSortingRef.current?.contains(target)) {
        setIsMainSortOpen(false);
      }

      if (openedFilterGroupId && !filterRefs.current[openedFilterGroupId]?.contains(target)) {
        setOpenedFilterGroupId(null);
      }

      if (openedSortGroupId && !sortRefs.current[openedSortGroupId]?.contains(target)) {
        setOpenedSortGroupId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMainFilterOpen(false);
        setIsMainSortOpen(false);
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
  }, [isMainFilterOpen, isMainSortOpen, openedFilterGroupId, openedSortGroupId]);

  useEffect(() => {
    setGroupPage(1);
  }, [mainSortDirection, mainSortField, opportunitySearch, selectedKinds]);

  const responseGroups = useMemo<ResponseGroup[]>(() => employerOpportunities.map((opportunity, index) => ({
    opportunityId: opportunity.id,
    title: opportunity.title,
    publishedAt: opportunity.publishedAt,
    kind: opportunity.kind,
    responses: (responseQueries[index]?.data ?? []).map((candidate, candidateIndex) =>
      mapCandidateToResponseCard(
        candidate,
        opportunity,
        candidateIndex,
        savedResponseRecords.find(
          (record) => record.opportunityId === opportunity.id && record.applicantUserId === candidate.userId,
        ) ?? null,
      ),
    ),
  })), [employerOpportunities, responseQueries, savedResponseRecords]);

  const availableGroups = useMemo(
    () => responseGroups.filter((group, index) => group.responses.length > 0 || (employerOpportunities[index]?.responsesCount ?? 0) > 0),
    [employerOpportunities, responseGroups],
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
    const activeKinds = selectedKinds.includes("all") ? [] : selectedKinds;

    const nextGroups = availableGroups.filter((group) => {
      if (normalizedSearch && !normalizeText(group.title).includes(normalizedSearch)) {
        return false;
      }

      if (activeKinds.length > 0 && !activeKinds.includes(group.kind)) {
        return false;
      }

      return true;
    });

    return nextGroups.sort((left, right) => {
      const multiplier = mainSortDirection === "asc" ? 1 : -1;

      if (mainSortField === "title") {
        return left.title.localeCompare(right.title, "ru") * multiplier;
      }

      if (mainSortField === "count") {
        return (left.responses.length - right.responses.length) * multiplier;
      }

      return (
        (new Date(left.publishedAt ?? 0).getTime() - new Date(right.publishedAt ?? 0).getTime()) * multiplier
      );
    });
  }, [availableGroups, mainSortDirection, mainSortField, opportunitySearch, selectedKinds]);

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

  const handleToggleKind = (value: OpportunityKindFilter) => {
    if (value === "all") {
      setSelectedKinds(["all"]);
      return;
    }

    setSelectedKinds((current) => {
      const normalized = current.filter((item) => item !== "all");
      if (normalized.includes(value)) {
        const nextValues = normalized.filter((item) => item !== value);
        return nextValues.length > 0 ? nextValues : ["all"];
      }

      return [...normalized, value];
    });
  };

  const handleToggleGroup = (opportunityId: string) => {
    setExpandedOpportunityIds((current) =>
      current.includes(opportunityId)
        ? current.filter((item) => item !== opportunityId)
        : [...current, opportunityId],
    );
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
    const savedRecord = getEmployerResponseRecord(opportunityId, response.userId);

    setEditingResponseContext({
      opportunityId,
      opportunityTitle,
      response,
    });
    setDraftStatus(savedRecord?.status ?? response.status);
    setDraftInterviewDate(savedRecord?.interviewDate ?? response.interviewDate ?? "");
    setDraftInterviewStartTime(savedRecord?.interviewStartTime ?? response.interviewStartTime ?? "");
    setDraftInterviewEndTime(savedRecord?.interviewEndTime ?? response.interviewEndTime ?? "");
    setDraftInterviewFormat(savedRecord?.interviewFormat ?? response.interviewFormat ?? "Онлайн (Яндекс Телемост)");
    setDraftMeetingLink(savedRecord?.meetingLink ?? response.meetingLink ?? "");
    setDraftContactEmail(savedRecord?.contactEmail ?? response.contactEmail ?? "");
    setDraftChecklist(savedRecord?.checklist ?? response.checklist ?? "");
    setDraftComment(savedRecord?.employerComment ?? response.employerComment ?? "");
  };

  const handleSaveStatus = () => {
    if (!editingResponseContext) {
      return;
    }

    saveEmployerResponse({
      opportunityId: editingResponseContext.opportunityId,
      opportunityTitle: editingResponseContext.opportunityTitle,
      applicantUserId: editingResponseContext.response.userId,
      applicantName: editingResponseContext.response.name,
      appliedAt: editingResponseContext.response.appliedAt,
      status: draftStatus,
      interviewDate: draftStatus === "accepted" ? (draftInterviewDate || null) : null,
      interviewStartTime: draftStatus === "accepted" ? (draftInterviewStartTime || null) : null,
      interviewEndTime: draftStatus === "accepted" ? (draftInterviewEndTime || null) : null,
      interviewFormat: draftStatus === "accepted" ? (draftInterviewFormat.trim() || null) : null,
      meetingLink: draftStatus === "accepted" ? (draftMeetingLink.trim() || null) : null,
      contactEmail: draftStatus === "accepted" ? (draftContactEmail.trim() || null) : null,
      checklist: draftStatus === "accepted" ? (draftChecklist.trim() || null) : null,
      employerComment: draftComment.trim() || null,
    });

    void queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] });
    closeStatusModal();
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
        containerClassName="employer-responses-page__header-container"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
      />

      <Container className="employer-responses-page__container settings-page__container">
        <nav className="employer-responses-page__tabs" aria-label="Разделы работодателя">
          {employerAccess.canManageCompanyProfile ? (
            <button type="button" className="employer-responses-page__tab" onClick={() => navigate("/dashboard/employer")}>
              Профиль компании
            </button>
          ) : null}
          {employerAccess.canManageOpportunities ? (
            <button type="button" className="employer-responses-page__tab" onClick={() => navigate("/employer/opportunities")}>
              Управление возможностями
            </button>
          ) : null}
          <button type="button" className="employer-responses-page__tab employer-responses-page__tab--active">
            Отклики
          </button>
          {employerAccess.canAccessChat ? (
            <button type="button" className="employer-responses-page__tab" onClick={() => navigate("/employer/chat")}>
              Чат
            </button>
          ) : null}
          <button type="button" className="employer-responses-page__tab" onClick={() => navigate("/settings")}>
            Настройки
          </button>
        </nav>

        <div className="employer-responses-page__content">
          <section className="employer-responses-page__section">
            <section className="favorites-page__metrics" aria-label="Статистика откликов">
              {metricDefinitions.map((metric) => (
                <article key={metric.key} className="favorites-page__metric-card">
                  {isLoading ? (
                    <>
                      <span className="favorites-page__skeleton favorites-page__skeleton--metric-label" />
                      <span className="favorites-page__skeleton favorites-page__skeleton--metric-value" />
                    </>
                  ) : (
                    <>
                      <span className="favorites-page__metric-label">{metric.label}</span>
                      <strong className="favorites-page__metric-value">{formatCount(metrics[metric.key])}</strong>
                    </>
                  )}
                </article>
              ))}
            </section>
          </section>

          <section className="employer-responses-page__section">
            <section className="favorites-page__toolbar">
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

              <div className="favorites-page__toolbar-actions">
                <div ref={mainFiltersRef} className="favorites-page__filters">
                  <button
                    type="button"
                    className="favorites-page__icon-button favorites-page__icon-button--filter"
                    aria-label="Фильтры по возможностям"
                    aria-expanded={isMainFilterOpen}
                    onClick={() => {
                      setIsMainSortOpen(false);
                      setIsMainFilterOpen((current) => !current);
                    }}
                  >
                    <span className="favorites-page__icon favorites-page__icon--filter" aria-hidden="true" />
                  </button>

                  {isMainFilterOpen ? (
                    <div className="favorites-page__popover favorites-page__popover--compact">
                      <div className="favorites-page__popover-section">
                        <div className="favorites-page__popover-head">
                          <h2 className="favorites-page__popover-title">Фильтры</h2>
                          <button type="button" className="favorites-page__popover-reset" onClick={() => setSelectedKinds(["all"])}>
                            Сбросить
                          </button>
                        </div>
                      </div>

                      <div className="favorites-page__popover-section">
                        <div className="favorites-page__option-list">
                          {opportunityKindOptions.map((option) => (
                            <label key={option.value} className="favorites-page__option">
                              <Checkbox
                                checked={selectedKinds.includes(option.value)}
                                onChange={() => handleToggleKind(option.value)}
                                variant="secondary"
                              />
                              <span>{option.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div ref={mainSortingRef} className="favorites-page__sorting">
                  <button
                    type="button"
                    className="favorites-page__icon-button favorites-page__icon-button--sorting"
                    aria-label="Сортировка возможностей"
                    aria-expanded={isMainSortOpen}
                    onClick={() => {
                      setIsMainFilterOpen(false);
                      setIsMainSortOpen((current) => !current);
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={
                        mainSortDirection === "desc"
                          ? "favorites-page__icon favorites-page__icon--sorting"
                          : "favorites-page__icon favorites-page__icon--sorting favorites-page__icon--ascending"
                      }
                    />
                  </button>

                  {isMainSortOpen ? (
                    <div className="favorites-page__popover favorites-page__popover--compact">
                      <div className="favorites-page__popover-section">
                        <div className="favorites-page__popover-head">
                          <h2 className="favorites-page__popover-title">Сортировка</h2>
                          <button
                            type="button"
                            className="favorites-page__popover-reset"
                            onClick={() => {
                              setMainSortField("date");
                              setMainSortDirection("desc");
                            }}
                          >
                            Сбросить
                          </button>
                        </div>
                      </div>

                      <div className="favorites-page__popover-section">
                        <div className="favorites-page__option-list">
                          {groupSortOptions.map((option) => (
                            <label key={option.value} className="favorites-page__option">
                              <Radio
                                checked={mainSortField === option.value}
                                onChange={() => setMainSortField(option.value)}
                                variant="secondary"
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
                              checked={mainSortDirection === "asc"}
                              onChange={() => setMainSortDirection("asc")}
                              variant="secondary"
                            />
                            <span>{mainSortField === "title" ? "А-Я" : "По возрастанию"}</span>
                          </label>
                          <label className="favorites-page__option">
                            <Radio
                              checked={mainSortDirection === "desc"}
                              onChange={() => setMainSortDirection("desc")}
                              variant="secondary"
                            />
                            <span>{mainSortField === "title" ? "Я-А" : "По убыванию"}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
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
                ? "employer-responses-page__responses-grid employer-responses-page__responses-grid--single"
                : visibleResponses.length === 2
                  ? "employer-responses-page__responses-grid employer-responses-page__responses-grid--double"
                  : "employer-responses-page__responses-grid employer-responses-page__responses-grid--triple";

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
                    className={`employer-responses-page__group-arrow${isExpanded ? " employer-responses-page__group-arrow--expanded" : ""}`}
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
                    <div className="favorites-page__toolbar employer-responses-page__group-toolbar">
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
                            onClick={() => {
                              setOpenedSortGroupId(null);
                              setOpenedFilterGroupId((current) => current === group.opportunityId ? null : group.opportunityId);
                            }}
                          >
                            <span className="favorites-page__icon favorites-page__icon--filter" aria-hidden="true" />
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
                                        variant="secondary"
                                      />
                                      <span>{option.label}</span>
                                    </label>
                                  ))}
                                </div>
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
                              setOpenedFilterGroupId(null);
                              setOpenedSortGroupId((current) => current === group.opportunityId ? null : group.opportunityId);
                            }}
                          >
                            <span
                              aria-hidden="true"
                              className={
                                groupSortDirection === "desc"
                                  ? "favorites-page__icon favorites-page__icon--sorting"
                                  : "favorites-page__icon favorites-page__icon--sorting favorites-page__icon--ascending"
                              }
                            />
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
                                        variant="secondary"
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
                                      variant="secondary"
                                    />
                                    <span>{groupSortField === "name" ? "А-Я" : "По возрастанию"}</span>
                                  </label>
                                  <label className="favorites-page__option">
                                    <Radio
                                      checked={groupSortDirection === "desc"}
                                      onChange={() => setGroupSortDirections((current) => ({ ...current, [group.opportunityId]: "desc" }))}
                                      variant="secondary"
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
                            <article key={`${group.opportunityId}-${response.id}`} className="opportunity-details-page__contact-card employer-responses-page__response-card">
                              <div className="opportunity-details-page__contact-id-block">
                                <span className="opportunity-details-page__contact-id">id: {response.id.slice(-6)}</span>
                              </div>

                              <div className="opportunity-details-page__contact-primary">
                                <div className="opportunity-details-page__contact-avatar-shell">
                                  <img src={response.avatarSrc} alt="" aria-hidden="true" className="opportunity-details-page__contact-avatar" />
                                </div>
                                <h3 className="opportunity-details-page__contact-name">{response.name}</h3>
                                <p className="opportunity-details-page__contact-subtitle">{response.subtitle}</p>
                                <p className="opportunity-details-page__contact-status">
                                  <span className={`opportunity-details-page__contact-dot${response.isOnline ? " opportunity-details-page__contact-dot--online" : ""}`} />
                                  {response.isOnline ? "Online" : "Недавно в сети"}
                                </p>
                              </div>

                              {response.levelLabel || response.tags.length > 0 ? (
                                <div className="opportunity-details-page__contact-tags">
                                  {response.levelLabel ? (
                                    <span className={resolveLevelClassName(response.levelLabel)}>{response.levelLabel}</span>
                                  ) : null}
                                  {response.tags.map((tag) => (
                                    <span key={`${response.id}-${tag}`} className="opportunity-details-page__contact-tag">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}

                              <div className="opportunity-details-page__contact-meta employer-responses-page__contact-meta">
                                <span className="opportunity-details-page__contact-meta-item">
                                  <img src={locationIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon" />
                                  {response.city}
                                </span>
                                <span className="opportunity-details-page__contact-meta-item">
                                  <img src={jobIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon" />
                                  {response.salaryLabel}
                                </span>
                                <span className="opportunity-details-page__contact-meta-item">
                                  <img src={jobIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon" />
                                  {response.formatLabel}
                                </span>
                                <span className="opportunity-details-page__contact-meta-item">
                                  <img src={timeIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon" />
                                  {response.employmentLabel}
                                </span>
                              </div>

                              <p className="employer-responses-page__response-date">
                                Отклик: {formatEmployerResponseAppliedAt(response.appliedAt)}
                              </p>

                              <div className="employer-responses-page__status-row">
                                <span className="employer-responses-page__status-label">Статус:</span>
                                <Status variant={resolveStatusVariant(response.status)}>{resolveStatusLabel(response.status)}</Status>
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
                                      navigate(`/profiles/${response.publicId}`);
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
                              onClick={() => setCardPages((current) => ({ ...current, [group.opportunityId]: Math.max(1, safePage - 1) }))}
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
                                  onClick={() => setCardPages((current) => ({ ...current, [group.opportunityId]: item }))}
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
                              onClick={() => setCardPages((current) => ({ ...current, [group.opportunityId]: Math.min(totalPages, safePage + 1) }))}
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
                        <img src={searchIcon} alt="" aria-hidden="true" className="employer-responses-page__empty-group-icon" />
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
              onClick={() => setGroupPage((current) => Math.max(1, current - 1))}
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
                  onClick={() => setGroupPage(item)}
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
              onClick={() => setGroupPage((current) => Math.min(totalGroupPages, current + 1))}
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
          <div className="employer-responses-page__status-modal-body">
            <div className="employer-responses-page__status-modal-copy">
              <p>Кандидат: {editingResponseContext.response.name}</p>
              <p>Вакансия: {editingResponseContext.opportunityTitle}</p>
              <p>Отклик: {formatEmployerResponseAppliedAt(editingResponseContext.response.appliedAt)}</p>
            </div>

            <div className="employer-responses-page__status-field">
              <span className="employer-responses-page__status-field-label">Выберите статус:</span>
              <div className="employer-responses-page__status-radio-grid">
                {responseStatusOptions.map((option) => (
                  <label key={option.value} className="employer-responses-page__status-radio">
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
                <div className="employer-responses-page__status-field">
                  <span className="employer-responses-page__status-field-label">Назначьте дату собеседования:</span>
                  <DateInput value={draftInterviewDate} onChange={setDraftInterviewDate} variant="primary" />
                </div>

                <div className="employer-responses-page__status-time-grid">
                  <label className="employer-responses-page__status-field">
                    <span className="employer-responses-page__status-field-label">Начало:</span>
                    <Input type="time" value={draftInterviewStartTime} onChange={(event) => setDraftInterviewStartTime(event.target.value)} />
                  </label>
                  <label className="employer-responses-page__status-field">
                    <span className="employer-responses-page__status-field-label">Окончание:</span>
                    <Input type="time" value={draftInterviewEndTime} onChange={(event) => setDraftInterviewEndTime(event.target.value)} />
                  </label>
                </div>

                <label className="employer-responses-page__status-field">
                  <span className="employer-responses-page__status-field-label">Формат:</span>
                  <Input value={draftInterviewFormat} onChange={(event) => setDraftInterviewFormat(event.target.value)} />
                </label>

                <label className="employer-responses-page__status-field">
                  <span className="employer-responses-page__status-field-label">Ссылка:</span>
                  <Input value={draftMeetingLink} onChange={(event) => setDraftMeetingLink(event.target.value)} />
                </label>

                <label className="employer-responses-page__status-field">
                  <span className="employer-responses-page__status-field-label">Контакты:</span>
                  <Input value={draftContactEmail} onChange={(event) => setDraftContactEmail(event.target.value)} />
                </label>

                <label className="employer-responses-page__status-field">
                  <span className="employer-responses-page__status-field-label">Что взять с собой:</span>
                  <textarea
                    className="employer-responses-page__status-textarea"
                    placeholder="Каждый пункт с новой строки"
                    value={draftChecklist}
                    onChange={(event) => setDraftChecklist(event.target.value)}
                  />
                </label>
              </>
            ) : null}

            <label className="employer-responses-page__status-field">
              <span className="employer-responses-page__status-field-label">Комментарий:</span>
              <textarea
                className="employer-responses-page__status-textarea"
                placeholder="Введите комментарий"
                value={draftComment}
                onChange={(event) => setDraftComment(event.target.value)}
              />
            </label>

            <div className="employer-responses-page__status-actions">
              <Button type="button" variant="primary-outline" fullWidth onClick={closeStatusModal}>
                Отменить
              </Button>
              <Button type="button" variant="primary" fullWidth onClick={handleSaveStatus}>
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
