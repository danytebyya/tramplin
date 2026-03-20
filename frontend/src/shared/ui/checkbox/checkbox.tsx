import { InputHTMLAttributes } from "react";

import { cn } from "../../lib";

type CheckboxProps = InputHTMLAttributes<HTMLInputElement>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return <input type="checkbox" className={cn("checkbox", className)} {...props} />;
}
