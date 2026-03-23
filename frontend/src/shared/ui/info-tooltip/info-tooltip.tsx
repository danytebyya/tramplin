import { ReactNode, useId, useState } from "react";

import { cn } from "../../lib";

type InfoTooltipProps = {
  text: ReactNode;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
};

export function InfoTooltip({
  text,
  className,
  triggerClassName,
  panelClassName,
}: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className={cn("info-tooltip", isOpen && "info-tooltip--open", className)}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className={cn("info-tooltip__trigger", triggerClassName)}
        aria-expanded={isOpen}
        aria-describedby={tooltipId}
        aria-label="Показать подсказку"
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
      >
        <span className="info-tooltip__icon" aria-hidden="true" />
      </button>
      <span id={tooltipId} role="tooltip" className={cn("info-tooltip__panel", panelClassName)}>
        {text}
      </span>
    </span>
  );
}
