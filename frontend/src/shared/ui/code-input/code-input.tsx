import { ClipboardEvent, KeyboardEvent, useEffect, useMemo, useRef } from "react";

import { cn } from "../../lib";

type CodeInputProps = {
  value: string;
  length?: number;
  error?: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "accent";
  onChange: (value: string) => void;
};

export function CodeInput({
  value,
  length = 6,
  error,
  disabled = false,
  variant = "primary",
  onChange,
}: CodeInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const normalizedValue = useMemo(
    () => value.replace(/\D/g, "").slice(0, length),
    [length, value],
  );
  const digits = useMemo(
    () => Array.from({ length }, (_, index) => normalizedValue[index] ?? ""),
    [length, normalizedValue],
  );

  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  const focusInput = (index: number) => {
    const nextInput = inputRefs.current[index];

    if (!nextInput) {
      return;
    }

    nextInput.focus();
    nextInput.select();
  };

  const updateValue = (nextDigits: string[]) => {
    onChange(nextDigits.join(""));
  };

  const handleDigitChange = (index: number, nextValue: string) => {
    const cleanValue = nextValue.replace(/\D/g, "");

    if (!cleanValue) {
      const nextDigits = [...digits];
      nextDigits[index] = "";
      updateValue(nextDigits);
      return;
    }

    const nextDigits = [...digits];
    const nextChars = cleanValue.slice(0, length - index).split("");

    nextChars.forEach((char, offset) => {
      nextDigits[index + offset] = char;
    });

    updateValue(nextDigits);

    const nextFocusIndex = Math.min(index + nextChars.length, length - 1);
    focusInput(nextFocusIndex);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Backspace") {
      if (digits[index]) {
        const nextDigits = [...digits];
        nextDigits[index] = "";
        updateValue(nextDigits);
        event.preventDefault();
        return;
      }

      if (index > 0) {
        const nextDigits = [...digits];
        nextDigits[index - 1] = "";
        updateValue(nextDigits);
        focusInput(index - 1);
        event.preventDefault();
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      focusInput(index - 1);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowRight" && index < length - 1) {
      focusInput(index + 1);
      event.preventDefault();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedValue = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);

    if (!pastedValue) {
      return;
    }

    event.preventDefault();
    onChange(pastedValue);
    focusInput(Math.min(pastedValue.length, length - 1));
  };

  return (
    <div className="code-input">
      <div className="code-input__group">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              inputRefs.current[index] = node;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={digit}
            disabled={disabled}
            className={cn(
              "code-input__cell",
              `code-input__cell--${variant}`,
              error ? "code-input__cell--error" : undefined,
            )}
            aria-label={`Цифра ${index + 1} из ${length}`}
            onChange={(event) => handleDigitChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onFocus={(event) => event.target.select()}
            onPaste={handlePaste}
          />
        ))}
      </div>
    </div>
  );
}
