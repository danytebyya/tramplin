import { InputHTMLAttributes } from "react";

import { cn } from "../../lib";

type SwitchProps = InputHTMLAttributes<HTMLInputElement>;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <label className={cn("switch", className)}>
      <input type="checkbox" className="switch__input" {...props} />
      <span className="switch__track" />
    </label>
  );
}
