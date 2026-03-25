import { ButtonHTMLAttributes, ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { cn } from "../../lib";

type ModalProps = {
  children: ReactNode;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  panelClassName?: string;
};

function ModalCloseButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="modal__close" aria-label="Закрыть модальное окно" {...props}>
      <span className="modal__close-line" aria-hidden="true" />
      <span className="modal__close-line modal__close-line--reverse" aria-hidden="true" />
    </button>
  );
}

export function Modal({ children, title, isOpen, onClose, panelClassName }: ModalProps) {
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
          <h2 className="modal__title">{title}</h2>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div className="modal__content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
