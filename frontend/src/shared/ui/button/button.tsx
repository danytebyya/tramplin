import { ButtonHTMLAttributes, MouseEvent } from "react";
import { ReactNode } from "react";

import { cn } from "../../lib";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  size?: ButtonSize;
  loading?: boolean;
  withArrow?: boolean;
};

export function Button({
  children,
  variant = "primary",
  fullWidth = false,
  size,
  loading = false,
  withArrow = true,
  className,
  onClick,
  ...props
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      className={cn(
        "button",
        `button--${variant}`,
        size ? `button--${size}` : undefined,
        fullWidth ? "button--full-width" : undefined,
        loading ? "button--loading" : undefined,
        className,
      )}
      disabled={props.disabled}
      aria-disabled={props.disabled || loading}
      aria-busy={loading}
      onClick={handleClick}
      {...props}
    >
      {loading ? <span className="button__spinner" /> : <span className="button__label">{children}</span>}
      {!loading && withArrow ? <span className="button__arrow">›</span> : null}
    </button>
  );
}
