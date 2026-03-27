import { ButtonHTMLAttributes, CSSProperties, ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { cn } from "../../lib";
import "./modal.css";

type ModalProps = {
  children: ReactNode;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  panelClassName?: string;
  titleAccentColor?: string;
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
  panelClassName,
  titleAccentColor,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
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
        onClick={onClose}
      />
      <div className={cn("modal__panel", panelClassName)}>
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
