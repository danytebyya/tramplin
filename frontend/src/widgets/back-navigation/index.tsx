import type { To } from "react-router-dom";
import { useNavigate } from "react-router-dom";

import "./back-navigation.css";

type BackNavigationProps = {
  fallbackTo?: string;
  className?: string;
  to?: To;
  state?: unknown;
  replace?: boolean;
};

export function BackNavigation({
  fallbackTo = "/",
  className = "",
  to,
  state,
  replace = false,
}: BackNavigationProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (to) {
      navigate(to, { state, replace });
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(fallbackTo);
  };

  return (
    <div className={`back-navigation ${className}`.trim()}>
      <button
        type="button"
        className="back-navigation__button"
        onClick={handleBack}
        aria-label="Вернуться назад"
      >
        <span aria-hidden="true" className="back-navigation__icon" />
      </button>
    </div>
  );
}
