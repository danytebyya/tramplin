import { Button } from "../../shared/ui";
import { performLogout } from "./logout";

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
  const handleLogout = () => {
    void performLogout();
  };

  return (
    <Button type="button" variant={variant} className={className} onClick={handleLogout}>
      Выход
    </Button>
  );
}
