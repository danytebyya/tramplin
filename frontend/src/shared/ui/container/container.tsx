import { HTMLAttributes } from "react";

import { cn } from "../../lib";

type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "auth-page";
};

export function Container({ className, variant = "default", ...props }: ContainerProps) {
  return (
    <div
      className={cn("container", variant !== "default" ? `container__${variant}` : undefined, className)}
      {...props}
    />
  );
}
