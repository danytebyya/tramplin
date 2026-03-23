import { Link, useNavigate } from "react-router-dom";

import maxIcon from "../../assets/auth/max.png";
import vkIcon from "../../assets/auth/vk.png";
import { LogoutButton, useAuthStore } from "../../features/auth";
import { Button, Container, Input } from "../../shared/ui";
import "../../widgets/header/header.css";
import "./map.css";

export function MapPage() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const mapPageClassName =
    role === "employer"
      ? "map-page map-page--employer"
      : role === "applicant"
        ? "map-page map-page--applicant"
        : "map-page";

  return (
    <main className={mapPageClassName}>
      <header className="header">
        <div className="header__top">
          <Container className="map-page__container header__top-container">
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
          <Container className="map-page__container header__bottom-container">
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

            <div className="header__location">
              <span className="header__location-icon" aria-hidden="true" />
              <span>Чебоксары</span>
            </div>
          </Container>
        </div>
      </header>

      <section className="map-page__hero">
        <Container className="map-page__container map-page__hero-container">
          <div className="map-page__hero-card">
            <span className="map-page__hero-eyebrow">Главная</span>
            <h1 className="map-page__title">Карьерная платформа для студентов, выпускников и работодателей</h1>
            <p className="map-page__text">
              Хедер и футер собраны по референсам. Контент главной страницы можно развивать дальше
              следующим этапом.
            </p>
          </div>
        </Container>
      </section>

      <footer className="map-footer" id="about">
        <Container className="map-page__container map-footer__container">
          <div className="map-footer__main">
            <div className="map-footer__logo-card">Лого</div>

            <div className="map-footer__column">
              <h2 className="map-footer__title">О платформе</h2>
              <div className="map-footer__links">
                <Link to="/" className="map-footer__link">
                  Главная
                </Link>
                <a href="#about" className="map-footer__link">
                  О проекте
                </a>
              </div>
            </div>

            <div className="map-footer__column">
              <h2 className="map-footer__title">Категории</h2>
              <div className="map-footer__links">
                <a href="#all" className="map-footer__link">
                  Все
                </a>
                <a href="#vacancies" className="map-footer__link">
                  Вакансии
                </a>
                <a href="#internships" className="map-footer__link">
                  Стажировки
                </a>
                <a href="#events" className="map-footer__link">
                  Мероприятия
                </a>
                <a href="#mentorship" className="map-footer__link">
                  Менторство
                </a>
              </div>
            </div>

            <div className="map-footer__column">
              <h2 className="map-footer__title">Поддержка</h2>
              <div className="map-footer__links">
                <a href="#help" className="map-footer__link">
                  Помощь
                </a>
                <a href="#faq" className="map-footer__link">
                  FAQ
                </a>
                <a href="#support-contacts" className="map-footer__link">
                  Контакты поддержки
                </a>
                <a href="#report" className="map-footer__link">
                  Сообщить о проблеме
                </a>
              </div>
            </div>

            <div className="map-footer__column">
              <h2 className="map-footer__title">Контакты</h2>
              <div className="map-footer__contacts">
                <a href="mailto:info@trampline.ru" className="map-footer__contact">
                  info@trampline.ru
                </a>
                <a href="tel:+79000000000" className="map-footer__contact">
                  +7 (900) 000 00-00
                </a>
              </div>
              <div className="map-footer__socials">
                <a href="https://vk.com" className="map-footer__social-link" aria-label="VK">
                  <img src={vkIcon} alt="" className="map-footer__social-icon" />
                </a>
                <a href="https://max.ru" className="map-footer__social-link" aria-label="Max">
                  <img src={maxIcon} alt="" className="map-footer__social-icon" />
                </a>
              </div>
            </div>
          </div>

          <div className="map-footer__bottom">
            <span className="map-footer__copyright">
              © 2026 Платформа “Трамплин”. Все права защищены.
            </span>
            <a href="#privacy" className="map-footer__legal-link">
              Политика конфиденциальности
            </a>
            <a href="#terms" className="map-footer__legal-link">
              Пользовательское соглашение
            </a>
          </div>
        </Container>
      </footer>
    </main>
  );
}
