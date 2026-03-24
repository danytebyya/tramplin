import { cn } from "../../lib";

type SegmentedSwitchOption<TValue extends string> = {
  label: string;
  value: TValue;
};

type SegmentedSwitchProps<TValue extends string> = {
  ariaLabel: string;
  className?: string;
  options: [SegmentedSwitchOption<TValue>, SegmentedSwitchOption<TValue>];
  value: TValue;
  onChange: (value: TValue) => void;
};

export function SegmentedSwitch<TValue extends string>({
  ariaLabel,
  className,
  options,
  value,
  onChange,
}: SegmentedSwitchProps<TValue>) {
  const activeOptionIndex = options.findIndex((option) => option.value === value);

  return (
    <div
      className={cn(
        "segmented-switch",
        activeOptionIndex === 1 ? "segmented-switch--second-active" : undefined,
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span className="segmented-switch__indicator" aria-hidden="true" />
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              "segmented-switch__option",
              isActive ? "segmented-switch__option--active" : undefined,
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
