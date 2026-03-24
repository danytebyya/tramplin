import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";

import maxIcon from "../../assets/auth/max.png";
import vkIcon from "../../assets/auth/vk.png";
import { mockOpportunities } from "../../entities/opportunity";
import { LogoutButton, useAuthStore } from "../../features/auth";
import { Button, Container, Input } from "../../shared/ui";
import { OpportunityFilters } from "../../widgets/filters";
import "../../widgets/header/header.css";
import { MapView } from "../../widgets/map-view";
import { OpportunityList } from "../../widgets/opportunity-list";
import "./home.css";

export function HomePage() {
  const MAP_EXPANDED_TOP_OFFSET = 106;
  const MAP_EXPAND_TRANSITION_MS = 520;
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [mapExpandMode, setMapExpandMode] = useState<"collapsed" | "expanding" | "expanded" | "collapsing">("collapsed");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [mapPanelFrameStyle, setMapPanelFrameStyle] = useState<CSSProperties | undefined>(undefined);
  const [mapContentStyle, setMapContentStyle] = useState<CSSProperties | undefined>(undefined);
  const [mapPanelPlaceholderHeight, setMapPanelPlaceholderHeight] = useState<number | null>(null);
  const mapPanelShellRef = useRef<HTMLDivElement | null>(null);
  const collapsedMapPanelRectRef = useRef<DOMRect | null>(null);
  const mapTransitionTimeoutRef = useRef<number | null>(null);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const isMapExpanded = mapExpandMode !== "collapsed";
  const isMapExpandedLayout = mapExpandMode === "expanded" || mapExpandMode === "collapsing";
  const isMapFloating = mapExpandMode !== "collapsed";
  const isMapTransitioning = mapExpandMode === "expanding" || mapExpandMode === "collapsing";

  const getExpandedRect = () => ({
    top: MAP_EXPANDED_TOP_OFFSET,
    left: 0,
    width: window.innerWidth,
    height: Math.max(window.innerHeight - MAP_EXPANDED_TOP_OFFSET, 0),
  });

  const getCollapsedFrameStyle = (rect: DOMRect): CSSProperties => {
    const expandedRect = getExpandedRect();
    const scaleX = expandedRect.width > 0 ? rect.width / expandedRect.width : 1;
    const scaleY = expandedRect.height > 0 ? rect.height / expandedRect.height : 1;
    const expandedCenterX = expandedRect.left + expandedRect.width / 2;
    const expandedCenterY = expandedRect.top + expandedRect.height / 2;
    const collapsedCenterX = rect.left + rect.width / 2;
    const collapsedCenterY = rect.top + rect.height / 2;

    return {
      transform: `translate3d(${collapsedCenterX - expandedCenterX}px, ${collapsedCenterY - expandedCenterY}px, 0) scale(${scaleX}, ${scaleY})`,
      borderRadius: "24px",
    };
  };

  const getCollapsedContentStyle = (rect: DOMRect): CSSProperties => {
    const expandedRect = getExpandedRect();
    const scaleX = expandedRect.width > 0 ? rect.width / expandedRect.width : 1;
    const scaleY = expandedRect.height > 0 ? rect.height / expandedRect.height : 1;

    return {
      transform: `scale(${scaleX > 0 ? 1 / scaleX : 1}, ${scaleY > 0 ? 1 / scaleY : 1})`,
    };
  };

  const clearMapTransitionTimeout = () => {
    if (mapTransitionTimeoutRef.current !== null) {
      window.clearTimeout(mapTransitionTimeoutRef.current);
      mapTransitionTimeoutRef.current = null;
    }
  };

  const finishMapTransition = (nextMode: "collapsed" | "expanded") => {
    setMapExpandMode(nextMode);
    clearMapTransitionTimeout();

    if (nextMode === "collapsed") {
      setMapPanelFrameStyle(undefined);
      setMapContentStyle(undefined);
      setMapPanelPlaceholderHeight(null);
      collapsedMapPanelRectRef.current = null;
      return;
    }

    setMapPanelFrameStyle(undefined);
    setMapContentStyle(undefined);
  };

  const handleToggleMapExpand = () => {
    const panelShell = mapPanelShellRef.current;

    if (!panelShell || mapExpandMode === "expanding" || mapExpandMode === "collapsing") {
      return;
    }

    const shellRect = panelShell.getBoundingClientRect();

    if (mapExpandMode === "collapsed") {
      collapsedMapPanelRectRef.current = shellRect;
      setMapPanelPlaceholderHeight(shellRect.height);
      setMapPanelFrameStyle(getCollapsedFrameStyle(shellRect));
      setMapExpandMode("expanding");
      clearMapTransitionTimeout();

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setMapPanelFrameStyle({
            transform: "translate3d(0, 0, 0) scale(1, 1)",
            borderRadius: "0px",
          });
        });
      });

      mapTransitionTimeoutRef.current = window.setTimeout(() => {
        finishMapTransition("expanded");
      }, MAP_EXPAND_TRANSITION_MS);

      return;
    }

    const collapsedRect = collapsedMapPanelRectRef.current ?? shellRect;

    setMapPanelPlaceholderHeight(collapsedRect.height);
    setMapPanelFrameStyle({
      transform: "translate3d(0, 0, 0) scale(1, 1)",
      borderRadius: "0px",
    });
    setMapContentStyle({
      transform: "scale(1, 1)",
    });
    setMapExpandMode("collapsing");
    clearMapTransitionTimeout();

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setMapPanelFrameStyle(getCollapsedFrameStyle(collapsedRect));
        setMapContentStyle(getCollapsedContentStyle(collapsedRect));
      });
    });

    mapTransitionTimeoutRef.current = window.setTimeout(() => {
      finishMapTransition("collapsed");
    }, MAP_EXPAND_TRANSITION_MS);
  };

  const homePageClassName =
    role === "employer"
      ? `home-page home-page--employer${isMapFloating ? " home-page--map-floating" : ""}${isMapExpandedLayout ? " home-page--map-expanded" : ""}`
      : role === "applicant"
        ? `home-page home-page--applicant${isMapFloating ? " home-page--map-floating" : ""}${isMapExpandedLayout ? " home-page--map-expanded" : ""}`
        : `home-page${isMapFloating ? " home-page--map-floating" : ""}${isMapExpandedLayout ? " home-page--map-expanded" : ""}`;
  const explorerClassName = isMapExpandedLayout
    ? "home-page__explorer home-page__explorer--expanded"
    : "home-page__explorer";

  useEffect(() => {
    document.body.classList.toggle("home-page--map-floating", isMapFloating);
    document.body.classList.toggle("home-page--map-expanded", isMapExpandedLayout);

    return () => {
      document.body.classList.remove("home-page--map-floating");
      document.body.classList.remove("home-page--map-expanded");
    };
  }, [isMapExpandedLayout, isMapFloating]);

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
          ? {
              transform: "translate3d(0, 0, 0) scale(1, 1)",
              borderRadius: "0px",
            }
          : getCollapsedFrameStyle(collapsedMapPanelRectRef.current);
      });
    };

    window.addEventListener("resize", syncExpandedFrame);

    return () => {
      window.removeEventListener("resize", syncExpandedFrame);
    };
  }, [isMapExpanded, mapExpandMode]);

  useEffect(() => () => {
    clearMapTransitionTimeout();
  }, []);

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
                    <LogoutButton className="header__action-button" variant="primary-outline" />
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

            <button type="button" className="header__location" aria-haspopup="menu">
              <span className="header__location-icon" aria-hidden="true" />
              <span>Чебоксары</span>
            </button>
          </Container>
        </div>
      </header>

      <section className="home-page__hero">
        <Container className="home-page__container home-page__hero-container">
          <div className={explorerClassName}>
            <OpportunityFilters viewMode={viewMode} onViewModeChange={setViewMode} />

            <div className="home-page__explorer-content">
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
                  style={isMapFloating && mapExpandMode !== "expanded" ? mapPanelFrameStyle : undefined}
                >
                  <MapView
                    opportunities={mockOpportunities}
                    selectedOpportunityId={selectedOpportunityId}
                    isExpanded={isMapExpanded}
                    isTransitioning={isMapTransitioning}
                    mapContentStyle={mapContentStyle}
                    onSelectOpportunity={setSelectedOpportunityId}
                    onCloseDetails={() => setSelectedOpportunityId(null)}
                    onToggleExpand={handleToggleMapExpand}
                  />
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
                <OpportunityList opportunities={mockOpportunities} />
              </div>
            </div>
          </div>
        </Container>
      </section>

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
