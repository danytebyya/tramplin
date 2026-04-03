import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import sadSearchIcon from "../../assets/icons/sad-search.png";
import { CitySelection, CitySelector, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { Opportunity } from "../../entities/opportunity";
import { listOpportunitiesRequest } from "../../entities/opportunity/api";
import {
  addFavoriteOpportunityRequest,
  listFavoriteOpportunitiesRequest,
  removeFavoriteOpportunityRequest,
} from "../../features/favorites";
import {
  listMyAppliedOpportunityIdsRequest,
  submitOpportunityApplicationRequest,
  WithdrawApplicationModal,
  withdrawOpportunityApplicationRequest,
} from "../../features/applications";
import { useAuthStore } from "../../features/auth";
import { matchesOpportunitySearch, normalizeOpportunitySearchText } from "../../shared/lib";
import { Button, Checkbox, Container, Input, ProfileTabs, Radio } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildApplicantProfileMenuItems, Header } from "../../widgets/header";
import { OpportunityList } from "../../widgets/opportunity-list";
import "../settings/settings.css";
import "./favorites.css";

type FavoriteSortField = "title" | "company" | "rating" | "published";
type FavoriteSortDirection = "asc" | "desc";
type FavoriteStatsKey = "total" | "vacancy" | "internship" | "event" | "mentorship";
type OpportunityCategoryFilter = "all" | Opportunity["kind"];

const favoriteMetricDefinitions: Array<{ key: FavoriteStatsKey; label: string }> = [
  { key: "total", label: "Всего:" },
  { key: "vacancy", label: "Вакансии:" },
  { key: "internship", label: "Стажировки:" },
  { key: "event", label: "Мероприятия:" },
  { key: "mentorship", label: "Менторство:" },
];

const ALL_TIME_PUBLICATION_OPTION = "За всё время";
const levelOptions = ["Junior", "Middle", "Senior"];
const formatOptions = ["Офлайн", "Гибрид", "Удалённо"];
const employmentOptions = ["Полная занятость", "Частичная занятость", "Проектная работа", "Стажировка"];
const publicationOptions = [ALL_TIME_PUBLICATION_OPTION, "За сегодня", "За 3 дня", "За неделю"];
const companyOptions = ["Только верифицированные компании", "Только с рейтингом 4,5 и выше"];

const sortFieldOptions: Array<{ value: FavoriteSortField; label: string }> = [
  { value: "title", label: "По названию" },
  { value: "company", label: "По компании" },
  { value: "rating", label: "По рейтингу" },
  { value: "published", label: "По дате публикации" },
];
const opportunityCategoryLinks: Array<{ value: OpportunityCategoryFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "vacancy", label: "Вакансии" },
  { value: "internship", label: "Стажировки" },
  { value: "event", label: "Мероприятия" },
  { value: "mentorship", label: "Менторские программы" },
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

  if (normalized.includes("стаж")) {
    return "intern";
  }

  if (normalized.includes("junior")) {
    return "junior";
  }

  if (normalized.includes("middle")) {
    return "middle";
  }

  if (normalized.includes("senior")) {
    return "senior";
  }

  return normalized;
}

function normalizeEmploymentOption(value: string) {
  const normalized = normalizeFilterText(value);

  if (normalized.includes("полная") || normalized.includes("full")) {
    return "full-time";
  }

  if (normalized.includes("частичная") || normalized.includes("part")) {
    return "part-time";
  }

  if (normalized.includes("проект")) {
    return "project";
  }

  if (normalized.includes("стаж")) {
    return "internship";
  }

  return normalized;
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
    if (period === "За сегодня") {
      return elapsedMs <= oneDayMs;
    }

    if (period === "За 3 дня") {
      return elapsedMs <= oneDayMs * 3;
    }

    if (period === "За неделю") {
      return elapsedMs <= oneDayMs * 7;
    }

    return false;
  });
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function resolveThemeRole(role: string | null) {
  if (role === "junior") {
    return "curator";
  }

  if (role === "employer" || role === "curator" || role === "admin") {
    return role;
  }

  return "applicant";
}

export function FavoritesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const sortingRef = useRef<HTMLDivElement | null>(null);
  const pendingProfileReturnScrollYRef = useRef<number | null>(null);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const role = useAuthStore((state) => state.role);
  const themeRole = resolveThemeRole(role);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const isApplicant = role === "applicant";
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState<Array<Opportunity["kind"] | "all">>(["all"]);
  const [appliedKinds, setAppliedKinds] = useState<Array<Opportunity["kind"] | "all">>(["all"]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [appliedLevels, setAppliedLevels] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [appliedFormats, setAppliedFormats] = useState<string[]>([]);
  const [selectedEmployment, setSelectedEmployment] = useState<string[]>([]);
  const [appliedEmployment, setAppliedEmployment] = useState<string[]>([]);
  const [selectedPublicationPeriods, setSelectedPublicationPeriods] = useState<string[]>([ALL_TIME_PUBLICATION_OPTION]);
  const [appliedPublicationPeriods, setAppliedPublicationPeriods] = useState<string[]>([ALL_TIME_PUBLICATION_OPTION]);
  const [selectedCompanyOptions, setSelectedCompanyOptions] = useState<string[]>([]);
  const [appliedCompanyOptions, setAppliedCompanyOptions] = useState<string[]>([]);
  const [selectedSortField, setSelectedSortField] = useState<FavoriteSortField>("published");
  const [appliedSortField, setAppliedSortField] = useState<FavoriteSortField>("published");
  const [selectedSortDirection, setSelectedSortDirection] = useState<FavoriteSortDirection>("desc");
  const [appliedSortDirection, setAppliedSortDirection] = useState<FavoriteSortDirection>("desc");
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

  const submitApplicationMutation = useMutation({
    mutationFn: async ({
      opportunityId,
      shouldWithdraw,
    }: {
      opportunityId: string;
      shouldWithdraw: boolean;
    }) => {
      return shouldWithdraw
        ? withdrawOpportunityApplicationRequest(opportunityId)
        : submitOpportunityApplicationRequest(opportunityId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["applications", "mine", "opportunity-ids"] });
    },
  });

  const handleApplyOpportunity = (opportunityId: string) => {
    if (submitApplicationMutation.isPending) {
      return;
    }

    if (appliedOpportunityIds.includes(opportunityId)) {
      setPendingWithdrawOpportunityId(opportunityId);
      return;
    }

    submitApplicationMutation.mutate({
      opportunityId,
      shouldWithdraw: false,
    });
  };

  const handleConfirmWithdrawOpportunity = () => {
    if (!pendingWithdrawOpportunityId || submitApplicationMutation.isPending) {
      return;
    }

    submitApplicationMutation.mutate(
      {
        opportunityId: pendingWithdrawOpportunityId,
        shouldWithdraw: true,
      },
      {
        onSuccess: async () => {
          setPendingWithdrawOpportunityId(null);
          await queryClient.invalidateQueries({ queryKey: ["applications", "mine", "opportunity-ids"] });
        },
      },
    );
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const restoreScrollY = (location.state as { restoreScrollY?: number } | null)?.restoreScrollY;

    if (typeof restoreScrollY !== "number") {
      return;
    }

    pendingProfileReturnScrollYRef.current = restoreScrollY;
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

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

  const favoriteOpportunityIds = favoriteOpportunitiesQuery.data?.data?.items ?? [];
  const isFavoritesLoading =
    opportunitiesQuery.isPending ||
    favoriteOpportunitiesQuery.isPending ||
    myApplicationsQuery.isPending;
  const favoriteOpportunities = useMemo(() => {
    const favoriteIds = new Set(favoriteOpportunityIds);
    return (opportunitiesQuery.data ?? []).filter((opportunity) => favoriteIds.has(opportunity.id));
  }, [favoriteOpportunityIds, opportunitiesQuery.data]);

  const appliedOpportunityIds = useMemo(
    () => myApplicationsQuery.data?.data?.opportunity_ids ?? [],
    [myApplicationsQuery.data?.data?.opportunity_ids],
  );

  const stats = useMemo(() => {
    return favoriteOpportunities.reduce(
      (accumulator, opportunity) => {
        accumulator.total += 1;
        accumulator[opportunity.kind] += 1;
        return accumulator;
      },
      {
        total: 0,
        vacancy: 0,
        internship: 0,
        event: 0,
        mentorship: 0,
      } satisfies Record<FavoriteStatsKey, number>,
    );
  }, [favoriteOpportunities]);

  const tagOptions = useMemo(() => {
    const tagMap = new Map<string, string>();

    favoriteOpportunities.forEach((opportunity) => {
      opportunity.tags.forEach((tag) => {
        const normalized = tag.trim();
        if (!normalized) {
          return;
        }
        tagMap.set(normalized.toLocaleLowerCase("ru-RU"), normalized);
      });
    });

    return Array.from(tagMap.values()).sort((left, right) => left.localeCompare(right, "ru"));
  }, [favoriteOpportunities]);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [appliedTags, setAppliedTags] = useState<string[]>([]);

  const filteredOpportunities = useMemo(() => {
    const normalizedSearch = normalizeOpportunitySearchText(appliedSearch);
    const normalizedFormats = appliedFormats
      .map(normalizeFormatOption)
      .filter((item): item is Opportunity["format"] => Boolean(item));
    const normalizedLevels = appliedLevels.map(normalizeLevelOption);
    const normalizedEmployment = appliedEmployment.map(normalizeEmploymentOption);

    return favoriteOpportunities.filter((opportunity) => {
      if (!matchesOpportunitySearch(opportunity, normalizedSearch)) {
        return false;
      }

      if (!appliedKinds.includes("all") && !appliedKinds.includes(opportunity.kind)) {
        return false;
      }

      if (normalizedLevels.length > 0 && !normalizedLevels.includes(normalizeLevelOption(opportunity.levelLabel))) {
        return false;
      }

      if (normalizedFormats.length > 0 && !normalizedFormats.includes(opportunity.format)) {
        return false;
      }

      if (
        normalizedEmployment.length > 0 &&
        !normalizedEmployment.includes(normalizeEmploymentOption(opportunity.employmentLabel))
      ) {
        return false;
      }

      if (!matchesPublicationPeriod(opportunity.publishedAt, appliedPublicationPeriods)) {
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
    appliedCompanyOptions,
    appliedEmployment,
    appliedFormats,
    appliedKinds,
    appliedLevels,
    appliedPublicationPeriods,
    appliedSearch,
    appliedTags,
    favoriteOpportunities,
  ]);

  const sortedOpportunities = useMemo(() => {
    return [...filteredOpportunities].sort((left, right) => {
      let comparison = 0;

      if (appliedSortField === "company") {
        comparison = left.companyName.localeCompare(right.companyName, "ru");
      } else if (appliedSortField === "rating") {
        comparison = (left.companyRating ?? 0) - (right.companyRating ?? 0);
      } else if (appliedSortField === "published") {
        comparison =
          new Date(left.publishedAt ?? 0).getTime() - new Date(right.publishedAt ?? 0).getTime();
      } else {
        comparison = left.title.localeCompare(right.title, "ru");
      }

      return appliedSortDirection === "asc" ? comparison : -comparison;
    });
  }, [appliedSortDirection, appliedSortField, filteredOpportunities]);

  useEffect(() => {
    if (pendingProfileReturnScrollYRef.current === null || isFavoritesLoading) {
      return;
    }

    const restoreScrollY = pendingProfileReturnScrollYRef.current;
    pendingProfileReturnScrollYRef.current = null;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(restoreScrollY, 0), behavior: "auto" });
    });
  }, [isFavoritesLoading, sortedOpportunities.length]);

  const profileMenuItems = buildApplicantProfileMenuItems(navigate);

  const toggleMultiValue = (value: string, selectedValues: string[], setter: (value: string[]) => void) => {
    setter(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  };

  const toggleKindValue = (nextValue: Opportunity["kind"] | "all", setter: (value: Array<Opportunity["kind"] | "all">) => void, current: Array<Opportunity["kind"] | "all">) => {
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
  };

  const applyFilters = () => {
    setAppliedKinds(selectedKinds);
    setAppliedLevels(selectedLevels);
    setAppliedFormats(selectedFormats);
    setAppliedEmployment(selectedEmployment);
    setAppliedPublicationPeriods(selectedPublicationPeriods);
    setAppliedCompanyOptions(selectedCompanyOptions);
    setAppliedTags(selectedTags);
    setIsFilterOpen(false);
  };

  const resetFilters = () => {
    setSelectedKinds(["all"]);
    setAppliedKinds(["all"]);
    setSelectedLevels([]);
    setAppliedLevels([]);
    setSelectedFormats([]);
    setAppliedFormats([]);
    setSelectedEmployment([]);
    setAppliedEmployment([]);
    setSelectedPublicationPeriods([ALL_TIME_PUBLICATION_OPTION]);
    setAppliedPublicationPeriods([ALL_TIME_PUBLICATION_OPTION]);
    setSelectedCompanyOptions([]);
    setAppliedCompanyOptions([]);
    setSelectedTags([]);
    setAppliedTags([]);
    setIsFilterOpen(false);
  };

  const applySorting = () => {
    setAppliedSortField(selectedSortField);
    setAppliedSortDirection(selectedSortDirection);
    setIsSortOpen(false);
  };

  const resetSorting = () => {
    setSelectedSortField("published");
    setAppliedSortField("published");
    setSelectedSortDirection("desc");
    setAppliedSortDirection("desc");
    setIsSortOpen(false);
  };

  if (!isApplicant) {
    return <Navigate to="/" replace />;
  }

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  return (
    <main className="favorites-page home-page home-page--applicant">
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

      <Container className="settings-page__shell favorites-page__shell">
        <ProfileTabs
          navigate={navigate}
          audience="applicant"
          current="favorites"
          tabsClassName="settings-page__tabs favorites-page__tabs"
          ariaLabel="Разделы аккаунта"
        />

        <section className="favorites-page__metrics stats-panel" aria-label="Статистика избранного">
          {favoriteMetricDefinitions.map((metric) => (
            <article key={metric.key} className="favorites-page__metric-card stats-panel__card">
              {isFavoritesLoading ? (
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
          <label className="favorites-page__search" aria-label="Поиск по избранному">
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
                      <h3 className="favorites-page__popover-group-title">Занятость</h3>
                    </div>
                    <div className="favorites-page__option-list">
                      {employmentOptions.map((option) => (
                        <label key={option} className="favorites-page__option">
                          <Checkbox
                            checked={selectedEmployment.includes(option)}
                            onChange={() => toggleMultiValue(option, selectedEmployment, setSelectedEmployment)}
                            variant="secondary"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="favorites-page__popover-section">
                    <div className="favorites-page__popover-head">
                      <h3 className="favorites-page__popover-group-title">Дата публикации</h3>
                    </div>
                    <div className="favorites-page__option-list">
                      {publicationOptions.map((option) => (
                        <label key={option} className="favorites-page__option">
                          <Checkbox
                            checked={selectedPublicationPeriods.includes(option)}
                            onChange={() => {
                              if (option === ALL_TIME_PUBLICATION_OPTION) {
                                setSelectedPublicationPeriods([ALL_TIME_PUBLICATION_OPTION]);
                                return;
                              }

                              const nextValues = selectedPublicationPeriods.includes(option)
                                ? selectedPublicationPeriods.filter(
                                  (item) =>
                                    item !== option &&
                                    item !== ALL_TIME_PUBLICATION_OPTION &&
                                    item !== "За все время",
                                )
                                : [
                                  ...selectedPublicationPeriods.filter(
                                    (item) =>
                                      item !== ALL_TIME_PUBLICATION_OPTION &&
                                      item !== "За все время",
                                  ),
                                  option,
                                ];

                              setSelectedPublicationPeriods(
                                nextValues.length > 0 ? nextValues : [ALL_TIME_PUBLICATION_OPTION],
                              );
                            }}
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
                      {sortFieldOptions.map((option) => (
                        <label key={option.value} className="favorites-page__option">
                          <Radio
                            checked={selectedSortField === option.value}
                            onChange={() => setSelectedSortField(option.value)}
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
                          checked={selectedSortDirection === "asc"}
                          onChange={() => setSelectedSortDirection("asc")}
                          variant="secondary"
                        />
                        <span>{selectedSortField === "rating" || selectedSortField === "published" ? "По возрастанию" : "А-Я"}</span>
                      </label>
                      <label className="favorites-page__option">
                        <Radio
                          checked={selectedSortDirection === "desc"}
                          onChange={() => setSelectedSortDirection("desc")}
                          variant="secondary"
                        />
                        <span>{selectedSortField === "rating" || selectedSortField === "published" ? "По убыванию" : "Я-А"}</span>
                      </label>
                    </div>
                  </div>

                  <div className="favorites-page__popover-footer">
                    <Button type="button" variant="secondary" size="sm" fullWidth onClick={applySorting}>
                      Показать результаты
                    </Button>
                    <Button type="button" variant="secondary-outline" size="sm" fullWidth onClick={resetSorting}>
                      Сбросить сортировку
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {isFavoritesLoading ? (
          <OpportunityList
            opportunities={[]}
            favoriteOpportunityIds={[]}
            appliedOpportunityIds={[]}
            roleName="applicant"
            isLoading
            skeletonCount={4}
            onToggleFavorite={() => undefined}
            onApply={() => undefined}
          />
        ) : sortedOpportunities.length > 0 ? (
          <OpportunityList
            opportunities={sortedOpportunities}
            favoriteOpportunityIds={favoriteOpportunityIds}
            appliedOpportunityIds={appliedOpportunityIds}
            roleName="applicant"
            onToggleFavorite={(opportunityId) => {
              const shouldFavorite = !favoriteOpportunityIds.includes(opportunityId);
              favoriteOpportunityMutation.mutate({ opportunityId, shouldFavorite });
            }}
            onApply={handleApplyOpportunity}
          />
        ) : (
          <section className="favorites-page__empty">
            <img src={sadSearchIcon} alt="" aria-hidden="true" className="favorites-page__empty-icon" />
            <h2 className="favorites-page__empty-title">Ничего не найдено</h2>
            <div className="favorites-page__empty-actions">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => navigate("/#opportunity-map")}
              >
                Перейти к возможностям
              </Button>
            </div>
          </section>
        )}
      </Container>
      <WithdrawApplicationModal
        isOpen={pendingWithdrawOpportunityId !== null}
        onClose={() => setPendingWithdrawOpportunityId(null)}
        onConfirm={handleConfirmWithdrawOpportunity}
        isPending={submitApplicationMutation.isPending}
      />

      <Footer theme={themeRole} />
    </main>
  );
}
