import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";

import verifiedIcon from "../../assets/icons/verified.svg";
import { CitySelection, CitySelector, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { Opportunity } from "../../entities/opportunity";
import { listOpportunitiesRequest } from "../../entities/opportunity/api";
import {
  listMyAppliedOpportunityIdsRequest,
  withdrawOpportunityApplicationRequest,
} from "../../features/applications";
import {
  addFavoriteOpportunityRequest,
  listFavoriteOpportunitiesRequest,
  removeFavoriteOpportunityRequest,
} from "../../features/favorites";
import { useAuthStore } from "../../features/auth";
import { matchesOpportunitySearch, normalizeOpportunitySearchText } from "../../shared/lib";
import { Badge, Button, Checkbox, Container, Input, Modal, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildApplicantProfileMenuItems, Header } from "../../widgets/header";
import "../favorites/favorites.css";
import "../settings/settings.css";
import "./applications.css";

type OpportunityCategoryFilter = "all" | Opportunity["kind"];
type ApplicantApplicationStatus = "accepted" | "pending" | "reserve" | "rejected";
type ApplicationMetricKey = "total" | ApplicantApplicationStatus;
type ApplicationSortDirection = "asc" | "desc";

type ApplicantApplicationItem = {
  opportunity: Opportunity;
  status: ApplicantApplicationStatus;
  submittedAt: string;
  updatedAt: string;
  statusMessage: string;
  employerComment: string | null;
};

const metricDefinitions: Array<{ key: ApplicationMetricKey; label: string }> = [
  { key: "total", label: "Всего:" },
  { key: "accepted", label: "Принято:" },
  { key: "pending", label: "На рассмотрении:" },
  { key: "rejected", label: "Отклонено:" },
];

const levelOptions = ["Junior", "Middle", "Senior"];
const formatOptions = ["Офлайн", "Гибрид", "Удалённо"];
const companyOptions = ["Только верифицированные компании", "Только с рейтингом 4,5 и выше"];
const applicationStatusOptions: Array<{ value: ApplicantApplicationStatus; label: string }> = [
  { value: "accepted", label: "Принято" },
  { value: "pending", label: "На рассмотрении" },
  { value: "reserve", label: "В резерве" },
  { value: "rejected", label: "Отклонено" },
];

const opportunityCategoryLinks: Array<{ value: OpportunityCategoryFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "vacancy", label: "Вакансии" },
  { value: "internship", label: "Стажировки" },
  { value: "event", label: "Мероприятия" },
  { value: "mentorship", label: "Менторские программы" },
];

const applicantTabs: Array<{ label: string; to?: string; isCurrent?: boolean }> = [
  { label: "Профиль", to: "/dashboard/applicant" },
  { label: "Мои отклики", to: "/applications", isCurrent: true },
  { label: "Избранное", to: "/favorites" },
  { label: "Нетворкинг", to: "/networking" },
  { label: "Настройки", to: "/settings" },
];

function normalizeFilterText(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function normalizeFormatOption(value: string): Opportunity["format"] | null {
  const normalized = normalizeFilterText(value);

  if (normalized.includes("гибрид")) {
    return "hybrid";
  }

  if (normalized.includes("удален")) {
    return "remote";
  }

  if (normalized.includes("оффлайн") || normalized.includes("офлайн")) {
    return "office";
  }

  return null;
}

function normalizeLevelOption(value: string) {
  const normalized = normalizeFilterText(value);

  if (normalized.includes("junior")) {
    return "junior";
  }

  if (normalized.includes("middle")) {
    return "middle";
  }

  if (normalized.includes("senior")) {
    return "senior";
  }

  if (normalized.includes("стаж")) {
    return "intern";
  }

  return normalized;
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

function addDays(value: string, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString();
}

function addHours(value: string, hours: number) {
  const nextDate = new Date(value);
  nextDate.setHours(nextDate.getHours() + hours);
  return nextDate.toISOString();
}

function resolveApplicationStatusMeta(status: ApplicantApplicationStatus) {
  if (status === "accepted") {
    return { label: "Принято", variant: "approved" as const };
  }

  if (status === "rejected") {
    return { label: "Отклонено", variant: "rejected" as const };
  }

  if (status === "reserve") {
    return { label: "В резерве", variant: "info-request" as const };
  }

  return { label: "На рассмотрении", variant: "pending-review" as const };
}

function buildApplicationDetails(opportunity: Opportunity, index: number): ApplicantApplicationItem {
  const baseDate = opportunity.publishedAt ?? new Date().toISOString();
  const submittedAt = addDays(baseDate, index + 1);
  const updatedAt = addHours(submittedAt, 1);

  return {
    opportunity,
    status: "pending",
    submittedAt,
    updatedAt,
    statusMessage: "Отклик отправлен и ожидает рассмотрения работодателем.",
    employerComment: null,
  };
}

function openEmployerContacts(opportunity: Opportunity, navigate: ReturnType<typeof useNavigate>) {
  if (opportunity.employerPublicId) {
    navigate(`/profiles/${opportunity.employerPublicId}`);
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
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [appliedLevels, setAppliedLevels] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [appliedFormats, setAppliedFormats] = useState<string[]>([]);
  const [selectedCompanyOptions, setSelectedCompanyOptions] = useState<string[]>([]);
  const [appliedCompanyOptions, setAppliedCompanyOptions] = useState<string[]>([]);
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
    queryKey: ["applications", "mine", "opportunity-ids"],
    queryFn: listMyAppliedOpportunityIdsRequest,
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
        queryClient.invalidateQueries({ queryKey: ["applications", "mine", "opportunity-ids"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

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

  const favoriteOpportunityIds = favoriteOpportunitiesQuery.data?.data?.items ?? [];
  const appliedOpportunityIds = useMemo(
    () => myApplicationsQuery.data?.data?.opportunity_ids ?? [],
    [myApplicationsQuery.data?.data?.opportunity_ids],
  );
  const isApplicationsLoading =
    opportunitiesQuery.isPending ||
    favoriteOpportunitiesQuery.isPending ||
    myApplicationsQuery.isPending;

  const appliedOpportunities = useMemo(() => {
    const appliedIds = new Set(appliedOpportunityIds);
    return (opportunitiesQuery.data ?? []).filter((opportunity) => appliedIds.has(opportunity.id));
  }, [appliedOpportunityIds, opportunitiesQuery.data]);

  const applicationItems = useMemo(
    () => appliedOpportunities.map((opportunity, index) => buildApplicationDetails(opportunity, index)),
    [appliedOpportunities],
  );

  const tagOptions = useMemo(() => {
    const tagMap = new Map<string, string>();

    applicationItems.forEach((item) => {
      item.opportunity.tags.forEach((tag) => {
        const normalized = tag.trim();
        if (!normalized) {
          return;
        }
        tagMap.set(normalized.toLocaleLowerCase("ru-RU"), normalized);
      });
    });

    return Array.from(tagMap.values()).sort((left, right) => left.localeCompare(right, "ru"));
  }, [applicationItems]);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [appliedTags, setAppliedTags] = useState<string[]>([]);

  const filteredApplications = useMemo(() => {
    const normalizedSearch = normalizeOpportunitySearchText(appliedSearch);
    const normalizedFormats = appliedFormats
      .map(normalizeFormatOption)
      .filter((item): item is Opportunity["format"] => Boolean(item));
    const normalizedLevels = appliedLevels.map(normalizeLevelOption);

    return applicationItems.filter((item) => {
      const { opportunity } = item;

      if (!matchesOpportunitySearch(opportunity, normalizedSearch)) {
        return false;
      }

      if (!appliedKinds.includes("all") && !appliedKinds.includes(opportunity.kind)) {
        return false;
      }

      if (appliedStatuses.length > 0 && !appliedStatuses.includes(item.status)) {
        return false;
      }

      if (normalizedLevels.length > 0 && !normalizedLevels.includes(normalizeLevelOption(opportunity.levelLabel))) {
        return false;
      }

      if (normalizedFormats.length > 0 && !normalizedFormats.includes(opportunity.format)) {
        return false;
      }

      if (
        appliedCompanyOptions.includes("Только верифицированные компании") &&
        !opportunity.companyVerified
      ) {
        return false;
      }

      if (
        appliedCompanyOptions.includes("Только с рейтингом 4,5 и выше") &&
        (opportunity.companyRating ?? 0) < 4.5
      ) {
        return false;
      }

      if (appliedTags.length > 0) {
        const normalizedTags = opportunity.tags.map((tag) => normalizeFilterText(tag));
        const hasMatchingTag = appliedTags.some((tag) => normalizedTags.includes(normalizeFilterText(tag)));
        if (!hasMatchingTag) {
          return false;
        }
      }

      return true;
    });
  }, [
    applicationItems,
    appliedCompanyOptions,
    appliedFormats,
    appliedKinds,
    appliedLevels,
    appliedSearch,
    appliedStatuses,
    appliedTags,
  ]);

  const sortedApplications = useMemo(() => {
    return [...filteredApplications].sort((left, right) => {
      const comparison = new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
      return appliedSortDirection === "asc" ? comparison : -comparison;
    });
  }, [appliedSortDirection, filteredApplications]);

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
    setAppliedLevels(selectedLevels);
    setAppliedFormats(selectedFormats);
    setAppliedCompanyOptions(selectedCompanyOptions);
    setAppliedTags(selectedTags);
    setIsFilterOpen(false);
  };

  const applySorting = () => {
    setAppliedSortDirection(selectedSortDirection);
    setIsSortOpen(false);
  };

  const resetFilters = () => {
    setSelectedKinds(["all"]);
    setAppliedKinds(["all"]);
    setSelectedStatuses([]);
    setAppliedStatuses([]);
    setSelectedLevels([]);
    setAppliedLevels([]);
    setSelectedFormats([]);
    setAppliedFormats([]);
    setSelectedCompanyOptions([]);
    setAppliedCompanyOptions([]);
    setSelectedTags([]);
    setAppliedTags([]);
    setIsFilterOpen(false);
  };

  const resetSorting = () => {
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
          queryClient.invalidateQueries({ queryKey: ["applications", "mine", "opportunity-ids"] }),
          queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] }),
          queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        ]);
      },
    });
  };

  return (
    <main className="applications-page home-page home-page--applicant">
      <Header
        containerClassName="home-page__container"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
        bottomContent={
          <>
            <nav className="header__categories" aria-label="Категории">
              {opportunityCategoryLinks.map((item) => (
                <Link
                  key={item.value}
                  to={{
                    pathname: "/",
                    search: item.value === "all" ? "" : `?category=${item.value}`,
                    hash: "#opportunity-map",
                  }}
                  className="header__category-link"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <CitySelector value={selectedCity} onChange={handleCityChange} />
          </>
        }
      />

      <Container className="settings-page__container applications-page__container">
        <nav className="settings-page__tabs favorites-page__tabs" aria-label="Разделы аккаунта">
          {applicantTabs.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.isCurrent ? "settings-page__tab settings-page__tab--active" : "settings-page__tab"}
              onClick={() => {
                if (item.to) {
                  navigate(item.to);
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="favorites-page__metrics" aria-label="Статистика откликов">
          {metricDefinitions.map((metric) => (
            <article key={metric.key} className="favorites-page__metric-card">
              {isApplicationsLoading ? (
                <>
                  <span className="favorites-page__skeleton favorites-page__skeleton--metric-label" />
                  <span className="favorites-page__skeleton favorites-page__skeleton--metric-value" />
                </>
              ) : (
                <>
                  <span className="favorites-page__metric-label">{metric.label}</span>
                  <strong className="favorites-page__metric-value">{formatCount(stats[metric.key])}</strong>
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
                <span className="favorites-page__icon favorites-page__icon--filter" aria-hidden="true" />
              </button>

              {isFilterOpen ? (
                <div className="favorites-page__popover">
                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head">
                      <h2 className="favorites-page__popover-title">Фильтры</h2>
                      <button type="button" className="favorites-page__popover-reset" onClick={resetFilters}>
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head">
                      <h3 className="favorites-page__popover-group-title">Статус отклика</h3>
                    </div>
                    <div className="favorites-page__option-list">
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
                    <div className="favorites-page__popover-head">
                      <h3 className="favorites-page__popover-group-title">Тип возможностей</h3>
                    </div>
                    <div className="favorites-page__option-list">
                      <label className="favorites-page__option">
                        <Checkbox
                          checked={selectedKinds.includes("all")}
                          onChange={() => toggleKindValue("all", setSelectedKinds, selectedKinds)}
                          variant="secondary"
                        />
                        <span>Все</span>
                      </label>
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
                    <div className="favorites-page__popover-head">
                      <h3 className="favorites-page__popover-group-title">Уровень</h3>
                    </div>
                    <div className="favorites-page__option-list">
                      {levelOptions.map((option) => (
                        <label key={option} className="favorites-page__option">
                          <Checkbox
                            checked={selectedLevels.includes(option)}
                            onChange={() => toggleMultiValue(option, selectedLevels, setSelectedLevels)}
                            variant="secondary"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head">
                      <h3 className="favorites-page__popover-group-title">Формат</h3>
                    </div>
                    <div className="favorites-page__option-list">
                      {formatOptions.map((option) => (
                        <label key={option} className="favorites-page__option">
                          <Checkbox
                            checked={selectedFormats.includes(option)}
                            onChange={() => toggleMultiValue(option, selectedFormats, setSelectedFormats)}
                            variant="secondary"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head">
                      <h3 className="favorites-page__popover-group-title">Компания</h3>
                    </div>
                    <div className="favorites-page__option-list">
                      {companyOptions.map((option) => (
                        <label key={option} className="favorites-page__option">
                          <Checkbox
                            checked={selectedCompanyOptions.includes(option)}
                            onChange={() => toggleMultiValue(option, selectedCompanyOptions, setSelectedCompanyOptions)}
                            variant="secondary"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {tagOptions.length > 0 ? (
                    <div className="favorites-page__popover-section">
                      <div className="favorites-page__popover-head">
                        <h3 className="favorites-page__popover-group-title">Теги</h3>
                      </div>
                      <div className="favorites-page__option-list favorites-page__option-list--tags">
                        {tagOptions.map((option) => (
                          <label key={option} className="favorites-page__option">
                            <Checkbox
                              checked={selectedTags.includes(option)}
                              onChange={() => toggleMultiValue(option, selectedTags, setSelectedTags)}
                              variant="secondary"
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="favorites-page__popover-footer">
                    <Button type="button" variant="secondary" size="sm" onClick={applyFilters}>
                      Применить
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
                <span
                  aria-hidden="true"
                  className={
                    appliedSortDirection === "desc"
                      ? "favorites-page__icon favorites-page__icon--sorting"
                      : "favorites-page__icon favorites-page__icon--sorting favorites-page__icon--ascending"
                  }
                />
              </button>

              {isSortOpen ? (
                <div className="favorites-page__popover favorites-page__popover--compact">
                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head">
                      <h2 className="favorites-page__popover-title">Сортировка</h2>
                      <button type="button" className="favorites-page__popover-reset" onClick={resetSorting}>
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__option-list">
                      <label className="favorites-page__option">
                        <Radio
                          checked={selectedSortDirection === "desc"}
                          onChange={() => setSelectedSortDirection("desc")}
                          variant="secondary"
                          name="applications-sort-direction"
                        />
                        <span>Сначала новые</span>
                      </label>
                      <label className="favorites-page__option">
                        <Radio
                          checked={selectedSortDirection === "asc"}
                          onChange={() => setSelectedSortDirection("asc")}
                          variant="secondary"
                          name="applications-sort-direction"
                        />
                        <span>Сначала старые</span>
                      </label>
                    </div>
                  </div>

                  <div className="favorites-page__popover-footer">
                    <Button type="button" variant="secondary" size="sm" fullWidth onClick={applySorting}>
                      Применить
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

              return (
                <article key={opportunity.id} className="applications-page__card">
                  <div className="applications-page__card-main">
                    <div className="applications-page__content">
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

                      <div className="applications-page__title-block">
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
                      <div className="applications-page__company-block">
                        <div className="applications-page__company-header">
                          <button
                            type="button"
                            className="applications-page__company"
                            onClick={() => openEmployerContacts(opportunity, navigate)}
                          >
                            {opportunity.companyName}
                          </button>
                          {opportunity.companyVerified ? (
                            <span className="applications-page__verified-icon" aria-hidden="true">
                              <img src={verifiedIcon} alt="" className="applications-page__verified-icon-image" />
                            </span>
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

                      <section className="applications-page__meta-row">
                        <div className="applications-page__meta-item">
                          <span className="applications-page__meta-label">Отклик отправлен</span>
                          <strong className="applications-page__meta-value">{formatDateTime(item.submittedAt)}</strong>
                        </div>
                        <div className="applications-page__meta-item">
                          <span className="applications-page__meta-label">Последнее обновление</span>
                          <strong className="applications-page__meta-value">{formatDateTime(item.updatedAt)}</strong>
                        </div>
                      </section>

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
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : (
          <section className="favorites-page__empty">
            <h2 className="favorites-page__empty-title">Откликов пока нет</h2>
            <p className="favorites-page__empty-text">
              Когда вы откликнетесь на вакансии, стажировки или мероприятия, они появятся здесь со статусом и историей обновлений.
            </p>
            <div className="favorites-page__empty-actions">
              <Button type="button" variant="secondary" onClick={() => navigate("/")}>
                Найти возможность
              </Button>
            </div>
          </section>
        )}
      </Container>

      <Footer theme="applicant" />

      <Modal
        title="Подтвердите действие"
        isOpen={pendingWithdrawOpportunityId !== null}
        onClose={() => setPendingWithdrawOpportunityId(null)}
        panelClassName="applications-page__withdraw-modal-panel"
        titleAccentColor="var(--color-secondary)"
      >
        <div className="applications-page__withdraw-modal">
          <p className="applications-page__withdraw-modal-text">
            Вы уверены, что хотите отозвать отклик?
          </p>
          <div className="applications-page__withdraw-modal-actions">
            <Button
              type="button"
              variant="secondary-outline"
              size="md"
              onClick={() => setPendingWithdrawOpportunityId(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={handleConfirmWithdraw}
              loading={withdrawApplicationMutation.isPending}
            >
              Отозвать отклик
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
