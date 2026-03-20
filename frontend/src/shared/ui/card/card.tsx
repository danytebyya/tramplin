import { HTMLAttributes } from "react";

import { cn } from "../../lib";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return <div className={cn("card", className)} {...props} />;
}
