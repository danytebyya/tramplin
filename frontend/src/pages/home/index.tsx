import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import {
  CitySelector,
  CitySelection,
  readSelectedCityCookie,
  removeSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import { getPlatformStatsRequest, listOpportunitiesRequest } from "../../entities/opportunity/api";
import {
  addFavoriteOpportunityRequest,
  FavoriteAuthModal,
  listFavoriteOpportunitiesRequest,
  removeFavoriteOpportunityRequest,
} from "../../features/favorites";
import { subscribeOpportunityWorkflow } from "../../features/opportunity-workflow";
import {
  listMyAppliedOpportunityIdsRequest,
  submitOpportunityApplicationRequest,
  withdrawOpportunityApplicationRequest,
} from "../../features/applications";
import { getEmployerAccessState, meRequest, updatePreferredCityRequest, useAuthStore } from "../../features/auth";
import { ModerationDashboardContent } from "../curator-dashboard";
import { Button, Container } from "../../shared/ui";
import { OpportunityFilters } from "../../widgets/filters";
import { Footer } from "../../widgets/footer";
import {
  buildApplicantProfileMenuItems,
  buildEmployerProfileMenuItems,
  buildModerationProfileMenuItems,
  CuratorHeaderNavigation,
  Header,
} from "../../widgets/header";
import { MapView } from "../../widgets/map-view";
import { OpportunityList } from "../../widgets/opportunity-list";
import type { Opportunity } from "../../entities/opportunity";
import analyticsIcon from "../../assets/icons/analytics.svg";
import backgroundImage from "../../assets/icons/background-hero.jpg";
import databaseIcon from "../../assets/icons/db.svg";
import designIcon from "../../assets/icons/design.svg";
import developmentIcon from "../../assets/icons/development.svg";
import logoPrimary from "../../assets/icons/logo-primary.svg";
import logoSecondary from "../../assets/icons/logo-secondary.svg";
import securityIcon from "../../assets/icons/security.svg";
import "./home.css";

type OpportunityCategoryFilter = "all" | Opportunity["kind"];

const opportunityCategoryLinks: Array<{ value: OpportunityCategoryFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "vacancy", label: "Вакансии" },
  { value: "internship", label: "Стажировки" },
  { value: "event", label: "Мероприятия" },
  { value: "mentorship", label: "Менторские программы" },
];

function resolveOpportunityCategoryFilter(search: string): OpportunityCategoryFilter {
  const category = new URLSearchParams(search).get("category");

  if (
    category === "vacancy" ||
    category === "internship" ||
    category === "event" ||
    category === "mentorship"
  ) {
    return category;
  }

  return "all";
}

function cloneMapSnapshot(source: HTMLElement) {
  const snapshot = source.cloneNode(true) as HTMLElement;
  const sourceCanvases = source.querySelectorAll("canvas");
  const snapshotCanvases = snapshot.querySelectorAll("canvas");

  sourceCanvases.forEach((sourceCanvas, index) => {
    const snapshotCanvas = snapshotCanvases[index];

    if (!(sourceCanvas instanceof HTMLCanvasElement) || !(snapshotCanvas instanceof HTMLCanvasElement)) {
      return;
    }

    const frozenCanvas = document.createElement("canvas");
    frozenCanvas.className = snapshotCanvas.className;
    frozenCanvas.width = sourceCanvas.width;
    frozenCanvas.height = sourceCanvas.height;
    frozenCanvas.style.cssText = snapshotCanvas.style.cssText;

    const context = frozenCanvas.getContext("2d");

    if (context) {
      try {
        context.drawImage(sourceCanvas, 0, 0);
      } catch {
        return;
      }
    }

    snapshotCanvas.replaceWith(frozenCanvas);
  });

  snapshot.setAttribute("aria-hidden", "true");
  snapshot.classList.add("home-page__map-panel-snapshot");

  return snapshot;
}

export function HomePage() {
  const MAP_EXPANDED_TOP_OFFSET = 106;
  const MAP_EXPAND_TRANSITION_MS = 520;
  const DEFAULT_CITY = "Чебоксары";
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [mapExpandMode, setMapExpandMode] = useState<"collapsed" | "expanding" | "expanded" | "collapsing">("collapsed");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? DEFAULT_CITY);
  const [selectedCityViewport, setSelectedCityViewport] = useState<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const [mapPanelFrameStyle, setMapPanelFrameStyle] = useState<CSSProperties | undefined>(undefined);
  const [mapPanelPlaceholderHeight, setMapPanelPlaceholderHeight] = useState<number | null>(null);
  const [isFavoriteAuthModalOpen, setIsFavoriteAuthModalOpen] = useState(false);
  const mapPanelShellRef = useRef<HTMLDivElement | null>(null);
  const mapPanelLiveRef = useRef<HTMLDivElement | null>(null);
  const mapPanelProxyContentRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuCloseTimeoutRef = useRef<number | null>(null);
  const collapsedMapPanelRectRef = useRef<DOMRect | null>(null);
  const expandedFromScrollYRef = useRef(0);
  const pendingRestoreScrollYRef = useRef<number | null>(null);
  const mapTransitionTimeoutRef = useRef<number | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProfileMenuPinned, setIsProfileMenuPinned] = useState(false);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const role = useAuthStore((state) => state.role);
  const roleName = String(role ?? "");
  const selectedCategoryFilter = useMemo(
    () => resolveOpportunityCategoryFilter(location.search),
    [location.search],
  );
  const isJunior = roleName === "junior";
  const isCurator = roleName === "curator";
  const isAdmin = roleName === "admin";
  const isModerationRole = isJunior || isCurator || isAdmin;
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const isMapExpanded = mapExpandMode !== "collapsed";
  const isMapExpandedLayout = mapExpandMode === "expanded";
  const isMapFloating = mapExpandMode !== "collapsed";
  const isMapTransitioning = mapExpandMode === "expanding" || mapExpandMode === "collapsing";
  const isMapCollapsing = mapExpandMode === "collapsing";
  const employerAccess = getEmployerAccessState(role, accessToken);
  const { data: opportunities = [] } = useQuery({
    queryKey: ["opportunities", "feed"],
    queryFn: listOpportunitiesRequest,
    enabled: !isModerationRole,
    staleTime: 5 * 60 * 1000,
  });
  const platformStatsQuery = useQuery({
    queryKey: ["platform", "stats"],
    queryFn: getPlatformStatsRequest,
    enabled: !isModerationRole,
    staleTime: 60 * 1000,
  });
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    enabled: isAuthenticated && !isModerationRole,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const favoriteOpportunitiesQuery = useQuery({
    queryKey: ["favorites", "opportunities"],
    queryFn: listFavoriteOpportunitiesRequest,
    enabled: isAuthenticated && !isModerationRole,
    staleTime: 60 * 1000,
  });
  const myApplicationsQuery = useQuery({
    queryKey: ["applications", "mine", "opportunity-ids"],
    queryFn: listMyAppliedOpportunityIdsRequest,
    enabled: isAuthenticated && roleName === "applicant" && !isModerationRole,
    staleTime: 60 * 1000,
  });
  const updatePreferredCityMutation = useMutation({
    mutationFn: updatePreferredCityRequest,
    onSuccess: (response) => {
      queryClient.setQueryData(["auth", "me"], response);
      removeSelectedCityCookie();
    },
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["applications", "mine", "opportunity-ids"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });
  const favoriteOpportunityIds = favoriteOpportunitiesQuery.data?.data?.items ?? [];
  const appliedOpportunityIds = useMemo(
    () => myApplicationsQuery.data?.data?.opportunity_ids ?? [],
    [myApplicationsQuery.data?.data?.opportunity_ids],
  );
  const opportunityStats = useMemo(() => {
    return opportunities.reduce(
      (accumulator, opportunity) => {
        accumulator.total += 1;

        if (opportunity.kind === "vacancy") {
          accumulator.vacancies += 1;
        }

        if (opportunity.kind === "internship") {
          accumulator.internships += 1;
        }

        if (opportunity.kind === "event") {
          accumulator.events += 1;
        }

        if (opportunity.kind === "mentorship") {
          accumulator.mentorships += 1;
        }

        return accumulator;
      },
      {
        total: 0,
        vacancies: 0,
        internships: 0,
        events: 0,
        mentorships: 0,
      },
    );
  }, [opportunities]);
  const displayedOpportunities = useMemo(() => {
    if (selectedCategoryFilter === "all") {
      return opportunities;
    }

    return opportunities.filter((opportunity) => opportunity.kind === selectedCategoryFilter);
  }, [opportunities, selectedCategoryFilter]);
  const platformCounts = platformStatsQuery.data ?? {
    companiesCount: 0,
    applicantsCount: 0,
    vacanciesCount: opportunityStats.vacancies,
    internshipsCount: opportunityStats.internships,
    eventsCount: opportunityStats.events,
    mentorshipsCount: opportunityStats.mentorships,
  };
  const formatPlatformCount = (value: number) => new Intl.NumberFormat("ru-RU").format(value);
  const applicantSteps = [
    "Зарегистрируйтесь",
    "Найдите возможности",
    "Откликайтесь",
    "Получайте ответы",
    "Стройте карьеру",
  ];
  const employerSteps = [
    "Зарегистрируйте компанию",
    "Создайте карточку возможности",
    "Получайте отклики",
    "Управляйте откликами",
    "Найдите таланты",
  ];
  const mapHighlights = [
    {
      accent: "Нажмите на маркер",
      text: " и вы увидите подробную информацию о возможности",
    },
    {
      accent: "Используйте фильтры,",
      text: "чтобы найти подходящие вакансии",
    },
    {
      accent: "Разверните карту —",
      text: "так проще просматривать вакансии",
    },
  ];
  const directions = [
    { icon: developmentIcon, label: "Разработка" },
    { icon: databaseIcon, label: "Базы данных" },
    { icon: designIcon, label: "Дизайн" },
    { icon: analyticsIcon, label: "Аналитика" },
    { icon: securityIcon, label: "Безопасность" },
  ];
  const platformBenefits = [
    "Проверенные работодатели",
    "Бесплатное пользование",
    "Менторская поддержка",
    "Карьерные мероприятия",
    "Нетворкинг с другими соискателями",
    "Чат с работодателями",
  ];
  const platformStats: Array<{ value: string; label: string; featured?: boolean }> = [
    { value: formatPlatformCount(platformCounts.companiesCount), label: "компаний", featured: true },
    { value: formatPlatformCount(platformCounts.applicantsCount), label: "соискателей", featured: true },
    { value: formatPlatformCount(platformCounts.vacanciesCount), label: "вакансии" },
    { value: formatPlatformCount(platformCounts.internshipsCount), label: "стажировок" },
    { value: formatPlatformCount(platformCounts.eventsCount), label: "мероприятий" },
    { value: formatPlatformCount(platformCounts.mentorshipsCount), label: "менторов" },
  ];
  const landingTheme =
    roleName === "applicant"
      ? "applicant"
      : roleName === "employer"
        ? "employer"
        : roleName === "curator" || roleName === "admin"
          ? "curator"
          : undefined;
  const heroLogo = roleName === "applicant" ? logoSecondary : logoPrimary;

  const getExpandedRect = () => ({
    top: MAP_EXPANDED_TOP_OFFSET,
    left: 0,
    width: window.innerWidth,
    height: Math.max(window.innerHeight - MAP_EXPANDED_TOP_OFFSET, 0),
  });

  const getFloatingFrameStyle = (rect: Pick<DOMRect, "top" | "left" | "width" | "height">, borderRadius: string): CSSProperties => {
    return {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius,
    };
  };

  const syncMapProxySnapshot = () => {
    const source = mapPanelLiveRef.current;
    const proxyContent = mapPanelProxyContentRef.current;

    if (!source || !proxyContent) {
      return;
    }

    proxyContent.replaceChildren(cloneMapSnapshot(source));
  };

  const clearMapTransitionTimeout = () => {
    if (mapTransitionTimeoutRef.current !== null) {
      window.clearTimeout(mapTransitionTimeoutRef.current);
      mapTransitionTimeoutRef.current = null;
    }
  };

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

  useEffect(() => {
    return subscribeOpportunityWorkflow(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] });
    });
  }, [queryClient]);

  const finishMapTransition = (nextMode: "collapsed" | "expanded") => {
    setMapExpandMode(nextMode);
    clearMapTransitionTimeout();

    if (nextMode === "collapsed") {
      setMapPanelFrameStyle(undefined);
      setMapPanelPlaceholderHeight(null);
      collapsedMapPanelRectRef.current = null;
      mapPanelProxyContentRef.current?.replaceChildren();
      return;
    }

    setMapPanelFrameStyle(undefined);
    mapPanelProxyContentRef.current?.replaceChildren();
  };

  const handleToggleMapExpand = () => {
    const panelShell = mapPanelShellRef.current;
    const panelLive = mapPanelLiveRef.current;

    if (!panelShell || !panelLive || mapExpandMode === "expanding" || mapExpandMode === "collapsing") {
      return;
    }

    const shellRect = panelShell.getBoundingClientRect();

    if (mapExpandMode === "collapsed") {
      expandedFromScrollYRef.current = window.scrollY;
      collapsedMapPanelRectRef.current = shellRect;
      setMapPanelPlaceholderHeight(shellRect.height);
      syncMapProxySnapshot();
      setMapPanelFrameStyle(getFloatingFrameStyle(shellRect, "8px"));
      setMapExpandMode("expanding");
      clearMapTransitionTimeout();

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setMapPanelFrameStyle(getFloatingFrameStyle(getExpandedRect(), "0px"));
        });
      });

      mapTransitionTimeoutRef.current = window.setTimeout(() => {
        finishMapTransition("expanded");
      }, MAP_EXPAND_TRANSITION_MS);

      return;
    }

    const collapsedRect = collapsedMapPanelRectRef.current ?? shellRect;
    const liveRect = panelLive.getBoundingClientRect();

    syncMapProxySnapshot();
    setMapPanelPlaceholderHeight(collapsedRect.height);
    setMapPanelFrameStyle(getFloatingFrameStyle(liveRect, "0px"));
    setMapExpandMode("collapsing");
    pendingRestoreScrollYRef.current = expandedFromScrollYRef.current;
    clearMapTransitionTimeout();

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setMapPanelFrameStyle(getFloatingFrameStyle(collapsedRect, "8px"));
      });
    });

    mapTransitionTimeoutRef.current = window.setTimeout(() => {
      finishMapTransition("collapsed");
    }, MAP_EXPAND_TRANSITION_MS);
  };

  const profileMenuItems = isModerationRole
    ? buildModerationProfileMenuItems()
    : roleName === "employer"
      ? buildEmployerProfileMenuItems(navigate, employerAccess)
      : buildApplicantProfileMenuItems(navigate);
  const homePageClassName = [
    "home-page",
    roleName === "applicant" ? "home-page--applicant" : "",
    roleName === "employer" ? "home-page--employer" : "",
    roleName === "curator" ? "home-page--curator" : "",
    roleName === "admin" ? "home-page--admin" : "",
    isMapFloating ? "home-page--map-floating" : "",
    isMapExpandedLayout ? "home-page--map-expanded" : "",
    isMapCollapsing ? "home-page--map-collapsing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const explorerClassName = isMapExpandedLayout
    ? "home-page__explorer home-page__explorer--expanded"
    : "home-page__explorer";

  useEffect(() => {
    document.body.classList.toggle("home-page--map-floating", isMapFloating);
    document.body.classList.toggle("home-page--map-expanded", isMapExpandedLayout);
    document.body.classList.toggle("home-page--map-collapsing", isMapCollapsing);

    return () => {
      document.body.classList.remove("home-page--map-floating");
      document.body.classList.remove("home-page--map-expanded");
      document.body.classList.remove("home-page--map-collapsing");
    };
  }, [isMapCollapsing, isMapExpandedLayout, isMapFloating]);

  useEffect(() => {
    if (!isMapExpanded || mapExpandMode === "expanded") {
      return;
    }

    const syncExpandedFrame = () => {
      setMapPanelFrameStyle((currentStyle) => {
        if (!currentStyle || !collapsedMapPanelRectRef.current) {
          return currentStyle;
        }

        return mapExpandMode === "expanding"
          ? getFloatingFrameStyle(getExpandedRect(), "0px")
          : getFloatingFrameStyle(collapsedMapPanelRectRef.current, "8px");
      });
    };

    window.addEventListener("resize", syncExpandedFrame);

    return () => {
      window.removeEventListener("resize", syncExpandedFrame);
    };
  }, [isMapExpanded, mapExpandMode]);

  useEffect(() => () => {
    clearMapTransitionTimeout();
    clearProfileMenuCloseTimeout();
  }, []);

  useEffect(() => {
    if (mapExpandMode !== "collapsed" || pendingRestoreScrollYRef.current === null) {
      return;
    }

    const restoreScrollY = pendingRestoreScrollYRef.current;
    pendingRestoreScrollYRef.current = null;

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: Math.max(restoreScrollY, 0),
        behavior: "auto",
      });
    });
  }, [mapExpandMode]);

  useEffect(() => {
    if (selectedOpportunityId && !displayedOpportunities.some((opportunity) => opportunity.id === selectedOpportunityId)) {
      setSelectedOpportunityId(null);
    }
  }, [displayedOpportunities, selectedOpportunityId]);

  useEffect(() => {
    if (location.hash !== "#dashboard" || !isModerationRole) {
      return;
    }

    const target = document.getElementById("dashboard");
    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [isModerationRole, location.hash]);

  useEffect(() => {
    if (isModerationRole || location.hash !== "#opportunity-map") {
      return;
    }

    const target = document.getElementById("opportunity-map");
    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [isModerationRole, location.hash, selectedCategoryFilter]);

  useEffect(() => {
    const preferredCity = currentUserQuery.data?.data?.user?.preferred_city?.trim();

    if (!isAuthenticated || !preferredCity) {
      return;
    }

    setSelectedCity(preferredCity);
    setSelectedCityViewport(null);
    removeSelectedCityCookie();
  }, [currentUserQuery.data, isAuthenticated]);

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

  const handleCityChange = (city: string | CitySelection) => {
    const nextCity = typeof city === "string" ? city : city.name;
    const nextViewport = typeof city === "string" ? null : city.viewport ?? null;

    setSelectedCity(nextCity);
    setSelectedCityViewport(nextViewport);

    if (!isAuthenticated) {
      writeSelectedCityCookie(nextCity);
      return;
    }

    updatePreferredCityMutation.mutate(nextCity);
  };

  const handleToggleFavorite = (opportunityId: string) => {
    if (!isAuthenticated) {
      setIsFavoriteAuthModalOpen(true);
      return;
    }

    favoriteOpportunityMutation.mutate({
      opportunityId,
      shouldFavorite: !favoriteOpportunityIds.includes(opportunityId),
    });
  };

  const handleApplyOpportunity = (opportunityId: string) => {
    if (!isAuthenticated) {
      setIsFavoriteAuthModalOpen(true);
      return;
    }

    if (roleName === "employer" || roleName === "curator" || roleName === "admin") {
      return;
    }

    if (submitApplicationMutation.isPending) {
      return;
    }

    submitApplicationMutation.mutate({
      opportunityId,
      shouldWithdraw: appliedOpportunityIds.includes(opportunityId),
    });
  };

  const handleWriteToEmployer = (opportunity: Opportunity) => {
    navigate(`/networking?employerId=${encodeURIComponent(opportunity.employerId)}`);
  };
  const handleFindOpportunity = () => {
    if (!isAuthenticated) {
      navigate("/register?role=applicant");
      return;
    }

    const filtersElement = document.querySelector(".opportunity-filters");

    if (!filtersElement) {
      document.getElementById("opportunity-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const top = filtersElement.getBoundingClientRect().top + window.scrollY - 10;
    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  };
  const handleCreateOpportunity = () => {
    if (!isAuthenticated) {
      navigate("/register?role=employer");
      return;
    }

    navigate("/employer/opportunities");
  };

  const categoryNavigation = (
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
            className={
              selectedCategoryFilter === item.value
                ? "header__category-link active"
                : "header__category-link"
            }
            aria-current={selectedCategoryFilter === item.value ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <CitySelector value={selectedCity} onChange={handleCityChange} />
    </>
  );

  return (
    <main className={homePageClassName}>
      <Header
        containerClassName="home-page__container"
        profileMenuItems={profileMenuItems}
        theme={landingTheme}
        variant={isModerationRole ? "default" : "landing"}
        city={selectedCity}
        onCityChange={handleCityChange}
        isAuthenticated={isAuthenticated}
        topNavigation={
          isModerationRole ? null : (
            <nav className="header__nav" aria-label="Основная навигация">
              <NavLink to="/" end className="header__nav-link">
                Главная
              </NavLink>
            </nav>
          )
        }
        guestActions={
          <>
            <Button
              type="button"
              variant="primary-outline"
              size="md"
              className="header__action-button header__action-button--login"
              onClick={() => navigate("/login")}
            >
              Вход
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="header__action-button header__action-button--register"
              onClick={() => navigate("/register")}
            >
              Регистрация
            </Button>
          </>
        }
        bottomContent={
          isModerationRole ? (
            <CuratorHeaderNavigation isAdmin={isAdmin} currentPage="dashboard" />
          ) : (
            categoryNavigation
          )
        }
      />

      {isModerationRole ? (
        <ModerationDashboardContent footerTheme={isAdmin ? "admin" : "curator"} />
      ) : null}

      {isModerationRole ? null : (
        <>
          <section className="home-page__hero">
            <Container className="home-page__container home-page__hero-container">
              <section className="home-page__hero-block">
                <div className="home-page__hero-copy">
                  <img
                    src={backgroundImage}
                    alt=""
                    aria-hidden="true"
                    className="home-page__hero-background"
                    loading="eager"
                    decoding="async"
                  />
                  <div className="home-page__hero-copy-content">
                    <div className="home-page__hero-panel">
                      <img src={heroLogo} alt="Трамплин" className="home-page__hero-logo" />
                      <div className="home-page__hero-heading">
                        <h1 className="home-page__title">Ваш старт в IT-карьере</h1>
                      </div>
                      <div className="home-page__hero-description">
                        <p className="home-page__text">Платформа для студентов, выпускников и работодателей</p>
                      </div>
                    </div>
                    <div className="home-page__hero-actions">
                      <Button type="button" variant={roleName === "applicant" ? "secondary" : "primary"} onClick={handleFindOpportunity}>
                        Найти возможность
                      </Button>
                      <Button
                        type="button"
                        variant="primary-outline"
                        className="home-page__hero-button-login"
                        onClick={handleCreateOpportunity}
                      >
                        Создать возможность
                      </Button>
                    </div>
                    <div className="home-page__hero-stats" aria-label="Статистика платформы">
                      <article className="home-page__stat-card">
                        <span className="home-page__stat-value">{opportunityStats.vacancies}</span>
                        <span className="home-page__stat-label">вакансий</span>
                      </article>
                      <article className="home-page__stat-card">
                        <span className="home-page__stat-value">{opportunityStats.internships}</span>
                        <span className="home-page__stat-label">стажировок</span>
                      </article>
                      <article className="home-page__stat-card">
                        <span className="home-page__stat-value">{opportunityStats.events}</span>
                        <span className="home-page__stat-label">мероприятий</span>
                      </article>
                      <article className="home-page__stat-card">
                        <span className="home-page__stat-value">{opportunityStats.mentorships}</span>
                        <span className="home-page__stat-label">менторских программ</span>
                      </article>
                    </div>
                  </div>
                </div>
              </section>
            </Container>
          </section>

          <section className="home-page__content-sections">
            <Container className="home-page__container home-page__content-sections-container">
              <div className="home-page__journey-section" id="about">
                <div className="home-page__section-heading">
                  <h2 className="home-page__section-title"><span className="home-page__section-title-accent">Как</span> это работает?</h2>
                </div>
                <div className="home-page__journey-grid">
                  <article className="home-page__journey-card">
                    <h3 className="home-page__journey-title">Для <span className="home-page__journey-title-accent">соискателей</span></h3>
                    <ol className="home-page__journey-list">
                      {applicantSteps.map((step, index) => (
                        <li key={step} className="home-page__journey-item">
                          <span className="home-page__journey-step">{index + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </article>
                  <article className="home-page__journey-card">
                    <h3 className="home-page__journey-title">Для <span className="home-page__journey-title-accent">работодателей</span></h3>
                    <ol className="home-page__journey-list">
                      {employerSteps.map((step, index) => (
                        <li key={step} className="home-page__journey-item">
                          <span className="home-page__journey-step">{index + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </article>
                </div>
              </div>

              <div className="home-page__map-section" id="opportunity-map">
                <div className="home-page__map-section-head">
                  <div className="home-page__section-heading home-page__section-heading--compact">
                    <h2 className="home-page__section-title"><span className="home-page__section-title-accent">Карта</span> возможностей</h2>
                    <div className="home-page__section-text-block">
                      <p className="home-page__section-text">
                        IT-карьера <span className="home-page__section-text-accent">не привязана</span> к месту
                      </p>
                      <p className="home-page__section-subtext">
                        Смотрите вакансии, стажировки, мероприятия и менторские программы на карте России.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="home-page__map-shell">
                  <div className={explorerClassName}>
                    <OpportunityFilters viewMode={viewMode} isMapExpanded={isMapExpandedLayout} onViewModeChange={setViewMode} />

                    <div
                      className={
                        viewMode === "list"
                          ? "home-page__explorer-content home-page__explorer-content--list"
                          : "home-page__explorer-content"
                      }
                    >
                      <div
                        className={
                          viewMode === "map"
                            ? [
                                "home-page__explorer-panel",
                                "home-page__explorer-panel--active",
                                isMapFloating ? "home-page__explorer-panel--map-floating" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")
                            : "home-page__explorer-panel home-page__explorer-panel--hidden"
                        }
                        ref={viewMode === "map" ? mapPanelShellRef : undefined}
                        style={
                          viewMode === "map" && isMapFloating && mapPanelPlaceholderHeight !== null
                            ? { minHeight: `${mapPanelPlaceholderHeight}px` }
                            : undefined
                        }
                        aria-hidden={viewMode !== "map"}
                      >
                        <div
                          className={
                            isMapFloating
                              ? `home-page__map-panel-overlay home-page__map-panel-overlay--${mapExpandMode}`
                              : "home-page__map-panel-overlay"
                          }
                        >
                          <div
                            ref={mapPanelLiveRef}
                            className={
                              isMapTransitioning
                                ? "home-page__map-panel-live home-page__map-panel-live--hidden"
                                : "home-page__map-panel-live"
                            }
                          >
                            <MapView
                              opportunities={displayedOpportunities}
                              favoriteOpportunityIds={favoriteOpportunityIds}
                              appliedOpportunityIds={appliedOpportunityIds}
                              selectedOpportunityId={selectedOpportunityId}
                              selectedCity={selectedCity}
                              selectedCityViewport={selectedCityViewport}
                              isExpanded={isMapExpanded}
                              isTransitioning={isMapTransitioning}
                              roleName={roleName}
                              onSelectOpportunity={setSelectedOpportunityId}
                              onToggleFavorite={handleToggleFavorite}
                              onSelectCity={handleCityChange}
                              onCloseDetails={() => setSelectedOpportunityId(null)}
                              onToggleExpand={handleToggleMapExpand}
                              onApply={handleApplyOpportunity}
                            />
                          </div>
                        </div>
                      </div>
                      <div
                        className={
                          viewMode === "list"
                            ? "home-page__explorer-panel home-page__explorer-panel--active"
                            : "home-page__explorer-panel home-page__explorer-panel--hidden"
                        }
                        aria-hidden={viewMode !== "list"}
                      >
                        <OpportunityList
                          opportunities={displayedOpportunities}
                          favoriteOpportunityIds={favoriteOpportunityIds}
                          appliedOpportunityIds={appliedOpportunityIds}
                          roleName={roleName}
                          onToggleFavorite={handleToggleFavorite}
                          onApply={handleApplyOpportunity}
                          onWrite={handleWriteToEmployer}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="home-page__highlight-grid">
                  {mapHighlights.map((highlight) => (
                    <article key={highlight.accent} className="home-page__highlight-card">
                      <p className="home-page__highlight-text">
                        <span className="home-page__highlight-accent">{highlight.accent}</span>
                        {highlight.text}
                      </p>
                    </article>
                  ))}
                </div>
              </div>

              <section className="home-page__directions-section">
                <div className="home-page__section-heading home-page__section-heading--compact">
                  <h2 className="home-page__section-title"><span className="home-page__section-title-accent">Популярные</span> направления</h2>
                </div>
                <div className="home-page__directions-grid">
                  {directions.map((direction) => (
                    <article key={direction.label} className="home-page__direction-card">
                      <span
                        aria-hidden="true"
                        className="home-page__direction-icon"
                        style={{ "--home-direction-icon": `url("${direction.icon}")` } as CSSProperties}
                      />
                      <h3 className="home-page__direction-title">{direction.label}</h3>
                    </article>
                  ))}
                </div>
              </section>

              <section className="home-page__benefits-section">
                <div className="home-page__section-heading home-page__section-heading--compact">
                  <h2 className="home-page__section-title"><span className="home-page__section-title-accent">Преимущества</span> нашей платформы</h2>
                </div>
                <ul className="home-page__benefits-list">
                  {platformBenefits.map((benefit) => (
                    <li key={benefit} className="home-page__benefit-item">{benefit}</li>
                  ))}
                </ul>
              </section>

              <section className="home-page__numbers-section">
                <div className="home-page__section-heading home-page__section-heading--compact">
                  <h2 className="home-page__section-title">Трамплин <span className="home-page__section-title-accent">в цифрах</span></h2>
                </div>
                <div className="home-page__numbers-grid">
                  {platformStats.map((stat) => (
                    <article
                      key={stat.label}
                      className={
                        stat.featured
                          ? "home-page__number-card home-page__number-card--featured"
                          : "home-page__number-card"
                      }
                    >
                      <span className="home-page__number-value">{stat.value}</span>
                      <span className="home-page__number-label">{stat.label}</span>
                    </article>
                  ))}
                </div>
              </section>

              {isAuthenticated ? null : (
                <section className="home-page__cta-section">
                  <div className="home-page__section-heading home-page__section-heading--compact">
                    <h2 className="home-page__section-title">Ваш <span className="home-page__section-title-accent">старт</span> в IT-карьере и найме</h2>
                    <div className="home-page__section-heading-note">
                      <p className="home-page__section-subtext">Выберите Вашу <span className="home-page__section-title-accent">роль</span></p>
                    </div>
                  </div>
                  <div className="home-page__cta-grid">
                    <article className="home-page__cta-card">
                      <h3 className="home-page__cta-title">Я ищу <span className="home-page__section-title-accent">работу</span></h3>
                      <p className="home-page__cta-text">
                        Найдите вакансию, стажировку или менторскую программу и постройте карьеру в IT
                      </p>
                      <div className="home-page__cta-actions">
                        <Button type="button" variant="primary" fullWidth onClick={() => navigate("/register?role=applicant")}>
                          Регистрация соискателя
                        </Button>
                        <Button type="button" variant="primary-outline" fullWidth onClick={() => navigate("/login")}>
                          Войти
                        </Button>
                      </div>
                    </article>

                    <article className="home-page__cta-card">
                      <h3 className="home-page__cta-title">Я ищу <span className="home-page__section-title-accent">сотрудников</span></h3>
                      <p className="home-page__cta-text">
                        Опубликуйте возможность и найдите лучших кандидатов для Вашей команды
                      </p>
                      <div className="home-page__cta-actions">
                        <Button type="button" variant="primary" fullWidth onClick={() => navigate("/register?role=employer")}>
                          Регистрация работодателя
                        </Button>
                        <Button type="button" variant="primary-outline" fullWidth onClick={() => navigate("/login")}>
                          Войти
                        </Button>
                      </div>
                    </article>
                  </div>
                </section>
              )}
            </Container>
          </section>

          <div
            className={
              isMapTransitioning
                ? `home-page__map-panel-proxy home-page__map-panel-proxy--${mapExpandMode}`
                : "home-page__map-panel-proxy home-page__map-panel-proxy--hidden"
            }
            style={mapPanelFrameStyle}
          >
            <div ref={mapPanelProxyContentRef} className="home-page__map-panel-proxy-content" />
          </div>
        </>
      )}

      <FavoriteAuthModal
        isOpen={isFavoriteAuthModalOpen}
        onClose={() => setIsFavoriteAuthModalOpen(false)}
      />

      <Footer
        theme={
          roleName === "applicant" ||
          roleName === "employer" ||
          roleName === "curator" ||
          roleName === "admin"
            ? roleName
            : "guest"
        }
      />
    </main>
  );
}
