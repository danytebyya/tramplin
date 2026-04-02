import { ButtonHTMLAttributes, CSSProperties, ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { cn } from "../../lib";
import "./modal.css";

type ModalProps = {
  children: ReactNode;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  size?: "base" | "small";
  panelClassName?: string;
  titleAccentColor?: string;
  closeOnBackdrop?: boolean;
};

function renderModalTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return title;
  }

  const [firstWord, ...restWords] = normalizedTitle.split(/\s+/);
  const remainingText = restWords.join(" ");

  return (
    <>
      <span className="modal__title-accent">{firstWord}</span>
      {remainingText ? (
        <>
          {" "}
          <span className="modal__title-text">{remainingText}</span>
        </>
      ) : null}
    </>
  );
}

function ModalCloseButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="modal__close" aria-label="Закрыть модальное окно" {...props}>
      <span className="modal__close-line" aria-hidden="true" />
      <span className="modal__close-line modal__close-line--reverse" aria-hidden="true" />
    </button>
  );
}

export function Modal({
  children,
  title,
  isOpen,
  onClose,
  size = "base",
  panelClassName,
  titleAccentColor,
  closeOnBackdrop = true,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;
    const previousOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  const titleStyle = titleAccentColor
    ? ({ "--modal-title-accent-color": titleAccentColor } as CSSProperties)
    : undefined;

  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="modal__backdrop"
        aria-label="Закрыть модальное окно"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div className={cn("modal__panel", `modal__panel--${size}`, panelClassName)}>
        <div className="modal__header">
          <h2 className="modal__title" style={titleStyle}>
            {renderModalTitle(title)}
          </h2>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div className="modal__content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
