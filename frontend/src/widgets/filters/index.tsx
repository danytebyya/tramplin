import { SegmentedSwitch, Input } from "../../shared/ui";
import { opportunityViewOptions } from "../../entities/opportunity";
import "./filters.css";

type OpportunityFiltersProps = {
  viewMode: "map" | "list";
  onViewModeChange: (viewMode: "map" | "list") => void;
};

export function OpportunityFilters({ viewMode, onViewModeChange }: OpportunityFiltersProps) {
  return (
    <section className="opportunity-filters" aria-label="Переключение режима просмотра">
      <h2 className="opportunity-filters__title">
        Выберите <span className="opportunity-filters__title-accent">удобный</span> вариант просмотра
      </h2>

      <SegmentedSwitch
        ariaLabel="Выбор режима просмотра"
        className="opportunity-filters__switch"
        options={[...opportunityViewOptions]}
        value={viewMode}
        onChange={onViewModeChange}
      />

      <label className="opportunity-filters__search" aria-label="Поиск по возможностям">
        <Input
          placeholder="Поиск"
          className="opportunity-filters__search-input"
          clearable
        />
      </label>

      {viewMode === "list" ? (
        <div className="opportunity-filters__grid">
          <div>
            <div className="opportunity-filters__placeholder">
              <span>Поиск</span>
              <span className="opportunity-filters__placeholder-arrow">×</span>
            </div>
            <span className="opportunity-filters__reset">Сбросить</span>
          </div>
          <div>
            <div className="opportunity-filters__placeholder">
              <span>Сортировка</span>
              <span className="opportunity-filters__placeholder-arrow">⌄</span>
            </div>
            <span className="opportunity-filters__reset">Сбросить</span>
          </div>
          <div>
            <div className="opportunity-filters__placeholder">
              <span>Фильтры</span>
              <span className="opportunity-filters__placeholder-arrow">⌄</span>
            </div>
            <span className="opportunity-filters__reset">Сбросить</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
