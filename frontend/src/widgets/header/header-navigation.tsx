import { NavLink } from "react-router-dom";

import { getModerationAccessState, useAuthStore } from "../../features/auth";

type EmployerHeaderNavigationProps = {
  currentPage: "dashboard" | "opportunities" | "responses" | "chat" | "settings";
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
      <NavLink
        to="/employer/responses"
        className={currentPage === "responses" ? "header__category-link active" : "header__category-link"}
      >
        Отклики
      </NavLink>
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
  const role = useAuthStore((state) => state.role);
  const moderationAccess = getModerationAccessState(role);
  const canAccessEmployerVerification = moderationAccess.canAccessEmployerVerification;
  const canAccessContentModeration = moderationAccess.canAccessContentModeration;
  const canManageCurators = isAdmin && moderationAccess.canManageCurators;

  return (
    <nav className="header__categories header__categories--curator" aria-label="Навигация куратора">
      <NavLink
        to="/dashboard/curator"
        className={currentPage === "dashboard" ? "header__category-link active" : "header__category-link"}
      >
        Дашборд
      </NavLink>
      {canAccessEmployerVerification ? (
        <NavLink
          to="/moderation/employers"
          className={currentPage === "employers" ? "header__category-link active" : "header__category-link"}
        >
          Верификация работодателей
        </NavLink>
      ) : null}
      {canAccessContentModeration ? (
        <NavLink
          to="/moderation/content"
          className={currentPage === "content" ? "header__category-link active" : "header__category-link"}
        >
          Модерация контента
        </NavLink>
      ) : null}
      {canManageCurators ? (
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
