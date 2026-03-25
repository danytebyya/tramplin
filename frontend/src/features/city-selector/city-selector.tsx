import { useEffect, useRef, useState } from "react";

import { Input } from "../../shared/ui";
import { cn } from "../../shared/lib";
import { getCitySuggestions } from "./api";
import "./city-selector.css";

type CitySelectorProps = {
  value: string;
  className?: string;
  onChange: (city: string) => void;
};

export function CitySelector({ value, className, onChange }: CitySelectorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length > 0;

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const openSelector = () => {
    clearCloseTimeout();
    setIsOpen(true);
  };

  const closeSelector = () => {
    clearCloseTimeout();
    setIsPinned(false);
    setIsOpen(false);
  };

  const scheduleClose = () => {
    if (isPinned) {
      return;
    }

    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimeoutRef.current = null;
    }, 40);
  };

  useEffect(() => {
    let isActive = true;

    if (!hasQuery) {
      setSuggestions([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setHasError(false);

      void getCitySuggestions(normalizedQuery)
        .then((nextSuggestions) => {
          if (!isActive) {
            return;
          }

          setSuggestions(nextSuggestions);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }

          setHasError(true);
          setSuggestions([]);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }

          setIsLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [hasQuery, normalizedQuery]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeSelector();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSelector();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn("city-selector", className)}
      onMouseEnter={openSelector}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="header__location city-selector__trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          clearCloseTimeout();
          setIsPinned((currentPinned) => {
            const nextPinned = !currentPinned;
            setIsOpen(nextPinned);
            return nextPinned;
          });
        }}
      >
        <span className="header__location-icon" aria-hidden="true" />
        <span>{value}</span>
      </button>

      <div
        className={cn("city-selector__dropdown", !isOpen && "city-selector__dropdown--hidden")}
        role="dialog"
        aria-hidden={!isOpen}
      >
        <div className="city-selector__panel">
          <h2 className="city-selector__title">Найдите ваш город</h2>

          <div className="city-selector__search">
            <span className="city-selector__search-icon" aria-hidden="true" />
            <Input
              type="search"
              className="input--sm city-selector__search-input"
              placeholder="Поиск по городам"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="city-selector__list" role="listbox" aria-label="Список городов">
            {!hasQuery ? (
              <div className="city-selector__empty">Начните вводить название города.</div>
            ) : null}

            {hasQuery && isLoading ? (
              <div className="city-selector__empty">Ищем города...</div>
            ) : null}

            {hasQuery && !isLoading && hasError ? (
              <div className="city-selector__empty">Не удалось загрузить список городов.</div>
            ) : null}

            {hasQuery && !isLoading && !hasError && suggestions.length === 0 ? (
              <div className="city-selector__empty">Ничего не найдено.</div>
            ) : null}

            {hasQuery &&
              !isLoading &&
              !hasError &&
              suggestions.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  className={
                    city.name === value
                      ? "city-selector__option city-selector__option--active"
                      : "city-selector__option"
                  }
                  onClick={() => {
                    onChange(city.name);
                    setQuery("");
                    closeSelector();
                  }}
                >
                  <span className="city-selector__option-label">{city.name}</span>
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
