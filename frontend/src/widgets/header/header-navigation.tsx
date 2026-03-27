import { NavLink } from "react-router-dom";

type EmployerHeaderNavigationProps = {
  currentPage: "dashboard" | "opportunities" | "settings";
};

export function EmployerHeaderNavigation({ currentPage }: EmployerHeaderNavigationProps) {
  return (
    <nav className="header__categories" aria-label="Навигация работодателя">
      <NavLink
        to="/dashboard/employer"
        end
        className={currentPage === "dashboard" ? "header__category-link active" : "header__category-link"}
      >
        Профиль компании
      </NavLink>
      <NavLink
        to="/employer/opportunities"
        className={currentPage === "opportunities" ? "header__category-link active" : "header__category-link"}
      >
        Управление возможностями
      </NavLink>
      <span className="header__category-link" aria-disabled="true">
        Отклики
      </span>
      <span className="header__category-link" aria-disabled="true">
        Чат
      </span>
      <NavLink
        to="/settings"
        className={currentPage === "settings" ? "header__category-link active" : "header__category-link"}
      >
        Настройки
      </NavLink>
    </nav>
  );
}
