import { FocusEvent, FormEvent, InputHTMLAttributes, forwardRef, useRef, useState } from "react";

import { cn } from "../../lib";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, onFocus, onBlur, onInput, ...props },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasChangedWhileFocused, setHasChangedWhileFocused] = useState(false);
  const focusStartValueRef = useRef("");

  const hasError = Boolean(error) || Boolean(className?.includes("input--error"));
  const isErrorEditing = hasError && isFocused && hasChangedWhileFocused;

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setHasChangedWhileFocused(false);
    focusStartValueRef.current = event.currentTarget.value;
    onFocus?.(event);
  };

  const handleInput = (event: FormEvent<HTMLInputElement>) => {
    if (isFocused) {
      setHasChangedWhileFocused(event.currentTarget.value !== focusStartValueRef.current);
    }
    onInput?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    setHasChangedWhileFocused(false);
    onBlur?.(event);
  };

  return (
    <input
      ref={ref}
      className={cn(
        "input",
        hasError ? "input--error" : undefined,
        isErrorEditing ? "input--error-editing" : undefined,
        className,
      )}
      onFocus={handleFocus}
      onInput={handleInput}
      onBlur={handleBlur}
      {...props}
    />
  );
});
