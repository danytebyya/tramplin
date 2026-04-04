import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import sadSearchIcon from "../../assets/icons/sad-search.png";
import { CitySelection, CitySelector, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { Opportunity } from "../../entities/opportunity";
import { listOpportunitiesRequest } from "../../entities/opportunity/api";
import {
  listMyApplicationsRequest,
  WithdrawApplicationModal,
  withdrawOpportunityApplicationRequest,
  type ApplicationDetails,
} from "../../features/applications";
import {
  addFavoriteOpportunityRequest,
  listFavoriteOpportunitiesRequest,
  removeFavoriteOpportunityRequest,
} from "../../features/favorites";
import { useAuthStore } from "../../features/auth";
import { useNotificationsRealtime } from "../../features/notifications";
import {
  buildOpportunityExplorerRoute,
  buildOpportunitySearchText,
  normalizeOpportunitySearchText,
  opportunityCategoryLinks,
  OPPORTUNITY_EXPLORER_PATH,
} from "../../shared/lib";
import { Badge, Button, Checkbox, Container, Input, ProfileTabs, Radio, Status, VerifiedTooltip } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildApplicantProfileMenuItems, Header } from "../../widgets/header";
import "../favorites/favorites.css";
import "../settings/settings.css";
import "./applications.css";

type ApplicantApplicationStatus = "accepted" | "pending" | "reserve" | "rejected" | "withdrawn";
type ApplicationMetricKey = "total" | ApplicantApplicationStatus;
type ApplicationSortField = "title" | "published";
type ApplicationSortDirection = "asc" | "desc";

type ApplicantApplicationItem = {
  opportunity: Opportunity;
  status: ApplicantApplicationStatus;
  submittedAt: string;
  updatedAt: string;
  statusMessage: string;
  employerComment: string | null;
  interviewDate: string | null;
  interviewStartTime: string | null;
  interviewEndTime: string | null;
  interviewFormat: string | null;
  meetingLink: string | null;
  contactEmail: string | null;
  checklist: string | null;
};

const metricDefinitions: Array<{ key: ApplicationMetricKey; label: string }> = [
  { key: "total", label: "Всего:" },
  { key: "accepted", label: "Принято:" },
  { key: "pending", label: "На рассмотрении:" },
  { key: "rejected", label: "Отклонено:" },
];

const ALL_TIME_PUBLICATION_OPTION = "За все время";
const publicationOptions = ["За неделю", "За месяц", ALL_TIME_PUBLICATION_OPTION];
const applicationStatusOptions: Array<{ value: ApplicantApplicationStatus; label: string }> = [
  { value: "accepted", label: "Принято" },
  { value: "pending", label: "На рассмотрении" },
  { value: "rejected", label: "Отклонено" },
];

function matchesApplicationsSearch(item: ApplicantApplicationItem, query: string) {
  const normalizedQuery = normalizeOpportunitySearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const statusMeta = resolveApplicationStatusMeta(item.status);
  const searchableText = normalizeOpportunitySearchText([
    buildOpportunitySearchText(item.opportunity),
    statusMeta.label,
    item.statusMessage,
    item.employerComment,
    item.interviewFormat,
    item.contactEmail,
  ].filter(Boolean).join(" "));

  return searchableText.includes(normalizedQuery);
}

function matchesPublicationPeriod(value: string | null | undefined, periods: string[]) {
  if (
    periods.length === 0 ||
    periods.includes(ALL_TIME_PUBLICATION_OPTION) ||
    periods.includes("За все время")
  ) {
    return true;
  }

  if (!value) {
    return false;
  }

  const publishedAt = new Date(value);
  if (Number.isNaN(publishedAt.getTime())) {
    return false;
  }

  const now = Date.now();
  const elapsedMs = now - publishedAt.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  return periods.some((period) => {
    if (period === "За неделю") {
      return elapsedMs <= oneDayMs * 7;
    }

    if (period === "За месяц") {
      return elapsedMs <= oneDayMs * 30;
    }

    return false;
  });
}

function easeOutQuad(value: number) {
  return 1 - (1 - value) * (1 - value);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function resolveApplicationStatusMeta(status: ApplicantApplicationStatus) {
  if (status === "accepted") {
    return { label: "Принято", variant: "approved" as const };
  }

  if (status === "withdrawn") {
    return { label: "Отозвано соискателем", variant: "rejected" as const };
  }

  if (status === "rejected") {
    return { label: "Отклонено", variant: "rejected" as const };
  }

  if (status === "reserve") {
    return { label: "В резерве", variant: "info-request" as const };
  }

  return { label: "На рассмотрении", variant: "pending-review" as const };
}

function resolveApplicantApplicationStatus(record: ApplicationDetails | null): ApplicantApplicationStatus {
  if (!record) {
    return "pending";
  }

  if (record.status === "rejected" || record.status === "canceled") {
    return "rejected";
  }

  if (record.status === "withdrawn") {
    return "withdrawn";
  }

  if (record.status === "reserved") {
    return "reserve";
  }

  if (record.status === "interview" || record.status === "offer" || record.status === "accepted") {
    return "accepted";
  }

  return "pending";
}

function buildApplicationStatusMessage(opportunity: Opportunity, record: ApplicationDetails | null) {
  if (!record || resolveApplicantApplicationStatus(record) === "pending") {
    return "Отклик отправлен и ожидает рассмотрения работодателем.";
  }

  if (resolveApplicantApplicationStatus(record) === "withdrawn") {
    return "Вы отозвали отклик. Эта запись сохранена в истории, и вы можете подать отклик заново.";
  }

  if (resolveApplicantApplicationStatus(record) === "accepted") {
    return `Работодатель пригласил вас на следующий этап по возможности «${opportunity.title}».`;
  }

  if (resolveApplicantApplicationStatus(record) === "reserve") {
    return `Ваш отклик по возможности «${opportunity.title}» переведен в резерв.`;
  }

  return `По отклику на возможность «${opportunity.title}» получен отказ.`;
}

function buildApplicationDetails(
  opportunity: Opportunity,
  responseRecord: ApplicationDetails | null,
): ApplicantApplicationItem {
  const submittedAt = responseRecord?.submitted_at ?? opportunity.publishedAt ?? new Date().toISOString();
  const updatedAt = responseRecord?.status_changed_at ?? submittedAt;

  return {
    opportunity,
    status: resolveApplicantApplicationStatus(responseRecord),
    submittedAt,
    updatedAt,
    statusMessage: buildApplicationStatusMessage(opportunity, responseRecord),
    employerComment: responseRecord?.employer_comment ?? null,
    interviewDate: responseRecord?.interview_date ?? null,
    interviewStartTime: responseRecord?.interview_start_time ?? null,
    interviewEndTime: responseRecord?.interview_end_time ?? null,
    interviewFormat: responseRecord?.interview_format ?? null,
    meetingLink: responseRecord?.meeting_link ?? null,
    contactEmail: responseRecord?.contact_email ?? null,
    checklist: responseRecord?.checklist ?? null,
  };
}

function openEmployerContacts(opportunity: Opportunity, navigate: ReturnType<typeof useNavigate>) {
  if (opportunity.employerPublicId) {
    navigate(`/profiles/${opportunity.employerPublicId}`, {
      state: {
        ownerRole: "employer",
      },
    });
    return;
  }

  navigate(`/networking?employerId=${encodeURIComponent(opportunity.employerId)}`);
}

function toggleMultiValue<T extends string>(value: T, selectedValues: T[], setter: (value: T[]) => void) {
  setter(
    selectedValues.includes(value)
      ? selectedValues.filter((item) => item !== value)
      : [...selectedValues, value],
  );
}

function toggleKindValue(
  nextValue: Opportunity["kind"] | "all",
  setter: (value: Array<Opportunity["kind"] | "all">) => void,
  current: Array<Opportunity["kind"] | "all">,
) {
  if (nextValue === "all") {
    setter(["all"]);
    return;
  }

  const normalized = current.filter((item) => item !== "all");
  if (normalized.includes(nextValue)) {
    const nextItems = normalized.filter((item) => item !== nextValue);
    setter(nextItems.length > 0 ? nextItems : ["all"]);
    return;
  }

  setter([...normalized, nextValue]);
}

export function ApplicationsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const sortingRef = useRef<HTMLDivElement | null>(null);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const isApplicant = role === "applicant";
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState<Array<Opportunity["kind"] | "all">>(["all"]);
  const [appliedKinds, setAppliedKinds] = useState<Array<Opportunity["kind"] | "all">>(["all"]);
  const [selectedStatuses, setSelectedStatuses] = useState<ApplicantApplicationStatus[]>([]);
  const [appliedStatuses, setAppliedStatuses] = useState<ApplicantApplicationStatus[]>([]);
  const [selectedPublicationPeriods, setSelectedPublicationPeriods] = useState<string[]>([ALL_TIME_PUBLICATION_OPTION]);
  const [appliedPublicationPeriods, setAppliedPublicationPeriods] = useState<string[]>([ALL_TIME_PUBLICATION_OPTION]);
  const [selectedSortField, setSelectedSortField] = useState<ApplicationSortField>("published");
  const [appliedSortField, setAppliedSortField] = useState<ApplicationSortField>("published");
  const [selectedSortDirection, setSelectedSortDirection] = useState<ApplicationSortDirection>("desc");
  const [appliedSortDirection, setAppliedSortDirection] = useState<ApplicationSortDirection>("desc");
  const [expandedApplicationIds, setExpandedApplicationIds] = useState<string[]>([]);
  const [pendingWithdrawOpportunityId, setPendingWithdrawOpportunityId] = useState<string | null>(null);

  const opportunitiesQuery = useQuery({
    queryKey: ["opportunities", "feed"],
    queryFn: listOpportunitiesRequest,
    enabled: isAuthenticated && isApplicant,
    staleTime: 5 * 60 * 1000,
  });
  const favoriteOpportunitiesQuery = useQuery({
    queryKey: ["favorites", "opportunities"],
    queryFn: listFavoriteOpportunitiesRequest,
    enabled: isAuthenticated && isApplicant,
    staleTime: 60 * 1000,
  });
  const myApplicationsQuery = useQuery({
    queryKey: ["applications", "mine"],
    queryFn: listMyApplicationsRequest,
    enabled: isAuthenticated && isApplicant,
    staleTime: 60 * 1000,
  });

  const favoriteOpportunityMutation = useMutation({
    mutationFn: async ({
      opportunityId,
      shouldFavorite,
    }: {
      opportunityId: string;
      shouldFavorite: boolean;
    }) => {
      return shouldFavorite
        ? addFavoriteOpportunityRequest(opportunityId)
        : removeFavoriteOpportunityRequest(opportunityId);
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["favorites", "opportunities"], response);
    },
  });

  const withdrawApplicationMutation = useMutation({
    mutationFn: withdrawOpportunityApplicationRequest,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["applications", "mine"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useNotificationsRealtime({
    enabled: isAuthenticated && isApplicant,
    onMessage: (payload) => {
      if (payload?.type !== "notification_created") {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["applications", "mine"] });
    },
  });

  useEffect(() => {
    if (!isFilterOpen && !isSortOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (!filtersRef.current?.contains(target)) {
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

  const favoriteOpportunityIds = favoriteOpportunitiesQuery.data?.data?.items ?? [];
  const appliedOpportunityIds = useMemo(
    () => (myApplicationsQuery.data?.data?.items ?? []).map((item) => item.opportunity_id),
    [myApplicationsQuery.data?.data?.items],
  );
  const isApplicationsLoading =
    opportunitiesQuery.isPending ||
    favoriteOpportunitiesQuery.isPending ||
    myApplicationsQuery.isPending;

  const appliedOpportunities = useMemo(() => {
    const appliedIds = new Set(appliedOpportunityIds);
    return (opportunitiesQuery.data ?? []).filter((opportunity) => appliedIds.has(opportunity.id));
  }, [appliedOpportunityIds, opportunitiesQuery.data]);

  const applicationRecordMap = useMemo(
    () =>
      (myApplicationsQuery.data?.data?.items ?? []).reduce<Record<string, ApplicationDetails>>((result, item) => {
        result[item.opportunity_id] = item;
        return result;
      }, {}),
    [myApplicationsQuery.data?.data?.items],
  );

  const applicationItems = useMemo(
    () =>
      appliedOpportunities.map((opportunity) =>
        buildApplicationDetails(opportunity, applicationRecordMap[opportunity.id] ?? null),
      ),
    [appliedOpportunities, applicationRecordMap],
  );

  const filteredApplications = useMemo(() => {
    const normalizedSearch = normalizeOpportunitySearchText(appliedSearch);

    return applicationItems.filter((item) => {
      const { opportunity } = item;

      if (!matchesApplicationsSearch(item, normalizedSearch)) {
        return false;
      }

      if (!appliedKinds.includes("all") && !appliedKinds.includes(opportunity.kind)) {
        return false;
      }

      if (appliedStatuses.length > 0 && !appliedStatuses.includes(item.status)) {
        return false;
      }

      if (!matchesPublicationPeriod(item.submittedAt, appliedPublicationPeriods)) {
        return false;
      }

      return true;
    });
  }, [
    applicationItems,
    appliedKinds,
    appliedPublicationPeriods,
    appliedSearch,
    appliedStatuses,
  ]);

  const sortedApplications = useMemo(() => {
    return [...filteredApplications].sort((left, right) => {
      const comparison =
        appliedSortField === "published"
          ? new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime()
          : left.opportunity.title.localeCompare(right.opportunity.title, "ru");
      return appliedSortDirection === "asc" ? comparison : -comparison;
    });
  }, [appliedSortDirection, appliedSortField, filteredApplications]);
  const hasSearchResults = appliedSearch.trim().length > 0 && sortedApplications.length === 0;

  const stats = useMemo(() => {
    return applicationItems.reduce(
      (accumulator, item) => {
        accumulator.total += 1;
        accumulator[item.status] += 1;
        return accumulator;
      },
      {
        total: 0,
        accepted: 0,
        pending: 0,
        reserve: 0,
        rejected: 0,
        withdrawn: 0,
      } satisfies Record<ApplicationMetricKey, number>,
    );
  }, [applicationItems]);

  const profileMenuItems = buildApplicantProfileMenuItems(navigate);

  if (!isApplicant) {
    return <Navigate to="/" replace />;
  }

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  const applyFilters = () => {
    setAppliedKinds(selectedKinds);
    setAppliedStatuses(selectedStatuses);
    setAppliedPublicationPeriods(selectedPublicationPeriods);
    setIsFilterOpen(false);
  };

  const applySorting = () => {
    setAppliedSortField(selectedSortField);
    setAppliedSortDirection(selectedSortDirection);
    setIsSortOpen(false);
  };

  const resetFilters = () => {
    setSelectedKinds(["all"]);
    setAppliedKinds(["all"]);
    setSelectedStatuses([]);
    setAppliedStatuses([]);
    setSelectedPublicationPeriods([ALL_TIME_PUBLICATION_OPTION]);
    setAppliedPublicationPeriods([ALL_TIME_PUBLICATION_OPTION]);
    setIsFilterOpen(false);
  };

  const resetSorting = () => {
    setSelectedSortField("published");
    setAppliedSortField("published");
    setSelectedSortDirection("desc");
    setAppliedSortDirection("desc");
    setIsSortOpen(false);
  };

  const handleToggleFavorite = (opportunityId: string) => {
    if (favoriteOpportunityMutation.isPending) {
      return;
    }

    favoriteOpportunityMutation.mutate({
      opportunityId,
      shouldFavorite: !favoriteOpportunityIds.includes(opportunityId),
    });
  };

  const handleConfirmWithdraw = () => {
    if (!pendingWithdrawOpportunityId || withdrawApplicationMutation.isPending) {
      return;
    }

    withdrawApplicationMutation.mutate(pendingWithdrawOpportunityId, {
      onSuccess: async () => {
        setPendingWithdrawOpportunityId(null);
        setExpandedApplicationIds((current) => current.filter((item) => item !== pendingWithdrawOpportunityId));
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["applications", "mine"] }),
          queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] }),
          queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        ]);
      },
    });
  };

  return (
    <main className="applications-page home-page home-page--applicant">
      <Header
        containerClassName="home-page__shell"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
        bottomContent={
          <>
            <nav className="header__categories" aria-label="Категории">
              {opportunityCategoryLinks.map((item) => (
                <Link
                  key={item.value}
                  to={buildOpportunityExplorerRoute(item.value)}
                  className="header__category-link"
                  aria-current={location.pathname === OPPORTUNITY_EXPLORER_PATH ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <CitySelector value={selectedCity} onChange={handleCityChange} />
          </>
        }
      />

      <Container className="settings-page__shell applications-page__shell">
        <ProfileTabs
          navigate={navigate}
          audience="applicant"
          current="applications"
          tabsClassName="settings-page__tabs favorites-page__tabs"
          ariaLabel="Разделы аккаунта"
        />

        <section className="favorites-page__metrics stats-panel" aria-label="Статистика откликов">
          {metricDefinitions.map((metric) => (
            <article key={metric.key} className="favorites-page__metric-card stats-panel__card">
              {isApplicationsLoading ? (
                <>
                  <span className="favorites-page__skeleton favorites-page__skeleton--metric-label" />
                  <span className="favorites-page__skeleton favorites-page__skeleton--metric-value" />
                </>
              ) : (
                <>
                  <span className="favorites-page__metric-label stats-panel__label">{metric.label}</span>
                  <strong className="favorites-page__metric-value stats-panel__value">{formatCount(stats[metric.key])}</strong>
                </>
              )}
            </article>
          ))}
        </section>

        <section className="favorites-page__toolbar">
          <label className="favorites-page__search" aria-label="Поиск по откликам">
            <Input
              type="search"
              placeholder="Поиск"
              className="input--sm favorites-page__search-input"
              value={search}
              clearable
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearch(nextValue);
                setAppliedSearch(nextValue.trim());
              }}
            />
          </label>

          <div className="favorites-page__toolbar-actions">
            <div ref={filtersRef} className="favorites-page__filters">
              <button
                type="button"
                className="favorites-page__icon-button favorites-page__icon-button--filter"
                aria-label="Фильтры"
                aria-expanded={isFilterOpen}
                onClick={() => {
                  setIsSortOpen(false);
                  setIsFilterOpen((current) => !current);
                }}
              >
                <span className="favorites-page__icon-stack" aria-hidden="true">
                  <span
                    className={
                      isFilterOpen
                        ? "favorites-page__icon favorites-page__icon--filter favorites-page__icon--hidden"
                        : "favorites-page__icon favorites-page__icon--filter"
                    }
                  />
                  <span
                    className={
                      isFilterOpen
                        ? "favorites-page__icon favorites-page__icon--filter-open favorites-page__icon--visible"
                        : "favorites-page__icon favorites-page__icon--filter-open favorites-page__icon--hidden"
                    }
                  />
                </span>
              </button>

              {isFilterOpen ? (
                <div className="favorites-page__popover">
                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head favorites-page__popover-head--stacked">
                      <h2 className="favorites-page__popover-title">Фильтры</h2>
                      <button type="button" className="favorites-page__popover-reset" onClick={resetFilters}>
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head favorites-page__popover-head--stacked">
                      <h3 className="favorites-page__popover-group-title">Тип</h3>
                      <button type="button" className="favorites-page__popover-reset" onClick={() => setSelectedKinds(["all"])}>
                        Сбросить
                      </button>
                    </div>
                    <div className="favorites-page__option-list favorites-page__option-list--grid">
                      <label className="favorites-page__option">
                        <Checkbox
                          checked={selectedKinds.includes("vacancy")}
                          onChange={() => toggleKindValue("vacancy", setSelectedKinds, selectedKinds)}
                          variant="secondary"
                        />
                        <span>Вакансии</span>
                      </label>
                      <label className="favorites-page__option">
                        <Checkbox
                          checked={selectedKinds.includes("internship")}
                          onChange={() => toggleKindValue("internship", setSelectedKinds, selectedKinds)}
                          variant="secondary"
                        />
                        <span>Стажировки</span>
                      </label>
                      <label className="favorites-page__option">
                        <Checkbox
                          checked={selectedKinds.includes("event")}
                          onChange={() => toggleKindValue("event", setSelectedKinds, selectedKinds)}
                          variant="secondary"
                        />
                        <span>Мероприятия</span>
                      </label>
                      <label className="favorites-page__option">
                        <Checkbox
                          checked={selectedKinds.includes("mentorship")}
                          onChange={() => toggleKindValue("mentorship", setSelectedKinds, selectedKinds)}
                          variant="secondary"
                        />
                        <span>Менторские программы</span>
                      </label>
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head favorites-page__popover-head--stacked">
                      <h3 className="favorites-page__popover-group-title">Статус</h3>
                      <button type="button" className="favorites-page__popover-reset" onClick={() => setSelectedStatuses([])}>
                        Сбросить
                      </button>
                    </div>
                    <div className="favorites-page__option-list favorites-page__option-list--grid">
                      {applicationStatusOptions.map((option) => (
                        <label key={option.value} className="favorites-page__option">
                          <Checkbox
                            checked={selectedStatuses.includes(option.value)}
                            onChange={() => toggleMultiValue(option.value, selectedStatuses, setSelectedStatuses)}
                            variant="secondary"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head favorites-page__popover-head--stacked">
                      <h3 className="favorites-page__popover-group-title">Дата добавления</h3>
                      <button
                        type="button"
                        className="favorites-page__popover-reset"
                        onClick={() => setSelectedPublicationPeriods([ALL_TIME_PUBLICATION_OPTION])}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="favorites-page__option-list favorites-page__option-list--grid">
                      {publicationOptions.map((option) => (
                        <label key={option} className="favorites-page__option">
                          <Radio
                            checked={selectedPublicationPeriods.includes(option)}
                            onChange={() => setSelectedPublicationPeriods([option])}
                            variant="secondary"
                            name="applications-publication-period"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="favorites-page__popover-footer">
                    <Button type="button" variant="secondary" size="sm" fullWidth onClick={applyFilters}>
                      Показать результаты
                    </Button>
                    <Button type="button" variant="secondary-outline" size="sm" fullWidth onClick={resetFilters}>
                      Сбросить фильтры
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div ref={sortingRef} className="favorites-page__sorting">
              <button
                type="button"
                className="favorites-page__icon-button favorites-page__icon-button--sorting"
                aria-label="Сортировка"
                aria-expanded={isSortOpen}
                onClick={() => {
                  setIsFilterOpen(false);
                  setIsSortOpen((current) => !current);
                }}
              >
                <span className="favorites-page__icon-stack" aria-hidden="true">
                  <span
                    className={
                      isSortOpen
                        ? `favorites-page__icon ${appliedSortDirection === "desc" ? "favorites-page__icon--sorting" : "favorites-page__icon--sorting favorites-page__icon--ascending"} favorites-page__icon--hidden`
                        : appliedSortDirection === "desc"
                          ? "favorites-page__icon favorites-page__icon--sorting"
                          : "favorites-page__icon favorites-page__icon--sorting favorites-page__icon--ascending"
                    }
                  />
                  <span
                    className={
                      isSortOpen
                        ? "favorites-page__icon favorites-page__icon--filter-open favorites-page__icon--visible"
                        : "favorites-page__icon favorites-page__icon--filter-open favorites-page__icon--hidden"
                    }
                  />
                </span>
              </button>

              {isSortOpen ? (
                <div className="favorites-page__popover favorites-page__popover--compact">
                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head favorites-page__popover-head--stacked">
                      <h2 className="favorites-page__popover-title">Сортировка</h2>
                      <button type="button" className="favorites-page__popover-reset" onClick={resetSorting}>
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head favorites-page__popover-head--stacked">
                      <h3 className="favorites-page__popover-group-title">По названию</h3>
                      <button
                        type="button"
                        className="favorites-page__popover-reset"
                        onClick={() => {
                          setSelectedSortField("title");
                          setSelectedSortDirection("asc");
                        }}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="favorites-page__option-list">
                      <label className="favorites-page__option">
                        <Radio
                          checked={selectedSortField === "title" && selectedSortDirection === "asc"}
                          onChange={() => {
                            setSelectedSortField("title");
                            setSelectedSortDirection("asc");
                          }}
                          variant="secondary"
                          name="applications-sort-title"
                        />
                        <span>А-Я</span>
                      </label>
                      <label className="favorites-page__option">
                        <Radio
                          checked={selectedSortField === "title" && selectedSortDirection === "desc"}
                          onChange={() => {
                            setSelectedSortField("title");
                            setSelectedSortDirection("desc");
                          }}
                          variant="secondary"
                          name="applications-sort-title"
                        />
                        <span>Я-А</span>
                      </label>
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head favorites-page__popover-head--stacked">
                      <h3 className="favorites-page__popover-group-title">По дате добавления</h3>
                      <button
                        type="button"
                        className="favorites-page__popover-reset"
                        onClick={() => {
                          setSelectedSortField("published");
                          setSelectedSortDirection("desc");
                        }}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="favorites-page__option-list">
                      <label className="favorites-page__option">
                        <Radio
                          checked={selectedSortField === "published" && selectedSortDirection === "desc"}
                          onChange={() => {
                            setSelectedSortField("published");
                            setSelectedSortDirection("desc");
                          }}
                          variant="secondary"
                          name="applications-sort-published"
                        />
                        <span>Сначала новые</span>
                      </label>
                      <label className="favorites-page__option">
                        <Radio
                          checked={selectedSortField === "published" && selectedSortDirection === "asc"}
                          onChange={() => {
                            setSelectedSortField("published");
                            setSelectedSortDirection("asc");
                          }}
                          variant="secondary"
                          name="applications-sort-published"
                        />
                        <span>Сначала старые</span>
                      </label>
                    </div>
                  </div>

                  <div className="favorites-page__popover-footer">
                    <Button type="button" variant="secondary" size="sm" fullWidth onClick={applySorting}>
                      Показать результаты
                    </Button>
                    <Button type="button" variant="secondary-outline" size="sm" fullWidth onClick={resetSorting}>
                      Сбросить параметры
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {isApplicationsLoading ? (
          <section className="applications-page__list" aria-label="Список откликов">
            {Array.from({ length: 3 }, (_, index) => (
              <article key={`application-skeleton-${index}`} className="applications-page__card applications-page__card--skeleton">
                <span className="favorites-page__skeleton applications-page__skeleton applications-page__skeleton--status" />
                <span className="favorites-page__skeleton applications-page__skeleton applications-page__skeleton--title" />
                <span className="favorites-page__skeleton applications-page__skeleton applications-page__skeleton--text" />
              </article>
            ))}
          </section>
        ) : sortedApplications.length > 0 ? (
          <section className="applications-page__list" aria-label="Список откликов">
            {sortedApplications.map((item) => {
              const { opportunity } = item;
              const statusMeta = resolveApplicationStatusMeta(item.status);
              const isFavorite = favoriteOpportunityIds.includes(opportunity.id);
              const isExpanded = expandedApplicationIds.includes(opportunity.id);
              const canWithdraw = item.status !== "rejected" && item.status !== "withdrawn";

              return (
                <article key={opportunity.id} className="applications-page__card">
                  <div className="applications-page__card-main">
                    <div className="applications-page__summary">
                      <div className="applications-page__topline">
                        <Status
                          variant={statusMeta.variant}
                          className={item.status === "reserve" ? "applications-page__status applications-page__status--reserve" : "applications-page__status"}
                        >
                          {statusMeta.label}
                        </Status>
                        <div className="applications-page__topline-actions">
                          <button
                            type="button"
                            className="applications-page__favorite"
                            aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                            aria-pressed={isFavorite}
                            onClick={() => handleToggleFavorite(opportunity.id)}
                          >
                            <svg aria-hidden="true" viewBox="0 0 512 489" className="applications-page__favorite-icon">
                              <path
                                d={
                                  isFavorite
                                    ? "M256 403.578L118.839 486.44C115.369 488.299 111.837 489.146 108.243 488.979C104.644 488.813 101.378 487.697 98.4453 485.633C95.5124 483.564 93.3127 480.844 91.8463 477.474C90.3798 474.103 90.1838 470.352 91.2581 466.218L127.331 310.17L6.65522 204.796C3.38928 202.066 1.35345 198.935 0.54771 195.403C-0.258031 191.866 -0.174773 188.413 0.797488 185.042C1.76975 181.672 3.6713 178.872 6.50214 176.641C9.33298 174.405 12.8138 173.123 16.9445 172.795L176.602 158.717L238.709 11.1026C240.444 7.50653 242.891 4.75706 246.049 2.85423C249.213 0.951398 252.53 0 256 0C259.47 0 262.787 0.951398 265.951 2.85423C269.109 4.75706 271.556 7.50653 273.291 11.1026L335.398 158.717L495.055 172.795C499.186 173.123 502.667 174.405 505.498 176.641C508.329 178.872 510.23 181.672 511.203 185.042C512.175 188.413 512.258 191.866 511.452 195.403C510.647 198.935 508.611 202.066 505.345 204.796L384.669 310.17L421.048 466.218C421.918 470.352 421.62 474.103 420.154 477.474C418.687 480.844 416.488 483.564 413.555 485.633C410.622 487.697 407.356 488.813 403.757 488.979C400.163 489.146 396.631 488.299 393.161 486.44L256 403.578Z"
                                    : "M136.315 432.854L256 360.78L375.685 433.66L344.011 297.269L449.314 205.788L310.42 193.508L256 65.1881L201.58 192.702L62.6865 204.982L167.989 296.777L136.315 432.854ZM256 403.578L118.839 486.44C115.369 488.299 111.837 489.146 108.243 488.979C104.644 488.813 101.378 487.697 98.4453 485.633C95.5124 483.564 93.3127 480.844 91.8463 477.474C90.3798 474.103 90.1838 470.352 91.2581 466.218L127.331 310.17L6.65522 204.796C3.38928 202.066 1.35345 198.935 0.54771 195.403C-0.258031 191.866 -0.174773 188.413 0.797488 185.042C1.76975 181.672 3.6713 178.872 6.50214 176.641C9.33298 174.405 12.8138 173.123 16.9445 172.795L176.602 158.717L238.709 11.1026C240.444 7.50653 242.891 4.75706 246.049 2.85423C249.213 0.951398 252.53 0 256 0C259.47 0 262.787 0.951398 265.951 2.85423C269.109 4.75706 271.556 7.50653 273.291 11.1026L335.398 158.717L495.055 172.795C499.186 173.123 502.667 174.405 505.498 176.641C508.329 178.872 510.23 181.672 511.203 185.042C512.175 188.413 512.258 191.866 511.452 195.403C510.647 198.935 508.611 202.066 505.345 204.796L384.669 310.17L421.048 466.218C421.918 470.352 421.62 474.103 420.154 477.474C418.687 480.844 416.488 483.564 413.555 485.633C410.622 487.697 407.356 488.813 403.757 488.979C400.163 489.146 396.631 488.299 393.161 486.44L256 403.578Z"
                                }
                              />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="applications-page__title-panel">
                        <div>
                          <Link to={`/opportunities/${opportunity.id}`} className="applications-page__title">
                            {opportunity.title}
                          </Link>
                          <p className="applications-page__kind">
                            {opportunity.kind === "internship"
                              ? "Стажировка"
                              : opportunity.kind === "event"
                                ? "Мероприятие"
                              : opportunity.kind === "mentorship"
                                  ? "Менторство"
                                  : "Вакансия"}
                          </p>
                        </div>
                      </div>

                      <div className="applications-page__summary">
                        <p className="applications-page__price">{opportunity.salaryLabel}</p>
                        <p className="applications-page__meta">{opportunity.locationLabel}</p>
                      </div>

                      <div className="applications-page__tags">
                        {opportunity.tags.map((tag) => (
                          <Badge key={`${opportunity.id}-${tag}`} variant="secondary" className="applications-page__tag">
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      <div className="applications-page__secondary">
                        <p>Уровень: {opportunity.levelLabel}</p>
                        <p>Занятость: {opportunity.employmentLabel}</p>
                      </div>

                      <p className="applications-page__description">{opportunity.description}</p>

                      <button
                        type="button"
                        className={isExpanded ? "applications-page__expand-toggle applications-page__expand-toggle--expanded" : "applications-page__expand-toggle"}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedApplicationIds((current) =>
                            current.includes(opportunity.id)
                              ? current.filter((value) => value !== opportunity.id)
                              : [...current, opportunity.id],
                          )
                        }
                      >
                        <span className="applications-page__expand-icon" aria-hidden="true" />
                      </button>
                    </div>

                    <aside className="applications-page__side">
                      <div className="applications-page__company-panel">
                        <div className="applications-page__company-header">
                          <button
                            type="button"
                            className="applications-page__company"
                            onClick={() => openEmployerContacts(opportunity, navigate)}
                          >
                            {opportunity.companyName}
                          </button>
                          {opportunity.companyVerified ? (
                            <VerifiedTooltip className="applications-page__verified-icon" />
                          ) : null}
                        </div>

                        <div className="applications-page__rating">
                          <p>
                            Рейтинг: {opportunity.companyRating !== null ? `${opportunity.companyRating}/5` : "0/5"}
                          </p>
                          <span className="applications-page__rating-separator" aria-hidden="true" />
                          <p>{opportunity.companyReviewsCount} отзывов</p>
                        </div>
                      </div>

                      <div className="applications-page__actions">
                        <Button
                          type="button"
                          variant="secondary-outline"
                          size="md"
                          onClick={() => openEmployerContacts(opportunity, navigate)}
                        >
                          Показать контакты
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="md"
                          onClick={() => navigate(`/networking?employerId=${encodeURIComponent(opportunity.employerId)}`)}
                        >
                          Написать
                        </Button>
                      </div>
                    </aside>
                  </div>

                  {isExpanded ? (
                    <div className="applications-page__details">
                      <section className="applications-page__detail-section">
                        <h3 className="applications-page__detail-title">Комментарий работодателя</h3>
                        <p className="applications-page__detail-message">
                          {item.employerComment ?? item.statusMessage}
                        </p>
                      </section>

                      {item.status === "accepted" && (
                        <section className="applications-page__detail-section">
                          <h3 className="applications-page__detail-title">Детали собеседования</h3>
                          <div className="applications-page__details-panel">
                            {item.interviewDate ? <p>Дата: {formatDate(item.interviewDate)}</p> : null}
                            {item.interviewStartTime && item.interviewEndTime ? (
                              <p>Время: {item.interviewStartTime} - {item.interviewEndTime}</p>
                            ) : null}
                            {item.interviewFormat ? <p>Формат: {item.interviewFormat}</p> : null}
                            {item.meetingLink ? (
                              <p>
                                Ссылка:{" "}
                                <a
                                  href={item.meetingLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="applications-page__detail-link"
                                >
                                  Открыть встречу
                                </a>
                              </p>
                            ) : null}
                            {item.contactEmail ? <p>Контакты: {item.contactEmail}</p> : null}
                          </div>
                        </section>
                      )}

                      {item.checklist ? (
                        <section className="applications-page__detail-section">
                          <h3 className="applications-page__detail-title">Что взять с собой</h3>
                          <ul className="applications-page__detail-list">
                            {item.checklist
                              .split(/\n+/)
                              .map((entry) => entry.trim())
                              .filter(Boolean)
                              .map((entry) => (
                                <li key={`${opportunity.id}-${entry}`}>{entry}</li>
                              ))}
                          </ul>
                        </section>
                      ) : null}

                      <section className="applications-page__meta-summary">
                        <div className="applications-page__meta-detail">
                          <span className="applications-page__meta-label">Отклик отправлен</span>
                          <strong className="applications-page__meta-value">{formatDateTime(item.submittedAt)}</strong>
                        </div>
                        <div className="applications-page__meta-detail">
                          <span className="applications-page__meta-label">Последнее обновление</span>
                          <strong className="applications-page__meta-value">{formatDateTime(item.updatedAt)}</strong>
                        </div>
                      </section>

                      {item.status === "accepted" ? (
                        <div className="applications-page__detail-actions">
                          <Button
                            type="button"
                            variant="secondary-outline"
                            size="md"
                            onClick={() => navigate(`/networking?employerId=${encodeURIComponent(opportunity.employerId)}`)}
                          >
                            Перенести собеседование
                          </Button>
                          <Button
                            type="button"
                            variant="danger-outline"
                            size="md"
                            onClick={() => setPendingWithdrawOpportunityId(opportunity.id)}
                          >
                            Отказаться от вакансии
                          </Button>
                        </div>
                      ) : canWithdraw ? (
                        <div className="applications-page__detail-actions">
                          <Button
                            type="button"
                            variant="danger-outline"
                            size="md"
                            onClick={() => setPendingWithdrawOpportunityId(opportunity.id)}
                          >
                            Отозвать отклик
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : hasSearchResults ? (
          <section className="favorites-page__empty">
            <img src={sadSearchIcon} alt="" aria-hidden="true" className="favorites-page__empty-icon" />
            <h2 className="favorites-page__empty-title">Ничего не найдено</h2>
          </section>
        ) : (
          <section className="favorites-page__empty">
            <h2 className="favorites-page__empty-title">Откликов пока нет</h2>
            <p className="favorites-page__empty-text">
              Когда вы откликнетесь на вакансии, стажировки или мероприятия, они появятся здесь со статусом и историей обновлений.
            </p>
            <div className="favorites-page__empty-actions">
              <Button type="button" variant="secondary" onClick={() => navigate(OPPORTUNITY_EXPLORER_PATH)}>
                Найти возможность
              </Button>
            </div>
          </section>
        )}
      </Container>

      <Footer theme="applicant" />

      <WithdrawApplicationModal
        isOpen={pendingWithdrawOpportunityId !== null}
        onClose={() => setPendingWithdrawOpportunityId(null)}
        onConfirm={handleConfirmWithdraw}
        isPending={withdrawApplicationMutation.isPending}
      />
    </main>
  );
}
