import { InputHTMLAttributes } from "react";

import { cn } from "../../lib";

type SwitchVariant = "primary" | "secondary" | "accent";

type SwitchProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: SwitchVariant;
};

export function Switch({ className, variant = "primary", ...props }: SwitchProps) {
  return (
    <label className={cn("switch", `switch--${variant}`, className)}>
      <input type="checkbox" className="switch__input" {...props} />
      <span className="switch__track" />
    </label>
  );
}
