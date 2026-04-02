import { HTMLAttributes } from "react";

import { cn } from "../../lib";
import { InfoTooltip } from "../info-tooltip/info-tooltip";
import "./verified-tooltip.css";

type VerifiedTooltipProps = HTMLAttributes<HTMLSpanElement> & {
  size?: "sm" | "lg";
};

export function VerifiedTooltip({
  className,
  size = "sm",
  ...props
}: VerifiedTooltipProps) {
  return (
    <span {...props}>
      <InfoTooltip
        className={cn("verified-tooltip", size === "lg" && "verified-tooltip--lg", className)}
        text={
          <span className="verified-tooltip__summary">
            <strong className="verified-tooltip__title">Верифицированная организация</strong>
            <span>Документы проверены и подтверждены</span>
          </span>
        }
      />
    </span>
  );
}
