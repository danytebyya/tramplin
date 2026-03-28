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
import { listOpportunitiesRequest } from "../../entities/opportunity/api";
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
} from "../../features/applications";
import {
  meRequest,
  performLogout,
  updatePreferredCityRequest,
  useAuthStore,
} from "../../features/auth";
import { ModerationDashboardContent } from "../curator-dashboard";
import { Button, Container, Input } from "../../shared/ui";
import { OpportunityFilters } from "../../widgets/filters";
import { Footer } from "../../widgets/footer";
import { buildEmployerProfileMenuItems, buildModerationProfileMenuItems, CuratorHeaderNavigation, Header } from "../../widgets/header";
import { MapView } from "../../widgets/map-view";
import { OpportunityList } from "../../widgets/opportunity-list";
import "./home.css";

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
  const { data: opportunities = [] } = useQuery({
    queryKey: ["opportunities", "feed"],
    queryFn: listOpportunitiesRequest,
    enabled: !isModerationRole,
    staleTime: 5 * 60 * 1000,
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
    mutationFn: submitOpportunityApplicationRequest,
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

  const handleLogout = () => {
    void performLogout({
      beforeRedirect: () => {
        setIsProfileMenuPinned(false);
        setIsProfileMenuOpen(false);
      },
    });
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
      ? buildEmployerProfileMenuItems(navigate)
      : [
          { label: "Профиль", isDanger: false },
          { label: "Мои отклики", isDanger: false },
          { label: "Избранное", isDanger: false },
          { label: "Нетворкинг", isDanger: false },
          { label: "Настройки", isDanger: false, onClick: () => navigate("/settings") },
          { label: "Выход", isDanger: true, onClick: handleLogout },
        ];
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
    if (selectedOpportunityId && !opportunities.some((opportunity) => opportunity.id === selectedOpportunityId)) {
      setSelectedOpportunityId(null);
    }
  }, [opportunities, selectedOpportunityId]);

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

    if (appliedOpportunityIds.includes(opportunityId) || submitApplicationMutation.isPending) {
      return;
    }

    submitApplicationMutation.mutate(opportunityId);
  };

  return (
    <main className={homePageClassName}>
      <Header
        containerClassName="home-page__container"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
        isAuthenticated={isAuthenticated}
        topNavigation={
          isModerationRole ? null : (
            <nav className="header__nav" aria-label="Основная навигация">
              <NavLink to="/" end className="header__nav-link">
                Главная
              </NavLink>
              <a href="#about" className="header__nav-link">
                О проекте
              </a>
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
            <>
              <nav className="header__categories" aria-label="Категории">
                <a href="#vacancies" className="header__category-link">
                  Вакансии
                </a>
                <a href="#internships" className="header__category-link">
                  Стажировки
                </a>
                <a href="#events" className="header__category-link">
                  Мероприятия
                </a>
                <a href="#mentorship" className="header__category-link">
                  Менторство
                </a>
              </nav>

              <CitySelector value={selectedCity} onChange={handleCityChange} />
            </>
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
                          opportunities={opportunities}
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
                      opportunities={opportunities}
                      favoriteOpportunityIds={favoriteOpportunityIds}
                      appliedOpportunityIds={appliedOpportunityIds}
                      roleName={roleName}
                      onToggleFavorite={handleToggleFavorite}
                      onApply={handleApplyOpportunity}
                    />
                  </div>
                </div>
              </div>
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
