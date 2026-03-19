import { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function Button({ children, variant = "primary", fullWidth = false, className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "ui-button",
        `ui-button--${variant}`,
        fullWidth ? "ui-button--full-width" : undefined,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
