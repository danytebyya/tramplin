import { NavLink } from "react-router-dom";

type EmployerHeaderNavigationProps = {
  currentPage: "dashboard" | "opportunities" | "chat" | "settings";
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
      <NavLink
        to="/employer/chat"
        className={currentPage === "chat" ? "header__category-link active" : "header__category-link"}
      >
        Чат
      </NavLink>
      <NavLink
        to="/settings"
        className={currentPage === "settings" ? "header__category-link active" : "header__category-link"}
      >
        Настройки
      </NavLink>
    </nav>
  );
}

type CuratorHeaderNavigationProps = {
  isAdmin?: boolean;
  currentPage: "dashboard" | "employers" | "content" | "curators" | "settings";
};

export function CuratorHeaderNavigation({ isAdmin = false, currentPage }: CuratorHeaderNavigationProps) {
  return (
    <nav className="header__categories header__categories--curator" aria-label="Навигация куратора">
      <NavLink
        to="/dashboard/curator"
        className={currentPage === "dashboard" ? "header__category-link active" : "header__category-link"}
      >
        Дашборд
      </NavLink>
      <NavLink
        to="/moderation/employers"
        className={currentPage === "employers" ? "header__category-link active" : "header__category-link"}
      >
        Верификация работодателей
      </NavLink>
      <NavLink
        to="/moderation/content"
        className={currentPage === "content" ? "header__category-link active" : "header__category-link"}
      >
        Модерация контента
      </NavLink>
      {isAdmin ? (
        <NavLink
          to="/moderation/curators"
          className={currentPage === "curators" ? "header__category-link active" : "header__category-link"}
        >
          Управление кураторами
        </NavLink>
      ) : null}
      <NavLink
        to="/settings"
        className={currentPage === "settings" ? "header__category-link active" : "header__category-link"}
      >
        Настройки
      </NavLink>
    </nav>
  );
}
