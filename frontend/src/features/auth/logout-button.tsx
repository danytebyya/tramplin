import { useNavigate } from "react-router-dom";

import { Button } from "../../shared/ui";
import { clearPersistedAuthSession, useAuthStore } from "./session";

type LogoutButtonProps = {
  className?: string;
  variant?:
    | "primary"
    | "primary-outline"
    | "ghost"
    | "secondary"
    | "secondary-outline"
    | "secondary-ghost"
    | "accent"
    | "accent-outline"
    | "accent-ghost"
    | "danger"
    | "success";
};

export function LogoutButton({ className, variant = "ghost" }: LogoutButtonProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    useAuthStore.getState().clearSession();
    clearPersistedAuthSession();
    navigate("/", { replace: true });
  };

  return (
    <Button type="button" variant={variant} className={className} onClick={handleLogout}>
      Выход
    </Button>
  );
}
