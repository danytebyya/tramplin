import { Link, useNavigate } from "react-router-dom";

import maxIcon from "../../assets/auth/max.png";
import vkIcon from "../../assets/auth/vk.png";
import { LogoutButton, useAuthStore } from "../../features/auth";
import { Button, Container } from "../../shared/ui";
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
      <header className="map-header">
        <div className="map-header__top">
          <Container className="map-header__top-container">
            <div className="map-header__brand">
              <Link to="/" className="map-header__brand-name">
                Трамплин
              </Link>
              <div className="map-header__logo-badge">Лого</div>
            </div>

            <nav className="map-header__nav" aria-label="Основная навигация">
              <Link to="/" className="map-header__nav-link">
                Главная
              </Link>
              <a href="#about" className="map-header__nav-link">
                О проекте
              </a>
            </nav>

            <label className="map-header__search" aria-label="Поиск">
              <svg className="map-header__search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16L21 21" />
              </svg>
              <input
                type="search"
                className="map-header__search-input"
                placeholder="Поиск"
                aria-label="Поиск по платформе"
              />
              <button type="button" className="map-header__search-clear" aria-label="Очистить поиск">
                <span className="map-header__search-clear-line" />
                <span className="map-header__search-clear-line" />
              </button>
            </label>

            <div className="map-header__auth">
              {isAuthenticated ? (
                <LogoutButton className="map-header__auth-button" variant="primary-outline" />
              ) : (
                <>
                  <Button
                    type="button"
                    variant="primary-outline"
                    className="map-header__auth-button"
                    onClick={() => navigate("/login")}
                  >
                    Вход
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="map-header__auth-button"
                    onClick={() => navigate("/register")}
                  >
                    Регистрация
                  </Button>
                </>
              )}
            </div>
          </Container>
        </div>

        <div className="map-header__bottom">
          <Container className="map-header__bottom-container">
            <nav className="map-header__categories" aria-label="Категории">
              <a href="#vacancies" className="map-header__category-link">
                Вакансии
              </a>
              <a href="#internships" className="map-header__category-link">
                Стажировки
              </a>
              <a href="#events" className="map-header__category-link">
                Мероприятия
              </a>
              <a href="#mentorship" className="map-header__category-link">
                Менторство
              </a>
            </nav>

            <div className="map-header__location">
              <svg className="map-header__location-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21C12 21 18 14.7 18 10A6 6 0 1 0 6 10C6 14.7 12 21 12 21Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span>Чебоксары</span>
            </div>
          </Container>
        </div>
      </header>

      <section className="map-page__hero">
        <Container className="map-page__hero-container">
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
        <Container className="map-footer__container">
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
