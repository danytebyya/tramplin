import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Navigate, NavLink, useNavigate } from "react-router-dom";

import arrowIcon from "../../assets/icons/arrow.svg";
import deleteIcon from "../../assets/icons/delete.svg";
import editIcon from "../../assets/icons/edit.svg";
import uploadIcon from "../../assets/icons/upload.svg";
import {
  CitySelection,
  readSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import {
  AddressSuggestion,
  CitySuggestion,
  getAddressByPoint,
  getAddressSuggestions,
  getCitySuggestions,
  getCityViewportByName,
  popularCities,
} from "../../features/city-selector/api";
import { meRequest, performLogout, useAuthStore } from "../../features/auth";
import { Badge, Button, Checkbox, Container, Input, Modal, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { Header } from "../../widgets/header";
import { OpportunityLocationMap, OpportunityLocationPoint } from "./opportunity-location-map";
import "./opportunity-management.css";

type OpportunityManagementStatus = "active" | "planned" | "removed" | "rejected" | "pending_review";
type OpportunitySortValue = "newest" | "oldest" | "responses";
type OpportunitySortDirection = "asc" | "desc";

type OpportunityManagementItem = {
  id: string;
  title: string;
  kind: string;
  salaryLabel: string;
  locationLabel: string;
  tags: string[];
  levelLabel: string;
  employmentLabel: string;
  description: string;
  status: OpportunityManagementStatus;
  responsesCount?: number;
  publishedAtLabel?: string;
  activeUntilLabel?: string;
  plannedPublishAtLabel?: string;
  plannedCloseAtLabel?: string;
  closedAtLabel?: string;
  moderationComment?: string;
  submittedAtLabel?: string;
};

const DEFAULT_CITY = "Чебоксары";
const PAGE_SIZE = 5;
const opportunityTypeOptions = [
  { value: "vacancy", label: "Вакансия" },
  { value: "internship", label: "Стажировка" },
  { value: "event", label: "Мероприятие" },
  { value: "mentorship", label: "Менторская программа" },
] as const;
const workFormatOptions = [
  { value: "offline", label: "Offline" },
  { value: "hybrid", label: "Гибрид" },
  { value: "online", label: "Online" },
] as const;
const opportunityTagOptions = [
  "Python",
  "JavaScript",
  "React",
  "SQL",
  "Docker",
  "TypeScript",
  "Analytics",
  "Design",
  "Marketing",
  "Product",
];

const statusFilterItems: Array<{ value: OpportunityManagementStatus | "all"; label: string }> = [
  { value: "all", label: "Все статусы" },
  { value: "active", label: "Активно" },
  { value: "planned", label: "Запланировано" },
  { value: "pending_review", label: "На рассмотрении" },
  { value: "removed", label: "Снято с публикации" },
  { value: "rejected", label: "Отклонено" },
];

const sortItems: Array<{ value: OpportunitySortValue; label: string }> = [
  { value: "newest", label: "По дате публикации" },
  { value: "responses", label: "По откликам" },
];

const opportunityItems: OpportunityManagementItem[] = [
  {
    id: "opportunity-1",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "active",
    responsesCount: 23,
    publishedAtLabel: "23.03.2026",
    activeUntilLabel: "23.04.2026",
  },
  {
    id: "opportunity-2",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "planned",
    plannedPublishAtLabel: "23.03.2026",
    plannedCloseAtLabel: "23.04.2026",
  },
  {
    id: "opportunity-3",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "removed",
    responsesCount: 23,
    publishedAtLabel: "23.03.2026",
    closedAtLabel: "23.04.2026",
  },
  {
    id: "opportunity-4",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "rejected",
    moderationComment: "Не указана зарплата",
  },
  {
    id: "opportunity-5",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "pending_review",
    submittedAtLabel: "23.03.2026",
  },
  {
    id: "opportunity-6",
    title: "Стажировка",
    kind: "Стажировка",
    salaryLabel: "Оплата по договоренности",
    locationLabel: "Москва (гибрид)",
    tags: ["React", "Junior", "Аналитика"],
    levelLabel: "Junior",
    employmentLabel: "Part-time",
    description:
      "Описание стажировки с понятными требованиями, наставником, гибким графиком и понятной траекторией роста.",
    status: "active",
    responsesCount: 12,
    publishedAtLabel: "19.03.2026",
    activeUntilLabel: "19.04.2026",
  },
  {
    id: "opportunity-7",
    title: "Мероприятие",
    kind: "Мероприятие",
    salaryLabel: "Бесплатно",
    locationLabel: "Онлайн",
    tags: ["Tech talk", "Data", "AI"],
    levelLabel: "Middle",
    employmentLabel: "One-time",
    description:
      "Открытая онлайн-встреча для студентов и джунов, где команда рассказывает про реальные задачи и процессы.",
    status: "planned",
    plannedPublishAtLabel: "25.03.2026",
    plannedCloseAtLabel: "30.03.2026",
  },
];

function resolveStatusLabel(status: OpportunityManagementStatus) {
  switch (status) {
    case "active":
      return "Активно";
    case "planned":
      return "Запланировано";
    case "removed":
      return "Снято с публикации";
    case "rejected":
      return "Отклонено";
    case "pending_review":
      return "На рассмотрении";
    default:
      return status;
  }
}

function resolveStatusVariant(status: OpportunityManagementStatus) {
  if (status === "active") {
    return "active" as const;
  }

  if (status === "planned") {
    return "verified" as const;
  }

  if (status === "pending_review") {
    return "pending-review" as const;
  }

  if (status === "rejected") {
    return "rejected" as const;
  }

  return "unpublished" as const;
}

function resolveSortWeight(item: OpportunityManagementItem, sortValue: OpportunitySortValue) {
  if (sortValue === "responses") {
    return item.responsesCount ?? 0;
  }

  const fallbackDates = [
    item.publishedAtLabel,
    item.plannedPublishAtLabel,
    item.submittedAtLabel,
    item.closedAtLabel,
  ].filter(Boolean);
  const source = fallbackDates[0];

  if (!source) {
    return 0;
  }

  const [day, month, year] = source.split(".").map((value) => Number(value));
  if (!day || !month || !year) {
    return 0;
  }

  return new Date(year, month - 1, day).getTime();
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", currentPage, "ellipsis-right", totalPages];
}

function formatPointLabel(point: OpportunityLocationPoint) {
  return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}

export function OpportunityManagementPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? DEFAULT_CITY);
  const [searchValue, setSearchValue] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<Array<OpportunityManagementStatus | "all">>(["all"]);
  const [appliedStatuses, setAppliedStatuses] = useState<Array<OpportunityManagementStatus | "all">>(["all"]);
  const [selectedSortField, setSelectedSortField] = useState<OpportunitySortValue>("newest");
  const [appliedSortField, setAppliedSortField] = useState<OpportunitySortValue>("newest");
  const [selectedSortDirection, setSelectedSortDirection] = useState<OpportunitySortDirection>("desc");
  const [appliedSortDirection, setAppliedSortDirection] = useState<OpportunitySortDirection>("desc");
  const [page, setPage] = useState(1);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isCreateOpportunityModalOpen, setIsCreateOpportunityModalOpen] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [createOpportunityType, setCreateOpportunityType] =
    useState<(typeof opportunityTypeOptions)[number]["value"]>("vacancy");
  const [createOpportunityTitle, setCreateOpportunityTitle] = useState("");
  const [createOpportunityDescription, setCreateOpportunityDescription] = useState("");
  const [createOpportunityCity, setCreateOpportunityCity] = useState(selectedCity);
  const [createOpportunityCityPoint, setCreateOpportunityCityPoint] = useState<OpportunityLocationPoint | null>(
    popularCities.find((item) => item.name === selectedCity)?.point ?? null,
  );
  const [createOpportunitySalary, setCreateOpportunitySalary] = useState("");
  const [createOpportunityTagQuery, setCreateOpportunityTagQuery] = useState("");
  const [createOpportunityTags, setCreateOpportunityTags] = useState<string[]>(["Python", "JavaScript", "React"]);
  const [createOpportunityFormat, setCreateOpportunityFormat] =
    useState<(typeof workFormatOptions)[number]["value"]>("offline");
  const [createOpportunityPublishDate, setCreateOpportunityPublishDate] = useState("");
  const [createOpportunityAddress, setCreateOpportunityAddress] = useState("");
  const [createOpportunityCitySuggestions, setCreateOpportunityCitySuggestions] = useState<CitySuggestion[]>([]);
  const [isCitySuggestionsOpen, setIsCitySuggestionsOpen] = useState(false);
  const [isCitySuggestionsLoading, setIsCitySuggestionsLoading] = useState(false);
  const [createOpportunityAddressSuggestions, setCreateOpportunityAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isAddressSuggestionsOpen, setIsAddressSuggestionsOpen] = useState(false);
  const [isAddressSuggestionsLoading, setIsAddressSuggestionsLoading] = useState(false);
  const [selectedLocationPoint, setSelectedLocationPoint] = useState<OpportunityLocationPoint | null>(null);
  const [isDraftLocationAddressLoading, setIsDraftLocationAddressLoading] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const cityInputRef = useRef<HTMLInputElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const cityFieldRef = useRef<HTMLDivElement | null>(null);
  const addressFieldRef = useRef<HTMLDivElement | null>(null);
  const reverseGeocodeRequestIdRef = useRef(0);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
        setIsStatusMenuOpen(false);
      }

      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }

      if (cityFieldRef.current && !cityFieldRef.current.contains(event.target as Node)) {
        setIsCitySuggestionsOpen(false);
      }

      if (addressFieldRef.current && !addressFieldRef.current.contains(event.target as Node)) {
        setIsAddressSuggestionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchValue, appliedSortDirection, appliedSortField, appliedStatuses]);

  useEffect(() => {
    const normalizedQuery = createOpportunityCity.trim();

    if (!isCreateOpportunityModalOpen || !normalizedQuery) {
      setCreateOpportunityCitySuggestions([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsCitySuggestionsLoading(true);

      void getCitySuggestions(normalizedQuery)
        .then((items) => {
          setCreateOpportunityCitySuggestions(items);
        })
        .catch(() => {
          setCreateOpportunityCitySuggestions([]);
        })
        .finally(() => {
          setIsCitySuggestionsLoading(false);
        });
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [createOpportunityCity, isCreateOpportunityModalOpen]);

  useEffect(() => {
    if (!isCreateOpportunityModalOpen || !createOpportunityCity.trim() || createOpportunityCityPoint) {
      return;
    }

    let isActive = true;

    void getCityViewportByName(createOpportunityCity)
      .then((viewport) => {
        if (!isActive || !viewport) {
          return;
        }

        setCreateOpportunityCityPoint({
          lon: viewport.center[0],
          lat: viewport.center[1],
        });
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [createOpportunityCity, createOpportunityCityPoint, isCreateOpportunityModalOpen]);

  useEffect(() => {
    const normalizedQuery = createOpportunityAddress.trim();

    if (!isCreateOpportunityModalOpen || !normalizedQuery) {
      setCreateOpportunityAddressSuggestions([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsAddressSuggestionsLoading(true);

      void getAddressSuggestions(normalizedQuery)
        .then((items) => {
          setCreateOpportunityAddressSuggestions(items);
        })
        .catch(() => {
          setCreateOpportunityAddressSuggestions([]);
        })
        .finally(() => {
          setIsAddressSuggestionsLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [createOpportunityAddress, createOpportunityCity, isCreateOpportunityModalOpen]);

  if (role !== "employer") {
    return <Navigate to="/" replace />;
  }

  const toggleStatusFilter = (value: OpportunityManagementStatus | "all") => {
    setSelectedStatuses((current) => {
      if (value === "all") {
        return ["all"];
      }

      const nextItems = current.includes(value)
        ? current.filter((item) => item !== value && item !== "all")
        : [...current.filter((item) => item !== "all"), value];

      return nextItems.length > 0 ? nextItems : ["all"];
    });
  };

  const applyFilters = () => {
    setAppliedStatuses(selectedStatuses);
    setIsStatusMenuOpen(false);
    setPage(1);
  };

  const resetFilters = () => {
    setSelectedStatuses(["all"]);
    setAppliedStatuses(["all"]);
    setIsStatusMenuOpen(false);
    setPage(1);
  };

  const applySorting = () => {
    setAppliedSortField(selectedSortField);
    setAppliedSortDirection(selectedSortDirection);
    setIsSortMenuOpen(false);
    setPage(1);
  };

  const resetSorting = () => {
    setSelectedSortField("newest");
    setAppliedSortField("newest");
    setSelectedSortDirection("desc");
    setAppliedSortDirection("desc");
    setIsSortMenuOpen(false);
    setPage(1);
  };

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const nextItems = opportunityItems.filter((item) => {
      if (!appliedStatuses.includes("all") && !appliedStatuses.includes(item.status)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        item.title,
        item.kind,
        item.locationLabel,
        item.levelLabel,
        item.employmentLabel,
        item.description,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });

    nextItems.sort((left, right) => {
      const leftWeight = resolveSortWeight(left, appliedSortField);
      const rightWeight = resolveSortWeight(right, appliedSortField);

      if (appliedSortDirection === "asc") {
        return leftWeight - rightWeight;
      }

      return rightWeight - leftWeight;
    });

    return nextItems;
  }, [appliedSortDirection, appliedSortField, appliedStatuses, searchValue]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const paginationItems = buildPaginationItems(currentPage, totalPages);

  const metrics = {
    total: opportunityItems.length,
    active: opportunityItems.filter((item) => item.status === "active").length,
    planned: opportunityItems.filter((item) => item.status === "planned").length,
    closed: opportunityItems.filter((item) => item.status === "removed" || item.status === "rejected").length,
  };

  const profileMenuItems = [
    { label: "Профиль компании", onClick: () => navigate("/dashboard/employer") },
    { label: "Настройки", onClick: () => navigate("/settings") },
    { label: "Выйти", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) },
  ];
  const filteredTagOptions = opportunityTagOptions.filter((item) =>
    item.toLowerCase().includes(createOpportunityTagQuery.trim().toLowerCase()) &&
    !createOpportunityTags.includes(item),
  );
  const preferredCity =
    meQuery.data?.data?.user?.preferred_city?.trim() || selectedCity;
  const currentEmployerName =
    meQuery.data?.data?.user?.employer_profile?.company_name?.trim() || "";
  const selectedCityPoint = createOpportunityCityPoint;
  const createOpportunityPreviewPoint = selectedLocationPoint ?? selectedCityPoint;
  const isCreateOpportunityReady = Boolean(
    createOpportunityTitle.trim() &&
    createOpportunityDescription.trim() &&
    createOpportunityCity.trim() &&
    createOpportunitySalary.trim() &&
    createOpportunityTags.length > 0,
  );

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  const resetCreateOpportunityForm = () => {
    setCreateOpportunityType("vacancy");
    setCreateOpportunityTitle("");
    setCreateOpportunityDescription("");
    setCreateOpportunityCity(preferredCity);
    setCreateOpportunityCityPoint(popularCities.find((item) => item.name === preferredCity)?.point ?? null);
    setCreateOpportunitySalary("");
    setCreateOpportunityTagQuery("");
    setCreateOpportunityTags(["Python", "JavaScript", "React"]);
    setCreateOpportunityFormat("offline");
    setCreateOpportunityPublishDate("");
    setCreateOpportunityAddress("");
    setCreateOpportunityAddressSuggestions([]);
    setIsAddressSuggestionsOpen(false);
    setSelectedLocationPoint(null);
    setIsDraftLocationAddressLoading(false);
    setIsMapExpanded(false);
  };

  useEffect(() => {
    if (selectedLocationPoint) {
      return;
    }

    setCreateOpportunityCity(preferredCity);
    setCreateOpportunityCityPoint(popularCities.find((item) => item.name === preferredCity)?.point ?? null);
  }, [preferredCity, selectedLocationPoint]);

  const closeCreateOpportunityModal = () => {
    setIsCreateOpportunityModalOpen(false);
    resetCreateOpportunityForm();
  };

  const handleAddressSuggestionSelect = (item: AddressSuggestion) => {
    setCreateOpportunityAddress(item.fullAddress);
    setCreateOpportunityAddressSuggestions([]);
    setIsAddressSuggestionsOpen(false);
    addressInputRef.current?.blur();

    if (item.point) {
      setSelectedLocationPoint(item.point);
    }
  };

  const handlePreviewLocationPointChange = (point: OpportunityLocationPoint) => {
    setSelectedLocationPoint(point);

    const requestId = reverseGeocodeRequestIdRef.current + 1;

    reverseGeocodeRequestIdRef.current = requestId;
    setIsDraftLocationAddressLoading(true);

    void getAddressByPoint(point, createOpportunityCity)
      .then((result) => {
        if (reverseGeocodeRequestIdRef.current !== requestId) {
          return;
        }

        const nextAddress = result?.fullAddress ?? "";

        if (nextAddress) {
          setCreateOpportunityAddress(nextAddress);
          setCreateOpportunityAddressSuggestions([]);
          setIsAddressSuggestionsOpen(false);
        }
      })
      .catch(() => {
        if (reverseGeocodeRequestIdRef.current !== requestId) {
          return;
        }
      })
      .finally(() => {
        if (reverseGeocodeRequestIdRef.current !== requestId) {
          return;
        }

        setIsDraftLocationAddressLoading(false);
      });
  };

  const handleCreateOpportunitySubmit = () => {
    if (!isCreateOpportunityReady) {
      return;
    }

    closeCreateOpportunityModal();
  };

  return (
    <main className="opportunity-management-page">
      <Header
        containerClassName="opportunity-management-page__header-container"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
        topNavigation={
          <nav className="header__nav" aria-label="Основная навигация">
            <NavLink to="/" end className="header__nav-link">
              Главная
            </NavLink>
            <a href="#about" className="header__nav-link">
              О проекте
            </a>
          </nav>
        }
      />

      <Container className="opportunity-management-page__container">
        <nav className="opportunity-management-page__tabs" aria-label="Разделы работодателя">
          <button type="button" className="opportunity-management-page__tab" onClick={() => navigate("/dashboard/employer")}>
            Профиль компании
          </button>
          <button type="button" className="opportunity-management-page__tab opportunity-management-page__tab--active">
            Управление возможностями
          </button>
          <button type="button" className="opportunity-management-page__tab">
            Отклики
          </button>
          <button type="button" className="opportunity-management-page__tab">
            Чат
          </button>
          <button type="button" className="opportunity-management-page__tab" onClick={() => navigate("/settings")}>
            Настройки
          </button>
        </nav>

        <section className="opportunity-management-page__metrics" aria-label="Статистика возможностей">
          <article className="opportunity-management-page__metric-card">
            <span className="opportunity-management-page__metric-label">Всего:</span>
            <strong className="opportunity-management-page__metric-value">{metrics.total}</strong>
          </article>
          <article className="opportunity-management-page__metric-card">
            <span className="opportunity-management-page__metric-label">Активные:</span>
            <strong className="opportunity-management-page__metric-value">{metrics.active}</strong>
          </article>
          <article className="opportunity-management-page__metric-card">
            <span className="opportunity-management-page__metric-label">Запланированные:</span>
            <strong className="opportunity-management-page__metric-value">{metrics.planned}</strong>
          </article>
          <article className="opportunity-management-page__metric-card">
            <span className="opportunity-management-page__metric-label">Закрытые:</span>
            <strong className="opportunity-management-page__metric-value">{metrics.closed}</strong>
          </article>
        </section>

        <section className="opportunity-management-page__toolbar" aria-label="Управление списком возможностей">
          <label className="opportunity-management-page__search header__search" aria-label="Поиск по возможностям">
            <Input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Поиск"
              className="input--sm opportunity-management-page__search-input"
            />
          </label>
          <div className="opportunity-management-page__toolbar-actions">
            <div ref={statusMenuRef} className="opportunity-management-page__filters">
              <button
                type="button"
                className="opportunity-management-page__icon-button opportunity-management-page__icon-button--filter"
                aria-label="Фильтрация"
                aria-expanded={isStatusMenuOpen}
                onClick={() => {
                  setIsSortMenuOpen(false);
                  setIsStatusMenuOpen((current) => !current);
                }}
              />

              {isStatusMenuOpen ? (
                <div className="opportunity-management-page__filters-popover">
                  <div className="opportunity-management-page__filters-section">
                    <div className="opportunity-management-page__filters-head">
                      <h2 className="opportunity-management-page__filters-title">Фильтры</h2>
                      <button
                        type="button"
                        className="opportunity-management-page__filters-reset"
                        onClick={resetFilters}
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="opportunity-management-page__filters-section">
                    <div className="opportunity-management-page__filters-head">
                      <h3 className="opportunity-management-page__filters-group-title">По статусам</h3>
                      <button
                        type="button"
                        className="opportunity-management-page__filters-reset"
                        onClick={() => setSelectedStatuses(["all"])}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="opportunity-management-page__filters-options opportunity-management-page__filters-options--checkboxes">
                      {statusFilterItems.map((item) => (
                        <label key={item.value} className="opportunity-management-page__filter-option">
                          <Checkbox
                            checked={selectedStatuses.includes(item.value)}
                            onChange={() => toggleStatusFilter(item.value)}
                            variant="primary"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="opportunity-management-page__filters-footer">
                    <Button type="button" variant="primary" size="sm" fullWidth onClick={applyFilters}>
                      Показать результаты
                    </Button>
                    <Button type="button" variant="primary-outline" size="sm" fullWidth onClick={resetFilters}>
                      Сбросить фильтры
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div ref={sortMenuRef} className="opportunity-management-page__sorting">
              <button
                type="button"
                className="opportunity-management-page__icon-button opportunity-management-page__icon-button--sorting"
                aria-label="Сортировка"
                aria-expanded={isSortMenuOpen}
                onClick={() => {
                  setIsStatusMenuOpen(false);
                  setIsSortMenuOpen((current) => !current);
                }}
              >
                <span
                  aria-hidden="true"
                  className={
                    appliedSortDirection === "desc"
                      ? "opportunity-management-page__icon opportunity-management-page__icon--descending"
                      : "opportunity-management-page__icon opportunity-management-page__icon--ascending"
                  }
                />
              </button>

              {isSortMenuOpen ? (
                <div className="opportunity-management-page__sorting-popover">
                  <div className="opportunity-management-page__filters-section">
                    <div className="opportunity-management-page__filters-head">
                      <h2 className="opportunity-management-page__filters-title">Сортировка</h2>
                      <button
                        type="button"
                        className="opportunity-management-page__filters-reset"
                        onClick={resetSorting}
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="opportunity-management-page__filters-section">
                    <div className="opportunity-management-page__filters-options opportunity-management-page__filters-options--radio">
                      {sortItems.map((item) => (
                        <label key={item.value} className="opportunity-management-page__filter-option">
                          <Radio
                            checked={selectedSortField === item.value}
                            onChange={() => setSelectedSortField(item.value)}
                            variant="primary"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="opportunity-management-page__filters-section">
                    <div className="opportunity-management-page__filters-options opportunity-management-page__filters-options--radio">
                      <label className="opportunity-management-page__filter-option">
                        <Radio
                          checked={selectedSortDirection === "desc"}
                          onChange={() => setSelectedSortDirection("desc")}
                          variant="primary"
                        />
                        <span>{selectedSortField === "responses" ? "Сначала больше" : "Сначала новые"}</span>
                      </label>
                      <label className="opportunity-management-page__filter-option">
                        <Radio
                          checked={selectedSortDirection === "asc"}
                          onChange={() => setSelectedSortDirection("asc")}
                          variant="primary"
                        />
                        <span>{selectedSortField === "responses" ? "Сначала меньше" : "Сначала старые"}</span>
                      </label>
                    </div>
                  </div>

                  <div className="opportunity-management-page__filters-footer">
                    <Button type="button" variant="primary" size="sm" fullWidth onClick={applySorting}>
                      Показать результаты
                    </Button>
                    <Button type="button" variant="primary-outline" size="sm" fullWidth onClick={resetSorting}>
                      Сбросить сортировку
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              className="opportunity-management-page__create-button"
              onClick={() => setIsCreateOpportunityModalOpen(true)}
            >
              Создать возможность
            </Button>
          </div>
        </section>

        <section className="opportunity-management-page__grid" aria-label="Карточки возможностей">
          {visibleItems.map((item) => (
            <article key={item.id} className="opportunity-management-page__card">
              <div className="opportunity-management-page__card-body">
                <Status className="opportunity-management-page__status" variant={resolveStatusVariant(item.status)}>
                  {resolveStatusLabel(item.status)}
                </Status>

                <div className="opportunity-management-page__title-group">
                  <h2 className="opportunity-management-page__card-title">{item.title}</h2>
                  <p className="opportunity-management-page__card-kind">{item.kind}</p>
                </div>

                <div className="opportunity-management-page__summary">
                  <p className="opportunity-management-page__salary">{item.salaryLabel}</p>
                  <p className="opportunity-management-page__location">{item.locationLabel}</p>
                </div>

                <div className="opportunity-management-page__tags">
                  {item.tags.map((tag, tagIndex) => (
                    <Badge key={`${item.id}-${tag}-${tagIndex}`} variant="primary">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="opportunity-management-page__details">
                  <p className="opportunity-management-page__detail-text">Уровень: {item.levelLabel}</p>
                  <p className="opportunity-management-page__detail-text">Занятость: {item.employmentLabel}</p>
                </div>

                <p className="opportunity-management-page__description">{item.description}</p>

                <div className="opportunity-management-page__footer">
                  <div className="opportunity-management-page__meta">
                    {item.responsesCount !== undefined ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Откликов:</span>
                        <span className="opportunity-management-page__meta-value">{item.responsesCount}</span>
                      </p>
                    ) : null}

                    {item.publishedAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Опубликовано:</span>
                        <span className="opportunity-management-page__meta-value">{item.publishedAtLabel}</span>
                      </p>
                    ) : null}

                    {item.activeUntilLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Активно до:</span>
                        <span className="opportunity-management-page__meta-value">{item.activeUntilLabel}</span>
                      </p>
                    ) : null}

                    {item.plannedPublishAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Дата публикации:</span>
                        <span className="opportunity-management-page__meta-value">{item.plannedPublishAtLabel}</span>
                      </p>
                    ) : null}

                    {item.plannedCloseAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Дата закрытия:</span>
                        <span className="opportunity-management-page__meta-value">{item.plannedCloseAtLabel}</span>
                      </p>
                    ) : null}

                    {item.closedAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Закрыто:</span>
                        <span className="opportunity-management-page__meta-value">{item.closedAtLabel}</span>
                      </p>
                    ) : null}

                    {item.submittedAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Дата отправки:</span>
                        <span className="opportunity-management-page__meta-value">{item.submittedAtLabel}</span>
                      </p>
                    ) : null}

                    {item.moderationComment ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Комментарий:</span>
                        <span className="opportunity-management-page__meta-value">{item.moderationComment}</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="opportunity-management-page__actions">
                    {item.status === "removed" ? (
                      <button
                        type="button"
                        className="opportunity-management-page__action-button"
                        aria-label="Вернуть в публикацию"
                      >
                        <img src={uploadIcon} alt="" aria-hidden="true" className="opportunity-management-page__action-icon" />
                      </button>
                    ) : null}
                    <button type="button" className="opportunity-management-page__action-button" aria-label="Редактировать">
                      <img src={editIcon} alt="" aria-hidden="true" className="opportunity-management-page__action-icon" />
                    </button>
                    <button type="button" className="opportunity-management-page__action-button" aria-label="Удалить">
                      <img src={deleteIcon} alt="" aria-hidden="true" className="opportunity-management-page__action-icon" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>

        <nav className="opportunity-management-page__pagination" aria-label="Пагинация">
          <button
            type="button"
            className="opportunity-management-page__pagination-arrow"
            onClick={() => setPage((currentValue) => Math.max(1, currentValue - 1))}
            disabled={currentPage === 1}
            aria-label="Предыдущая страница"
          >
            <img
              src={arrowIcon}
              alt=""
              aria-hidden="true"
              className="opportunity-management-page__pagination-arrow-icon opportunity-management-page__pagination-arrow-icon--prev"
            />
          </button>
          {paginationItems.map((item, index) =>
            typeof item === "number" ? (
              <button
                key={`${item}-${index}`}
                type="button"
                className={
                  currentPage === item
                    ? "opportunity-management-page__pagination-page opportunity-management-page__pagination-page--active"
                    : "opportunity-management-page__pagination-page"
                }
                onClick={() => setPage(item)}
              >
                {item}
              </button>
            ) : (
              <span key={`${item}-${index}`} className="opportunity-management-page__pagination-ellipsis">
                ...
              </span>
            ),
          )}
          <button
            type="button"
            className="opportunity-management-page__pagination-arrow"
            onClick={() => setPage((currentValue) => Math.min(totalPages, currentValue + 1))}
            disabled={currentPage === totalPages}
            aria-label="Следующая страница"
          >
            <img
              src={arrowIcon}
              alt=""
              aria-hidden="true"
              className="opportunity-management-page__pagination-arrow-icon"
            />
          </button>
        </nav>

      </Container>

      <Modal
        isOpen={isCreateOpportunityModalOpen}
        onClose={closeCreateOpportunityModal}
        title="Создание возможности"
        panelClassName="opportunity-management-page__modal-panel"
        titleAccentColor="var(--color-primary)"
        closeOnBackdrop={false}
      >
        <div className="opportunity-management-page__modal-form">
          <div className="opportunity-management-page__modal-field">
            <span className="opportunity-management-page__modal-label">
              Тип <span className="opportunity-management-page__modal-required">*</span>
            </span>
            <div className="opportunity-management-page__modal-radio-group">
              {opportunityTypeOptions.map((item) => (
                <label key={item.value} className="opportunity-management-page__modal-radio-option">
                  <Radio
                    checked={createOpportunityType === item.value}
                    onChange={() => setCreateOpportunityType(item.value)}
                    variant="primary"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="opportunity-management-page__modal-field">
            <span className="opportunity-management-page__modal-label">
              Название <span className="opportunity-management-page__modal-required">*</span>
            </span>
            <Input
              value={createOpportunityTitle}
              onChange={(event) => setCreateOpportunityTitle(event.target.value)}
              placeholder="Junior Backend-разработчик (Python, FastAPI)"
              className="input--sm opportunity-management-page__modal-input"
            />
          </label>

          <label className="opportunity-management-page__modal-field">
            <span className="opportunity-management-page__modal-label">
              Описание с требованиями, обязанностями и условиями
              {" "}
              <span className="opportunity-management-page__modal-required">*</span>
            </span>
            <textarea
              value={createOpportunityDescription}
              onChange={(event) => setCreateOpportunityDescription(event.target.value)}
              placeholder="Разработка и поддержка backend-сервиса на Python (FastAPI), работа с API и базой данных"
              className="opportunity-management-page__modal-textarea"
              rows={4}
            />
          </label>

          <label className="opportunity-management-page__modal-field">
            <span className="opportunity-management-page__modal-label">
              Работодатель <span className="opportunity-management-page__modal-required">*</span>
            </span>
            <Input
              value={currentEmployerName}
              placeholder="*автозаполнение из профиля*"
              className="input--sm opportunity-management-page__modal-input"
              disabled
            />
          </label>

          <div ref={addressFieldRef} className="opportunity-management-page__modal-field">
            <span className="opportunity-management-page__modal-label">
              Адрес <span className="opportunity-management-page__modal-required">*</span>
            </span>
            <div className="opportunity-management-page__modal-address-head">
              <Input
                ref={addressInputRef}
                value={createOpportunityAddress}
                onFocus={() => setIsAddressSuggestionsOpen(true)}
                onBlur={() => {
                  if (!createOpportunityAddress.trim()) {
                    setIsAddressSuggestionsOpen(false);
                  }
                }}
                onChange={(event) => {
                  setCreateOpportunityAddress(event.target.value);
                  setIsAddressSuggestionsOpen(true);
                }}
                placeholder="Начните вводить полный адрес"
                className="input--sm opportunity-management-page__modal-input"
              />
            </div>

            {isAddressSuggestionsOpen ? (
              <div className="opportunity-management-page__modal-address-dropdown">
                {isAddressSuggestionsLoading ? (
                  <div className="opportunity-management-page__modal-address-empty">Загружаем адреса...</div>
                ) : createOpportunityAddressSuggestions.length > 0 ? (
                  createOpportunityAddressSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="opportunity-management-page__modal-address-option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleAddressSuggestionSelect(item)}
                    >
                      <span className="opportunity-management-page__modal-address-option-title">
                        {item.fullAddress}
                      </span>
                      {item.subtitle ? (
                        <span className="opportunity-management-page__modal-address-option-subtitle">
                          {item.subtitle}
                        </span>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <div className="opportunity-management-page__modal-address-empty">
                    Ничего не найдено. Можно выбрать точку на карте.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {createOpportunityPreviewPoint ? (
            <div
              className={
                isMapExpanded
                  ? "opportunity-management-page__modal-map-preview opportunity-management-page__modal-map-preview--expanded"
                  : "opportunity-management-page__modal-map-preview"
              }
            >
              <div className="opportunity-management-page__modal-map-wrap">
                <button
                  type="button"
                  className="opportunity-management-page__modal-map-expand-button"
                  aria-label={isMapExpanded ? "Свернуть карту" : "Развернуть карту"}
                  onClick={() => setIsMapExpanded((current) => !current)}
                >
                  <span
                    className={
                      isMapExpanded
                        ? "opportunity-management-page__modal-map-expand-icon opportunity-management-page__modal-map-expand-icon--narrow"
                        : "opportunity-management-page__modal-map-expand-icon"
                    }
                    aria-hidden="true"
                  />
                </button>
                <OpportunityLocationMap
                  className="opportunity-management-page__modal-map"
                  point={createOpportunityPreviewPoint}
                  fallbackPoint={selectedCityPoint}
                  interactive={isMapExpanded}
                  centerOnPointChange
                  resizeSignal={isMapExpanded}
                  onPointChange={handlePreviewLocationPointChange}
                />
              </div>
              {isMapExpanded ? null : (
                <p className="opportunity-management-page__modal-map-hint">
                  Чтобы перемещать карту и выбирать точку, сначала разверните её.
                </p>
              )}
            </div>
          ) : null}

          <label className="opportunity-management-page__modal-field">
            <span className="opportunity-management-page__modal-label">
              Зарплата <span className="opportunity-management-page__modal-required">*</span>
            </span>
            <Input
              value={createOpportunitySalary}
              onChange={(event) => setCreateOpportunitySalary(event.target.value)}
              placeholder="Input"
              className="input--sm opportunity-management-page__modal-input"
            />
          </label>

          <div className="opportunity-management-page__modal-field">
            <span className="opportunity-management-page__modal-label">
              Теги <span className="opportunity-management-page__modal-required">*</span>
            </span>
            <Input
              value={createOpportunityTagQuery}
              onChange={(event) => setCreateOpportunityTagQuery(event.target.value)}
              placeholder="Поиск"
              type="search"
              className="input--sm opportunity-management-page__modal-input opportunity-management-page__modal-input--search"
            />
            {filteredTagOptions.length > 0 ? (
              <div className="opportunity-management-page__modal-tag-suggestions">
                {filteredTagOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="opportunity-management-page__modal-tag-chip opportunity-management-page__modal-tag-chip--ghost"
                    onClick={() => {
                      setCreateOpportunityTags((current) => [...current, item]);
                      setCreateOpportunityTagQuery("");
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="opportunity-management-page__modal-tags">
              {createOpportunityTags.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="opportunity-management-page__modal-tag-chip"
                  onClick={() =>
                    setCreateOpportunityTags((current) => current.filter((tag) => tag !== item))
                  }
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="opportunity-management-page__modal-field">
            <span className="opportunity-management-page__modal-label">
              Формат работы <span className="opportunity-management-page__modal-required">*</span>
            </span>
            <div className="opportunity-management-page__modal-radio-group">
              {workFormatOptions.map((item) => (
                <label key={item.value} className="opportunity-management-page__modal-radio-option">
                  <Radio
                    checked={createOpportunityFormat === item.value}
                    onChange={() => setCreateOpportunityFormat(item.value)}
                    variant="primary"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="opportunity-management-page__modal-field">
            <span className="opportunity-management-page__modal-label">Дата (для запланированной публикации)</span>
            <Input
              type="date"
              value={createOpportunityPublishDate}
              onChange={(event) => setCreateOpportunityPublishDate(event.target.value)}
              className="input--sm opportunity-management-page__modal-input"
            />
          </label>

          <div className="opportunity-management-page__modal-note">
            <p className="opportunity-management-page__modal-note-title">Срок публикации вакансии: 30 дней</p>
            <p className="opportunity-management-page__modal-note-text">Отсчёт срока начинается:</p>
            <ul className="opportunity-management-page__modal-note-list">
              <li>С момента одобрения карточки куратором</li>
              <li>После изменения статуса на «Активно»</li>
            </ul>
          </div>

          <div className="opportunity-management-page__modal-actions">
            <Button
              type="button"
              variant="primary-outline"
              size="md"
              className="opportunity-management-page__modal-cancel"
              onClick={closeCreateOpportunityModal}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="opportunity-management-page__modal-submit"
              disabled={!isCreateOpportunityReady}
              onClick={handleCreateOpportunitySubmit}
            >
              Отправить
            </Button>
          </div>
        </div>
      </Modal>

      <Footer theme="employer" />
    </main>
  );
}
