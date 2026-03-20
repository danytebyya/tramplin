import { InputHTMLAttributes } from "react";

import { cn } from "../../lib";

type RadioProps = InputHTMLAttributes<HTMLInputElement>;

export function Radio({ className, ...props }: RadioProps) {
  return <input type="radio" className={cn("radio", className)} {...props} />;
}
