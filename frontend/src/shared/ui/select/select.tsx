import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib";

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  className?: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  size?: "sm" | "large";
  variant?: "primary" | "secondary" | "accent";
  value?: string;
  defaultValue?: string;
  options: SelectOption[];
  onValueChange?: (value: string) => void;
};

export function Select({
  className,
  error,
  disabled = false,
  placeholder = "Выберите вариант",
  size,
  variant = "primary",
  value,
  defaultValue,
  options,
  onValueChange,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isControlled = value !== undefined;
  const selectedValue = isControlled ? value ?? "" : uncontrolledValue;

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue),
    [options, selectedValue],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleToggle = () => {
    if (disabled) {
      return;
    }

    setIsOpen((current) => !current);
  };

  const handleSelect = (nextValue: string) => {
    if (!isControlled) {
      setUncontrolledValue(nextValue);
    }

    onValueChange?.(nextValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "select-field",
        isOpen ? "select-field--open" : undefined,
        disabled ? "select-field--disabled" : undefined,
        size === "large" ? "select-field--large" : undefined,
        size === "sm" ? "select-field--sm" : undefined,
        variant === "secondary" ? "select-field--secondary" : undefined,
        variant === "accent" ? "select-field--accent" : undefined,
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "select",
          error ? "select--error" : undefined,
          isOpen ? "select--open" : undefined,
        )}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={handleToggle}
      >
        <span className={cn("select__value", !selectedOption ? "select__value--placeholder" : undefined)}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className="select__icon" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className="select__dropdown" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              disabled={option.disabled}
              aria-selected={option.value === selectedValue}
              className={cn(
                "select__option",
                option.value === selectedValue ? "select__option--selected" : undefined,
              )}
              onClick={() => handleSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
