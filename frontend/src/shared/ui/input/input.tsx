import {
  ChangeEvent,
  ClipboardEvent,
  FocusEvent,
  InputHTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { cn } from "../../lib";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  clearable?: boolean;
};

function generateObfuscatedClipboardValue(length: number) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=_-";
  const targetLength = Math.min(Math.max(length, 12), 32);

  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(targetLength);
    window.crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  return Array.from(
    { length: targetLength },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

async function writeTextToClipboard(value: string, clipboardData?: DataTransfer | null) {
  if (clipboardData) {
    clipboardData.setData("text/plain", value);
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
  }
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    error,
    onFocus,
    onBlur,
    onInput,
    onChange,
    onCopy,
    clearable = true,
    defaultValue,
    value,
    ...props
  },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasChangedWhileFocused, setHasChangedWhileFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(String(defaultValue ?? ""));
  const focusStartValueRef = useRef("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const hasError = Boolean(error) || Boolean(className?.includes("input--error"));
  const isErrorEditing = hasError && isFocused && hasChangedWhileFocused;
  const isControlled = value !== undefined;
  const inputValue = isControlled ? String(value ?? "") : uncontrolledValue;
  const isPasswordField = props.type === "password";
  const resolvedType = isPasswordField ? (isPasswordVisible ? "text" : "password") : props.type;
  const shouldShowPasswordToggle = isPasswordField && !props.disabled;
  const shouldShowClear =
    !isPasswordField && clearable && !props.disabled && isFocused && inputValue.length > 0;
  const shouldShowAction = shouldShowPasswordToggle || shouldShowClear;

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setHasChangedWhileFocused(false);
    focusStartValueRef.current = event.currentTarget.value;
    onFocus?.(event);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) {
      setUncontrolledValue(event.currentTarget.value);
    }

    if (isFocused) {
      setHasChangedWhileFocused(event.currentTarget.value !== focusStartValueRef.current);
    }

    onInput?.(event);
    onChange?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    setHasChangedWhileFocused(false);
    onBlur?.(event);
  };

  const handleCopy = (event: ClipboardEvent<HTMLInputElement>) => {
    if (isPasswordField && !isPasswordVisible) {
      const obfuscatedValue = generateObfuscatedClipboardValue(inputValue.length);
      event.preventDefault();
      void writeTextToClipboard(obfuscatedValue, event.clipboardData);
    }

    onCopy?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      isPasswordField &&
      !isPasswordVisible &&
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "c"
    ) {
      event.preventDefault();
      void writeTextToClipboard(generateObfuscatedClipboardValue(inputValue.length));
    }

    props.onKeyDown?.(event);
  };

  const handleClear = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const element = inputRef.current;

    if (!element) {
      return;
    }

    element.value = "";
    setUncontrolledValue("");
    setHasChangedWhileFocused(true);
    element.focus();

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const handlePasswordToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const element = inputRef.current;
    const wasFocused = document.activeElement === element;
    const selectionStart = element?.selectionStart ?? null;
    const selectionEnd = element?.selectionEnd ?? null;

    setIsPasswordVisible((current) => !current);

    if (!wasFocused || !element) {
      return;
    }

    requestAnimationFrame(() => {
      element.focus({ preventScroll: true });

      if (selectionStart !== null && selectionEnd !== null) {
        element.setSelectionRange(selectionStart, selectionEnd);
      }
    });
  };

  const handlePasswordMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (document.activeElement === inputRef.current) {
      event.preventDefault();
    }
  };

  return (
    <span className="input-field">
      <input
        ref={inputRef}
        className={cn(
          "input",
          hasError ? "input--error" : undefined,
          isErrorEditing ? "input--error-editing" : undefined,
          shouldShowAction ? "input--with-clear" : undefined,
          className,
        )}
        onFocus={handleFocus}
        onChange={handleInput}
        onInput={undefined}
        onCopy={handleCopy}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        defaultValue={isControlled ? undefined : defaultValue}
        value={value}
        {...props}
        type={resolvedType}
      />
      {shouldShowPasswordToggle ? (
        <button
          type="button"
          className={cn(
            "input-field__action",
            isPasswordVisible ? "input-field__action--password-visible" : "input-field__action--password-hidden",
          )}
          aria-label={isPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
          onMouseDown={handlePasswordMouseDown}
          onClick={handlePasswordToggle}
        />
      ) : null}
      {shouldShowClear ? (
        <button
          type="button"
          className="input-field__action input-field__action--clear"
          aria-label="Очистить поле"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClear}
        />
      ) : null}
    </span>
  );
});
