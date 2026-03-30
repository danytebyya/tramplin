import { useNavigate } from "react-router-dom";

import "./back-navigation.css";

type BackNavigationProps = {
  fallbackTo?: string;
  className?: string;
};

export function BackNavigation({
  fallbackTo = "/",
  className = "",
}: BackNavigationProps) {
  const navigate = useNavigate();

  const handleBack = () => {
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
