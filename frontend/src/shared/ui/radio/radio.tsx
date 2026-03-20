import { InputHTMLAttributes } from "react";

import { cn } from "../../lib";

type RadioVariant = "primary" | "secondary";

type RadioProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: RadioVariant;
};

export function Radio({ className, variant = "primary", ...props }: RadioProps) {
  return <input type="radio" className={cn("radio", `radio--${variant}`, className)} {...props} />;
}
