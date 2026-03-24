import { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib";

type StatusVariant =
  | "active"
  | "approved"
  | "pending-review"
  | "rejected"
  | "info-request"
  | "unpublished"
  | "verified"
  | "verified-accent";

type StatusProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: StatusVariant;
};

export function Status({
  children,
  variant = "active",
  className,
  ...props
}: StatusProps) {
  return (
    <span className={cn("status", `status--${variant}`, className)} {...props}>
      {children}
    </span>
  );
}
