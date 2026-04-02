import { HTMLAttributes } from "react";

import { cn } from "../../lib";

type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "auth-page";
};

export function Container({ className, variant = "default", ...props }: ContainerProps) {
  const variantClassName =
    variant === "default" ? undefined : variant === "auth-page" ? "page-shell--auth" : `page-shell--${variant}`;

  return (
    <div
      className={cn("page-shell", variantClassName, className)}
      {...props}
    />
  );
}
