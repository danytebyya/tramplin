import { InputHTMLAttributes, forwardRef } from "react";

import { cn } from "../../lib";

type CheckboxVariant = "primary" | "secondary" | "accent";

type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: CheckboxVariant;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, variant = "primary", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn("toggle-mark", `toggle-mark--${variant}`, className)}
      {...props}
    />
  );
});
