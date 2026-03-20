import { InputHTMLAttributes, forwardRef } from "react";

import { cn } from "../../lib";

type CheckboxVariant = "primary" | "secondary";

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
      className={cn("checkbox", `checkbox--${variant}`, className)}
      {...props}
    />
  );
});
