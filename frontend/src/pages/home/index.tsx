import { useState } from "react";
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
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(
    mockOpportunities[0]?.id ?? null,
  );
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const homePageClassName =
    role === "employer"
      ? "home-page home-page--employer"
      : role === "applicant"
        ? "home-page home-page--applicant"
        : "home-page";

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
          <div className="home-page__explorer">
            <OpportunityFilters viewMode={viewMode} onViewModeChange={setViewMode} />

            <div className="home-page__explorer-content">
              {viewMode === "map" ? (
                <MapView
                  opportunities={mockOpportunities}
                  selectedOpportunityId={selectedOpportunityId}
                  onSelectOpportunity={setSelectedOpportunityId}
                  onCloseDetails={() => setSelectedOpportunityId(null)}
                />
              ) : (
                <OpportunityList opportunities={mockOpportunities} />
              )}
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
