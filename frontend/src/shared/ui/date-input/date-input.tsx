import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib";

type DateInputProps = {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  variant?: "primary" | "secondary" | "accent";
};

const WEEKDAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTH_LABELS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

type CalendarCell = {
  isoValue: string;
  label: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isWeekend: boolean;
  isDisabled: boolean;
};

function formatDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatIsoDate(date: Date) {
  return [
    date.getFullYear(),
    formatDatePart(date.getMonth() + 1),
    formatDatePart(date.getDate()),
  ].join("-");
}

function formatDisplayValue(isoValue: string) {
  if (!isoValue) {
    return "";
  }

  const [year, month, day] = isoValue.split("-");

  if (!year || !month || !day) {
    return "";
  }

  return `${day}.${month}.${year}`;
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseDisplayDate(value: string) {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    return null;
  }

  const [day, month, year] = value.split(".").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return formatIsoDate(date);
}

function maskDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isOutsideRange(isoValue: string, min?: string, max?: string) {
  if (min && isoValue < min) {
    return true;
  }

  if (max && isoValue > max) {
    return true;
  }

  return false;
}

function buildCalendarCells(
  visibleMonth: Date,
  selectedValue: string,
  min?: string,
  max?: string,
) {
  const firstDay = startOfMonth(visibleMonth);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);

  gridStart.setDate(firstDay.getDate() - firstWeekday);

  const todayValue = formatIsoDate(new Date());
  const items: CalendarCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);

    current.setDate(gridStart.getDate() + index);

    const isoValue = formatIsoDate(current);
    const dayOfWeek = (current.getDay() + 6) % 7;

    items.push({
      isoValue,
      label: current.getDate(),
      isCurrentMonth: current.getMonth() === visibleMonth.getMonth(),
      isToday: isoValue === todayValue,
      isSelected: isoValue === selectedValue,
      isWeekend: dayOfWeek >= 5,
      isDisabled: isOutsideRange(isoValue, min, max),
    });
  }

  return items;
}

export function DateInput({
  value = "",
  onChange,
  className,
  placeholder = "00.00.0000",
  disabled = false,
  min,
  max,
  variant = "primary",
}: DateInputProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [draftValue, setDraftValue] = useState(() => formatDisplayValue(value));
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => selectedDate ?? new Date());

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(formatDisplayValue(value));
    }
  }, [isFocused, value]);

  useEffect(() => {
    if (selectedDate) {
      setVisibleMonth(startOfMonth(selectedDate));
      return;
    }

    setVisibleMonth(startOfMonth(new Date()));
  }, [selectedDate?.getFullYear(), selectedDate?.getMonth()]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

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
  }, [isOpen]);

  const calendarCells = useMemo(
    () => buildCalendarCells(visibleMonth, value, min, max),
    [max, min, value, visibleMonth],
  );

  const handleInputChange = (nextValue: string) => {
    const maskedValue = maskDateInput(nextValue);

    setDraftValue(maskedValue);

    if (maskedValue.length === 0) {
      onChange?.("");
      return;
    }

    const parsedValue = parseDisplayDate(maskedValue);

    if (parsedValue && !isOutsideRange(parsedValue, min, max)) {
      onChange?.(parsedValue);
    }
  };

  const handleDateSelect = (isoValue: string) => {
    if (isOutsideRange(isoValue, min, max)) {
      return;
    }

    onChange?.(isoValue);
    setDraftValue(formatDisplayValue(isoValue));
    setVisibleMonth(startOfMonth(parseIsoDate(isoValue) ?? new Date()));
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "date-input",
        `date-input--${variant}`,
        className,
        isOpen ? "date-input--open" : undefined,
      )}
    >
      <div className="date-input__control">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="date-input__field"
          value={draftValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => {
            setIsFocused(true);
            setIsOpen(true);
          }}
          onBlur={() => {
            setIsFocused(false);
            setDraftValue(formatDisplayValue(value));
          }}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          className="date-input__trigger"
          aria-label="Открыть календарь"
          aria-expanded={isOpen}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setIsOpen((current) => !current);
            inputRef.current?.focus();
          }}
        >
          <span aria-hidden="true" className="date-input__trigger-icon" />
        </button>
      </div>

      {isOpen ? (
        <div className="date-input__popover">
          <div className="date-input__calendar">
            <div className="date-input__calendar-header">
              <button
                type="button"
                className="date-input__calendar-nav date-input__calendar-nav--prev"
                aria-label="Предыдущий месяц"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              />
              <div className="date-input__calendar-month">
                {MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
              </div>
              <button
                type="button"
                className="date-input__calendar-nav date-input__calendar-nav--next"
                aria-label="Следующий месяц"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              />
            </div>

            <div className="date-input__calendar-grid date-input__calendar-grid--weekdays">
              {WEEKDAY_LABELS.map((item, index) => (
                <span
                  key={item}
                  className={cn(
                    "date-input__calendar-weekday",
                    index >= 5 ? "date-input__calendar-weekday--weekend" : undefined,
                  )}
                >
                  {item}
                </span>
              ))}
            </div>

            <div className="date-input__calendar-grid">
              {calendarCells.map((item) => (
                <button
                  key={item.isoValue}
                  type="button"
                  className={cn(
                    "date-input__calendar-day",
                    !item.isCurrentMonth ? "date-input__calendar-day--outside" : undefined,
                    item.isWeekend ? "date-input__calendar-day--weekend" : undefined,
                    item.isToday ? "date-input__calendar-day--today" : undefined,
                    item.isSelected ? "date-input__calendar-day--selected" : undefined,
                    item.isDisabled ? "date-input__calendar-day--disabled" : undefined,
                  )}
                  disabled={item.isDisabled}
                  onClick={() => handleDateSelect(item.isoValue)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
