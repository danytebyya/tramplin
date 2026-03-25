import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";

import maxIcon from "../../assets/auth/max.png";
import vkIcon from "../../assets/auth/vk.png";
import profileIcon from "../../assets/icons/profile.svg";
import { CitySelector } from "../../features/city-selector";
import { listOpportunitiesRequest } from "../../entities/opportunity/api";
import { clearPersistedAuthSession, useAuthStore } from "../../features/auth";
import { NotificationMenu } from "../../features/notifications";
import { Button, Container, Input } from "../../shared/ui";
import { OpportunityFilters } from "../../widgets/filters";
import "../../widgets/header/header.css";
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
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [mapExpandMode, setMapExpandMode] = useState<"collapsed" | "expanding" | "expanded" | "collapsing">("collapsed");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState("Чебоксары");
  const [mapPanelFrameStyle, setMapPanelFrameStyle] = useState<CSSProperties | undefined>(undefined);
  const [mapPanelPlaceholderHeight, setMapPanelPlaceholderHeight] = useState<number | null>(null);
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
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const isMapExpanded = mapExpandMode !== "collapsed";
  const isMapExpandedLayout = mapExpandMode === "expanded";
  const isMapFloating = mapExpandMode !== "collapsed";
  const isMapTransitioning = mapExpandMode === "expanding" || mapExpandMode === "collapsing";
  const isMapCollapsing = mapExpandMode === "collapsing";
  const { data: opportunities = [] } = useQuery({
    queryKey: ["opportunities", "feed"],
    queryFn: listOpportunitiesRequest,
    staleTime: 5 * 60 * 1000,
  });

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
    useAuthStore.getState().clearSession();
    clearPersistedAuthSession();
    setIsProfileMenuPinned(false);
    setIsProfileMenuOpen(false);
    navigate("/", { replace: true });
  };

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

  const roleName = String(role ?? "");
  const isCurator = roleName === "curator";
  const homePageClassName = [
    "home-page",
    roleName === "applicant" ? "home-page--applicant" : "",
    roleName === "employer" ? "home-page--employer" : "",
    roleName === "curator" ? "home-page--curator" : "",
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

  return (
    <main className={homePageClassName}>
      <header className="header">
        <div className="header__top">
          <Container className="home-page__container header__top-container">
            <div className="header__brand">
              <Link to="/" className="header__brand-name">
                Трамплин
              </Link>
              <div className="header__logo-badge">Лого</div>
            </div>

            <div className="header__main">
              <nav className="header__nav" aria-label="Основная навигация">
                <Link to="/" className="header__nav-link">
                  Главная
                </Link>
                <a href="#about" className="header__nav-link">
                  О проекте
                </a>
              </nav>

              <div className="header__controls">
                <label className="header__search" aria-label="Поиск">
                  <Input
                    type="search"
                    placeholder="Поиск"
                    aria-label="Поиск по платформе"
                    className="input--sm header__search-input"
                  />
                </label>

                <div className="header__actions">
                  {isAuthenticated ? (
                    <div className="header__account-actions" aria-label="Действия аккаунта">
                      <NotificationMenu
                        buttonClassName="header__icon-button"
                        iconClassName="header__icon-button-image"
                      />

                      <div
                        ref={profileMenuRef}
                        className="header__profile-menu"
                      >
                        <button
                          type="button"
                          className="header__icon-button"
                          aria-label="Профиль"
                          aria-expanded={isProfileMenuOpen}
                          aria-haspopup="menu"
                          onMouseEnter={openProfileMenu}
                          onMouseLeave={scheduleProfileMenuClose}
                          onClick={() => {
                            clearProfileMenuCloseTimeout();
                            setIsProfileMenuPinned((currentPinned) => {
                              const nextPinned = !currentPinned;
                              setIsProfileMenuOpen(nextPinned);
                              return nextPinned;
                            });
                          }}
                        >
                          <img
                            src={profileIcon}
                            alt=""
                            aria-hidden="true"
                            className="header__icon-button-image"
                          />
                        </button>

                        <div
                          className={
                            isProfileMenuOpen
                              ? "header__profile-dropdown"
                              : "header__profile-dropdown header__profile-dropdown--hidden"
                          }
                          role="menu"
                          aria-hidden={!isProfileMenuOpen}
                          onMouseEnter={openProfileMenu}
                          onMouseLeave={scheduleProfileMenuClose}
                        >
                          <button type="button" className="header__profile-dropdown-item" role="menuitem">
                            Профиль
                          </button>
                          <button type="button" className="header__profile-dropdown-item" role="menuitem">
                            Мои отклики
                          </button>
                          <button type="button" className="header__profile-dropdown-item" role="menuitem">
                            Избранное
                          </button>
                          <button type="button" className="header__profile-dropdown-item" role="menuitem">
                            Нетворкинг
                          </button>
                          <button type="button" className="header__profile-dropdown-item" role="menuitem">
                            Настройки
                          </button>
                          <button
                            type="button"
                            className="header__profile-dropdown-item header__profile-dropdown-item--danger"
                            role="menuitem"
                            onClick={handleLogout}
                          >
                            Выход
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
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
                  )}
                </div>
              </div>
            </div>
          </Container>
        </div>

        <div className="header__bottom">
          <Container className="home-page__container header__bottom-container">
            {isCurator ? (
              <nav className="header__categories header__categories--curator" aria-label="Навигация куратора">
                <a href="#dashboard" className="header__category-link">
                  Дашборд
                </a>
                <a href="#employer-verification" className="header__category-link">
                  Верификация работодателей
                </a>
                <a href="#content-moderation" className="header__category-link">
                  Модерация контента
                </a>
                <a href="#curators" className="header__category-link">
                  Управление кураторами
                </a>
                <a href="#settings" className="header__category-link">
                  Настройки
                </a>
              </nav>
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

                <CitySelector value={selectedCity} onChange={setSelectedCity} />
              </>
            )}
          </Container>
        </div>
      </header>

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
                      selectedOpportunityId={selectedOpportunityId}
                      selectedCity={selectedCity}
                      isExpanded={isMapExpanded}
                      isTransitioning={isMapTransitioning}
                      roleName={roleName}
                      onSelectOpportunity={setSelectedOpportunityId}
                      onSelectCity={setSelectedCity}
                      onCloseDetails={() => setSelectedOpportunityId(null)}
                      onToggleExpand={handleToggleMapExpand}
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
                <OpportunityList opportunities={opportunities} />
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

      <footer className="home-footer" id="about">
        <Container className="home-page__container home-footer__container">
          <div className="home-footer__main">
            <div className="home-footer__logo-card">Лого</div>

            <div className="home-footer__column">
              <h2 className="home-footer__title">О платформе</h2>
              <div className="home-footer__links">
                <Link to="/" className="home-footer__link">
                  Главная
                </Link>
                <a href="#about" className="home-footer__link">
                  О проекте
                </a>
              </div>
            </div>

            <div className="home-footer__column">
              <h2 className="home-footer__title">Категории</h2>
              <div className="home-footer__links">
                <a href="#all" className="home-footer__link">
                  Все
                </a>
                <a href="#vacancies" className="home-footer__link">
                  Вакансии
                </a>
                <a href="#internships" className="home-footer__link">
                  Стажировки
                </a>
                <a href="#events" className="home-footer__link">
                  Мероприятия
                </a>
                <a href="#mentorship" className="home-footer__link">
                  Менторство
                </a>
              </div>
            </div>

            <div className="home-footer__column">
              <h2 className="home-footer__title">Поддержка</h2>
              <div className="home-footer__links">
                <a href="#help" className="home-footer__link">
                  Помощь
                </a>
                <a href="#faq" className="home-footer__link">
                  FAQ
                </a>
                <a href="#support-contacts" className="home-footer__link">
                  Контакты поддержки
                </a>
                <a href="#report" className="home-footer__link">
                  Сообщить о проблеме
                </a>
              </div>
            </div>

            <div className="home-footer__column">
              <h2 className="home-footer__title">Контакты</h2>
              <div className="home-footer__contacts">
                <a href="mailto:info@trampline.ru" className="home-footer__contact">
                  info@trampline.ru
                </a>
                <a href="tel:+79000000000" className="home-footer__contact">
                  +7 (900) 000 00-00
                </a>
              </div>
              <div className="home-footer__socials">
                <a href="https://vk.com" className="home-footer__social-link" aria-label="VK">
                  <img src={vkIcon} alt="" className="home-footer__social-icon" />
                </a>
                <a href="https://max.ru" className="home-footer__social-link" aria-label="Max">
                  <img src={maxIcon} alt="" className="home-footer__social-icon" />
                </a>
              </div>
            </div>
          </div>

          <div className="home-footer__bottom">
            <span className="home-footer__copyright">
              © 2026 Платформа “Трамплин”. Все права защищены.
            </span>
            <a href="#privacy" className="home-footer__legal-link">
              Политика конфиденциальности
            </a>
            <a href="#terms" className="home-footer__legal-link">
              Пользовательское соглашение
            </a>
          </div>
        </Container>
      </footer>
    </main>
  );
}
