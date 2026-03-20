import { InputHTMLAttributes } from "react";

import { cn } from "../../lib";

type CheckboxVariant = "primary" | "secondary";

type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: CheckboxVariant;
};

export function Checkbox({ className, variant = "primary", ...props }: CheckboxProps) {
  return <input type="checkbox" className={cn("checkbox", `checkbox--${variant}`, className)} {...props} />;
}
