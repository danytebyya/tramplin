import { SegmentedSwitch, Input } from "../../shared/ui";
import { opportunityViewOptions } from "../../entities/opportunity";
import "./filters.css";

type OpportunityFiltersProps = {
  viewMode: "map" | "list";
  isMapExpanded: boolean;
  onViewModeChange: (viewMode: "map" | "list") => void;
};

export function OpportunityFilters({ viewMode, isMapExpanded, onViewModeChange }: OpportunityFiltersProps) {
  const isListControlsVisible = viewMode === "list" && !isMapExpanded;

  return (
    <section className="opportunity-filters" aria-label="Фильтры возможностей">
      {!isMapExpanded ? (
        <div className="opportunity-filters__primary-group">
          <SegmentedSwitch
            ariaLabel="Выбор режима просмотра"
            className="opportunity-filters__switch"
            options={[...opportunityViewOptions]}
            value={viewMode}
            onChange={onViewModeChange}
          />
        </div>
      ) : null}

      <div
        className={
          isListControlsVisible
            ? "opportunity-filters__controls opportunity-filters__controls--list"
            : "opportunity-filters__controls opportunity-filters__controls--compact"
        }
      >
        <div className="opportunity-filters__search-group">
          <label className="opportunity-filters__search" aria-label="Поиск по возможностям">
            <Input
              placeholder="Поиск"
              className="input--secondary input--sm opportunity-filters__search-input"
              clearable
            />
          </label>
          <button
            type="button"
            className={
              isListControlsVisible
                ? "opportunity-filters__reset"
                : "opportunity-filters__reset opportunity-filters__reset--hidden"
            }
          >
            Сбросить
          </button>
        </div>

        <div
          className={
            isListControlsVisible
              ? "opportunity-filters__aux-group"
              : "opportunity-filters__aux-group opportunity-filters__aux-group--hidden"
          }
          aria-hidden={!isListControlsVisible}
        >
          <div className="opportunity-filters__aux-item">
            <button type="button" className="opportunity-filters__placeholder">
              <span>Сортировка</span>
              <span className="opportunity-filters__placeholder-arrow" aria-hidden="true" />
            </button>
            <button type="button" className="opportunity-filters__reset">
              Сбросить
            </button>
          </div>

          <div className="opportunity-filters__aux-item">
            <button type="button" className="opportunity-filters__placeholder">
              <span>Фильтры</span>
              <span className="opportunity-filters__placeholder-arrow" aria-hidden="true" />
            </button>
            <button type="button" className="opportunity-filters__reset">
              Сбросить
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
