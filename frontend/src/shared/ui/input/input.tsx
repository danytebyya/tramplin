import { InputHTMLAttributes, forwardRef } from "react";

import { cn } from "../../lib";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...props },
  ref,
) {
  return <input ref={ref} className={cn("ui-input", error ? "ui-input--error" : undefined, className)} {...props} />;
});
