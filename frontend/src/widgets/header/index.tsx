import { ReactNode } from "react";
import { Link } from "react-router-dom";

import { CitySelection, CitySelector } from "../../features/city-selector";
import { readAccessTokenPayload, useAuthStore } from "../../features/auth";
import { NotificationMenu } from "../../features/notifications";
import { cn } from "../../shared/lib";
import { Container } from "../../shared/ui";
import logoPrimary from "../../assets/icons/logo-primary.svg";
import logoPrimarySm from "../../assets/icons/logo-primary-sm.svg";
import logoSecondary from "../../assets/icons/logo-secondary.svg";
import logoSecondarySm from "../../assets/icons/logo-secondary-sm.svg";
import { HeaderProfileMenu, HeaderProfileMenuItem } from "./header-profile-menu";
import "./header.css";

const opportunityCategoryLinks: Array<{
  value: "all" | "vacancy" | "internship" | "event" | "mentorship";
  label: string;
}> = [
  { value: "all", label: "Все" },
  { value: "vacancy", label: "Вакансии" },
  { value: "internship", label: "Стажировки" },
  { value: "event", label: "Мероприятия" },
  { value: "mentorship", label: "Менторские программы" },
];

type HeaderProps = {
  containerClassName?: string;
  profileMenuItems: HeaderProfileMenuItem[];
  theme?: "applicant" | "employer" | "curator";
  variant?: "default" | "landing";
  city?: string;
  onCityChange?: (city: CitySelection) => void;
  bottomContent?: ReactNode;
  topNavigation?: ReactNode;
  isAuthenticated?: boolean;
  guestActions?: ReactNode;
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  notificationOnRealtimeMessage?: () => void;
};

function resolveHeaderBrandSubtitle(theme: "applicant" | "employer" | "curator", isAuthenticated: boolean) {
  if (!isAuthenticated) {
    return null;
  }

  if (theme === "employer") {
    return "Для работодателя";
  }

  if (theme === "curator") {
    return "Для куратора";
  }

  return "Для соискателя";
}

export function Header({
  containerClassName,
  profileMenuItems,
  theme,
  variant = "default",
  city,
  onCityChange,
  bottomContent,
  topNavigation,
  isAuthenticated = true,
  guestActions,
  showSearch = true,
  searchValue = "",
  onSearchChange,
  notificationOnRealtimeMessage,
}: HeaderProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.role);
  const activeRole = readAccessTokenPayload(accessToken)?.active_role ?? role;
  const resolvedTheme =
    theme ??
    (activeRole === "curator" || activeRole === "junior" || activeRole === "admin"
      ? "curator"
      : activeRole === "employer"
        ? "employer"
        : "applicant");
  const headerRoleClassName =
    resolvedTheme === "applicant"
      ? "header--applicant"
      : resolvedTheme === "curator"
        ? "header--curator"
        : resolvedTheme === "employer"
          ? "header--employer"
          : undefined;
  const headerVariantClassName = variant === "landing" ? "header--landing" : undefined;
  const resolvedTopNavigation = topNavigation === undefined ? (
    <nav className="header__nav" aria-label="Основная навигация">
      <a href="/" className="header__nav-link">Главная</a>
    </nav>
  ) : topNavigation;
  const isPrimaryTheme = resolvedTheme === "employer" || resolvedTheme === "curator";
  const defaultLogoSource = isPrimaryTheme ? logoPrimary : logoSecondary;
  const landingLogoSource = isAuthenticated
    ? defaultLogoSource
    : logoPrimarySm;
  const logoSource = variant === "landing" ? landingLogoSource : defaultLogoSource;
  const brandSubtitle = resolveHeaderBrandSubtitle(resolvedTheme, isAuthenticated);

  return (
    <header className={cn("header", headerRoleClassName, headerVariantClassName)}>
      <div className="header__top">
        <Container className={cn(containerClassName, "header__top-container")}>
          <div className="header__brand">
            <Link to="/" className="header__brand-name" aria-label="Трамплин">
              <img src={logoSource} alt="" aria-hidden="true" className="header__logo-badge" />
              {brandSubtitle ? <span className="header__brand-subtitle">{brandSubtitle}</span> : null}
            </Link>
          </div>

          <div className="header__main">
            {resolvedTopNavigation}

            <div className="header__controls">
              {showSearch ? (
                <label className="header__search" aria-label="Поиск">
                  <input
                    type="search"
                    placeholder="Поиск"
                    aria-label="Поиск по платформе"
                    className="input input--sm header__search-input"
                    value={searchValue}
                    onChange={(event) => onSearchChange?.(event.target.value)}
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

              <CitySelector value={city} onChange={onCityChange} />
            </>
          ) : null)}
        </Container>
      </div>
    </header>
  );
}

export { buildEmployerProfileMenuItems } from "./profile-menu-items";
export { buildModerationProfileMenuItems } from "./profile-menu-items";
export { buildApplicantProfileMenuItems } from "./profile-menu-items";
export { CuratorHeaderNavigation } from "./header-navigation";
