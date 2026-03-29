import { NavigateFunction } from "react-router-dom";

import { performLogout } from "../../features/auth";
import { EmployerAccessState } from "../../features/auth";
import { HeaderProfileMenuItem } from "./header-profile-menu";

export function buildModerationProfileMenuItems(): HeaderProfileMenuItem[] {
  return [
    { label: "Выход", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) },
  ];
}

export function buildApplicantProfileMenuItems(navigate: NavigateFunction): HeaderProfileMenuItem[] {
  return [
    { label: "Профиль", onClick: () => navigate("/dashboard/applicant") },
    { label: "Мои отклики" },
    { label: "Избранное", onClick: () => navigate("/favorites") },
    { label: "Нетворкинг", onClick: () => navigate("/networking") },
    { label: "Настройки", onClick: () => navigate("/settings") },
    { label: "Выход", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) },
  ];
}

export function buildEmployerProfileMenuItems(
  navigate: NavigateFunction,
  access: EmployerAccessState,
): HeaderProfileMenuItem[] {
  const items: HeaderProfileMenuItem[] = [];

  if (access.canManageCompanyProfile) {
    items.push({ label: "Профиль", onClick: () => navigate("/dashboard/employer") });
  }

  if (access.canManageOpportunities) {
    items.push({ label: "Управление возможностями", onClick: () => navigate("/employer/opportunities") });
  }

  if (access.canReviewResponses) {
    items.push({ label: "Отклики" });
  }

  if (access.canAccessChat) {
    items.push({ label: "Чат", onClick: () => navigate("/employer/chat") });
  }

  items.push({ label: "Настройки", onClick: () => navigate("/settings") });
  items.push({ label: "Выйти", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) });

  return items;
}
