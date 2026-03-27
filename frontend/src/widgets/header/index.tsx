import { ReactNode } from "react";
import { Link } from "react-router-dom";

import { CitySelection, CitySelector } from "../../features/city-selector";
import { NotificationMenu } from "../../features/notifications";
import { cn } from "../../shared/lib";
import { Container, Input } from "../../shared/ui";
import { HeaderProfileMenu, HeaderProfileMenuItem } from "./header-profile-menu";
import "./header.css";

type HeaderProps = {
  containerClassName?: string;
  profileMenuItems: HeaderProfileMenuItem[];
  city?: string;
  onCityChange?: (city: CitySelection) => void;
  bottomContent?: ReactNode;
  topNavigation?: ReactNode;
  isAuthenticated?: boolean;
  guestActions?: ReactNode;
  showSearch?: boolean;
  notificationOnRealtimeMessage?: () => void;
};

export function Header({
  containerClassName,
  profileMenuItems,
  city,
  onCityChange,
  bottomContent,
  topNavigation,
  isAuthenticated = true,
  guestActions,
  showSearch = true,
  notificationOnRealtimeMessage,
}: HeaderProps) {
  const resolvedTopNavigation = topNavigation === undefined ? (
    <nav className="header__nav" aria-label="Основная навигация">
      <a href="/" className="header__nav-link">Главная</a>
      <a href="/#about" className="header__nav-link">О проекте</a>
    </nav>
  ) : topNavigation;

  return (
    <header className="header">
      <div className="header__top">
        <Container className={cn(containerClassName, "header__top-container")}>
          <div className="header__brand">
            <Link to="/" className="header__brand-name">Трамплин</Link>
            <div className="header__logo-badge">Лого</div>
          </div>

          <div className="header__main">
            {resolvedTopNavigation}

            <div className="header__controls">
              {showSearch ? (
                <label className="header__search" aria-label="Поиск">
                  <Input
                    type="search"
                    placeholder="Поиск"
                    aria-label="Поиск по платформе"
                    className="input--sm header__search-input"
                  />
                </label>
              ) : null}

              <div className="header__actions">
                {isAuthenticated ? (
                  <div className="header__account-actions" aria-label="Действия аккаунта">
                    <NotificationMenu
                      buttonClassName="header__icon-button"
                      iconClassName="header__icon-button-image"
                      onRealtimeMessage={notificationOnRealtimeMessage}
                    />
                    <HeaderProfileMenu items={profileMenuItems} />
                  </div>
                ) : (
                  guestActions
                )}
              </div>
            </div>
          </div>
        </Container>
      </div>

      <div className="header__bottom">
        <Container className={cn(containerClassName, "header__bottom-container")}>
          {bottomContent ?? (city && onCityChange ? (
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

              <CitySelector value={city} onChange={onCityChange} />
            </>
          ) : null)}
        </Container>
      </div>
    </header>
  );
}
