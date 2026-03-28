import { NavigateFunction } from "react-router-dom";

import { performLogout } from "../../features/auth";
import { HeaderProfileMenuItem } from "./header-profile-menu";

export function buildModerationProfileMenuItems(): HeaderProfileMenuItem[] {
  return [
    { label: "Выход", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) },
  ];
}

export function buildEmployerProfileMenuItems(navigate: NavigateFunction): HeaderProfileMenuItem[] {
  return [
    { label: "Профиль", onClick: () => navigate("/dashboard/employer") },
    { label: "Управление возможностями", onClick: () => navigate("/employer/opportunities") },
    { label: "Отклики" },
    { label: "Чат", onClick: () => navigate("/employer/chat") },
    { label: "Настройки", onClick: () => navigate("/settings") },
    { label: "Выйти", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) },
  ];
}
