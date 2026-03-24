import { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib";

type BadgeVariant =
  | "primary"
  | "secondary"
  | "warning"
  | "success"
  | "danger"
  | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: BadgeVariant;
};

export function Badge({
  children,
  variant = "primary",
  className,
  ...props
}: BadgeProps) {
  return (
    <span className={cn("badge", `badge--${variant}`, className)} {...props}>
      <span className="badge__label">{children}</span>
    </span>
  );
}
