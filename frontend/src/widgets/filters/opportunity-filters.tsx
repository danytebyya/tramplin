import { useEffect, useMemo, useRef, useState } from "react";

import { Input, SegmentedSwitch } from "../../shared/ui";
import { opportunityViewOptions } from "../../entities/opportunity";
import "./filters.css";

export type OpportunityToolbarSort = "newest" | "salary_desc" | "relevance";

export type OpportunityToolbarFilters = {
  city: string;
  levels: string[];
  formats: string[];
  employment: string[];
  sort: OpportunityToolbarSort;
};

type OpportunityFiltersProps = {
  viewMode: "map" | "list";
  isMapExpanded: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filterValue?: OpportunityToolbarFilters;
  onFilterChange?: (value: OpportunityToolbarFilters) => void;
  onViewModeChange: (viewMode: "map" | "list") => void;
};

const defaultFilterValue: OpportunityToolbarFilters = {
  city: "",
  levels: [],
  formats: [],
  employment: [],
  sort: "newest",
};

type FilterGroup = {
  id: string;
  title: string;
  items: string[];
};

const popularTags = ["Python", "JavaScript", "React", "SQL", "Docker"];
const skillGroups: FilterGroup[] = [
  {
    id: "languages",
    title: "Языки программирования",
    items: ["JavaScript", "TypeScript", "PHP", "Ruby", "Swift", "Kotlin", "C", "C++", "Go", "Rust", "Python", "Java", "C#"],
  },
  {
    id: "frameworks",
    title: "Фреймворки и библиотеки",
    items: ["React", "Vue.js", "Angular", "Next.js", "Svelte", "Django", "Flask", "FastAPI", "Node.js", "Express", "Spring", "Laravel", ".NET", "ASP.NET"],
  },
  {
    id: "databases",
    title: "Базы данных",
    items: ["PostgreSQL", "MySQL", "Oracle", "MongoDB", "Redis", "Elasticsearch"],
  },
  {
    id: "devops",
    title: "DevOps и инструменты",
    items: ["Docker", "Kubernetes", "Jenkins", "CI/CD", "GitHub Actions", "GitLab CI", "AWS", "Azure", "Google Cloud", "Git", "GitHub", "GitLab"],
  },
  {
    id: "design",
    title: "Дизайн",
    items: ["Figma", "Adobe XD", "Sketch", "InVision", "Zeplin", "Pixso", "Taptop", "Adobe Photoshop", "Adobe Illustrator", "CorelDRAW", "AliveColors", "Balsamiq", "Miro", "Whimsical"],
  },
  {
    id: "other",
    title: "Другое",
    items: ["Scrum", "Agile", "Английский язык", "Project Management", "Product Management"],
  },
];

const levelOptions = ["Junior", "Middle", "Senior"];
const formatOptions = ["Офлайн", "Гибрид", "Удалённо"];
const employmentOptions = ["Полная занятость", "Частичная занятость", "Проектная работа", "Стажировка"];
const publicationOptions = ["За всё время", "За сегодня", "За 3 дня", "За неделю"];
const eventTypeOptions = ["День открытых дверей", "Хакатон", "Лекция/воркшоп", "Конференция", "Карьерный день"];
const costOptions = ["Бесплатно", "Платно"];
const mentorExpertiseAreas = ["Языки программирования", "Фреймворки и библиотеки", "Базы данных", "DevOps и инструменты", "Дизайн", "Аналитика и Data Science", "Другое"];
const mentorOrganizers = ["Организатор 1 после поиска", "Организатор 2 после поиска"];
const mentorshipDirectionOptions = ["Карьерный рост", "Технические навыки", "Подготовка к собеседованиям", "Soft skills", "Code review"];
const mentorAvailabilityOptions = ["Сейчас свободен", "В течение недели"];
const mentorExperienceOptions = ["Junior+", "Middle+", "Senior"];

export function OpportunityFilters({
  viewMode,
  isMapExpanded,
  searchValue = "",
  onSearchChange,
  filterValue = defaultFilterValue,
  onFilterChange = () => undefined,
  onViewModeChange,
}: OpportunityFiltersProps) {
  const [isVacanciesOpen, setIsVacanciesOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    languages: false,
    frameworks: false,
    databases: false,
    devops: false,
    design: false,
    other: false,
    events: false,
    mentorship: false,
  });
  const [selectedLevels, setSelectedLevels] = useState<string[]>(filterValue.levels);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(filterValue.formats);
  const [selectedEmployment, setSelectedEmployment] = useState<string[]>(filterValue.employment);
  const [selectedPublication, setSelectedPublication] = useState<string[]>(["За всё время"]);
  const [hideVacanciesOnMap, setHideVacanciesOnMap] = useState(false);
  const [radiusFrom, setRadiusFrom] = useState("0");
  const [radiusTo, setRadiusTo] = useState("50");
  const [salaryFrom, setSalaryFrom] = useState("");
  const [salaryTo, setSalaryTo] = useState("");
  const [eventCostFrom, setEventCostFrom] = useState("");
  const [eventCostTo, setEventCostTo] = useState("");
  const [mentorCostFrom, setMentorCostFrom] = useState("");
  const [mentorCostTo, setMentorCostTo] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [mentorDate, setMentorDate] = useState("");
  const [mentorOrganizerQuery, setMentorOrganizerQuery] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>(["День открытых дверей"]);
  const [selectedCosts, setSelectedCosts] = useState<string[]>(["Платно"]);
  const [selectedMentorDirections, setSelectedMentorDirections] = useState<string[]>(["Карьерный рост"]);
  const [selectedMentorAvailability, setSelectedMentorAvailability] = useState<string[]>(["Сейчас свободен"]);
  const [selectedMentorExperience, setSelectedMentorExperience] = useState<string[]>(["Junior+"]);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const sortRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (filtersRef.current && !filtersRef.current.contains(target)) {
        setIsFiltersOpen(false);
      }

      if (sortRef.current && !sortRef.current.contains(target)) {
        setIsSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSkillGroups = useMemo(() => {
    const normalizedQuery = skillQuery.trim().toLowerCase();
    const groupsToRender = showAllGroups ? skillGroups : skillGroups.slice(0, 3);

    if (!normalizedQuery) {
      return groupsToRender;
    }

    return groupsToRender
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.toLowerCase().includes(normalizedQuery)),
      }))
      .filter((group) => group.items.length > 0);
  }, [showAllGroups, skillQuery]);

  useEffect(() => {
    setSelectedLevels(filterValue.levels);
  }, [filterValue.levels]);

  useEffect(() => {
    setSelectedFormats(filterValue.formats);
  }, [filterValue.formats]);

  useEffect(() => {
    setSelectedEmployment(filterValue.employment);
  }, [filterValue.employment]);

  const toggleOption = (value: string, selectedValues: string[], setter: (values: string[]) => void) => {
    setter(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  };

  const resetAllFilters = () => {
    setCityQuery("");
    onFilterChange({
      ...filterValue,
      city: "",
      levels: [],
      formats: [],
      employment: [],
      sort: "newest",
    });
    setSkillQuery("");
    setSelectedLevels([]);
    setSelectedFormats([]);
    setSelectedEmployment([]);
    setSelectedPublication(["За всё время"]);
    setHideVacanciesOnMap(false);
    setRadiusFrom("0");
    setRadiusTo("50");
    setSalaryFrom("");
    setSalaryTo("");
    setEventCostFrom("");
    setEventCostTo("");
    setMentorCostFrom("");
    setMentorCostTo("");
    setEventDate("");
    setMentorDate("");
    setMentorOrganizerQuery("");
    setSelectedEventTypes(["День открытых дверей"]);
    setSelectedCosts(["Платно"]);
    setSelectedMentorDirections(["Карьерный рост"]);
    setSelectedMentorAvailability(["Сейчас свободен"]);
    setSelectedMentorExperience(["Junior+"]);
  };

  const handleSortSelect = (sort: OpportunityToolbarSort) => {
    onFilterChange({ ...filterValue, sort });
    setIsSortOpen(false);
  };

  const handleCitySelect = (city: string) => {
    setCityQuery(city);
    onFilterChange({ ...filterValue, city });
  };

  const handleCityInputChange = (value: string) => {
    setCityQuery(value);
    onFilterChange({ ...filterValue, city: value });
  };

  const handleLevelsChange = (option: string) => {
    const nextValues = selectedLevels.includes(option)
      ? selectedLevels.filter((item) => item !== option)
      : [...selectedLevels, option];
    setSelectedLevels(nextValues);
    onFilterChange({ ...filterValue, levels: nextValues });
  };

  const handleFormatsChange = (option: string) => {
    const nextValues = selectedFormats.includes(option)
      ? selectedFormats.filter((item) => item !== option)
      : [...selectedFormats, option];
    setSelectedFormats(nextValues);
    onFilterChange({ ...filterValue, formats: nextValues });
  };

  const handleEmploymentChange = (option: string) => {
    const nextValues = selectedEmployment.includes(option)
      ? selectedEmployment.filter((item) => item !== option)
      : [...selectedEmployment, option];
    setSelectedEmployment(nextValues);
    onFilterChange({ ...filterValue, employment: nextValues });
  };

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
          viewMode === "list"
            ? "opportunity-filters__toolbar"
            : "opportunity-filters__toolbar opportunity-filters__toolbar--map"
        }
      >
        <div
          className={
            viewMode === "list"
              ? "opportunity-filters__search-group"
              : "opportunity-filters__search-group opportunity-filters__search-group--expanded"
          }
        >
          <label className="opportunity-filters__search" aria-label="Поиск по возможностям">
            <Input
              placeholder="Поиск"
              className="input--secondary input--sm opportunity-filters__search-input"
              value={searchValue}
              clearable
              onChange={(event) => onSearchChange?.(event.target.value)}
            />
          </label>
        </div>

        <div
          className={
            viewMode === "list"
              ? "opportunity-filters__actions"
              : "opportunity-filters__actions opportunity-filters__actions--hidden"
          }
          aria-hidden={viewMode !== "list"}
        >
            <div ref={sortRef} className="opportunity-filters__dropdown-shell">
              <button
                type="button"
              className="opportunity-filters__placeholder"
              onClick={() => setIsSortOpen((current) => !current)}
            >
              <span>Сортировка</span>
              <span
                className={
                  isSortOpen
                    ? "opportunity-filters__placeholder-arrow opportunity-filters__placeholder-arrow--open"
                    : "opportunity-filters__placeholder-arrow"
                }
                aria-hidden="true"
              />
            </button>
            <button type="button" className="opportunity-filters__reset">
              Сбросить
            </button>
            <div
              className={
                isSortOpen
                  ? "opportunity-filters__popover opportunity-filters__popover--compact"
                  : "opportunity-filters__popover opportunity-filters__popover--compact opportunity-filters__popover--hidden"
              }
            >
              <button type="button" className="opportunity-filters__simple-option" onClick={() => handleSortSelect("newest")}>Сначала новые</button>
              <button type="button" className="opportunity-filters__simple-option" onClick={() => handleSortSelect("salary_desc")}>По зарплате</button>
              <button type="button" className="opportunity-filters__simple-option" onClick={() => handleSortSelect("relevance")}>По релевантности</button>
            </div>
          </div>

          <div ref={filtersRef} className="opportunity-filters__dropdown-shell">
            <button
              type="button"
              className="opportunity-filters__placeholder"
              onClick={() => setIsFiltersOpen((current) => !current)}
            >
              <span>Фильтры</span>
              <span
                className={
                  isFiltersOpen
                    ? "opportunity-filters__placeholder-arrow opportunity-filters__placeholder-arrow--open"
                    : "opportunity-filters__placeholder-arrow"
                }
                aria-hidden="true"
              />
            </button>
            <button type="button" className="opportunity-filters__reset" onClick={resetAllFilters}>
              Сбросить
            </button>

            <div
              className={
                isFiltersOpen
                  ? "opportunity-filters__popover"
                  : "opportunity-filters__popover opportunity-filters__popover--hidden"
              }
            >
              <div className="opportunity-filters__group">
                <div className="opportunity-filters__group-menu">
                  <button
                    type="button"
                    className="opportunity-filters__group-trigger"
                    onClick={() => setIsVacanciesOpen((current) => !current)}
                  >
                    <span className="opportunity-filters__group-title">Вакансии и стажировки</span>
                    <span
                      className={
                        isVacanciesOpen
                          ? "opportunity-filters__placeholder-arrow opportunity-filters__group-arrow opportunity-filters__placeholder-arrow--open"
                          : "opportunity-filters__placeholder-arrow opportunity-filters__group-arrow"
                      }
                      aria-hidden="true"
                    />
                  </button>
                  <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline" onClick={resetAllFilters}>
                    Сбросить
                  </button>
                </div>
                <div
                  className={
                    isVacanciesOpen
                      ? "opportunity-filters__group-panel"
                      : "opportunity-filters__group-panel opportunity-filters__group-panel--hidden"
                  }
                >
                  <section className="opportunity-filters__panel-section">
                    <div className="opportunity-filters__panel-head">
                      <h3 className="opportunity-filters__panel-title">Город</h3>
                    </div>
                    <label className="opportunity-filters__search opportunity-filters__search--panel" aria-label="Город">
                      <Input
                        placeholder="Город"
                        value={cityQuery || filterValue.city}
                        onChange={(event) => handleCityInputChange(event.target.value)}
                        className="input--sm opportunity-filters__search-input"
                        clearable
                      />
                    </label>
                    <button
                      type="button"
                      className="opportunity-filters__reset opportunity-filters__reset--inline"
                      onClick={() => handleCitySelect("")}
                    >
                      Сбросить
                    </button>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    <div className="opportunity-filters__panel-head">
                      <h3 className="opportunity-filters__panel-title">Радиус поиска, км</h3>
                      <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                    </div>
                    <label className="opportunity-filters__search opportunity-filters__search--panel" aria-label="Адрес поиска">
                      <Input
                        placeholder="Улица и номер дома"
                        className="input--sm opportunity-filters__search-input"
                        clearable
                      />
                    </label>
                    <div className="opportunity-filters__range-inputs">
                      <Input value={radiusFrom} onChange={(event) => setRadiusFrom(event.target.value)} placeholder="От" className="input--sm" />
                      <Input value={radiusTo} onChange={(event) => setRadiusTo(event.target.value)} placeholder="До" className="input--sm" />
                    </div>
                    <div className="opportunity-filters__dual-range" aria-hidden="true">
                      <span className="opportunity-filters__dual-range-track" />
                      <span className="opportunity-filters__dual-range-fill" />
                      <span className="opportunity-filters__dual-range-thumb opportunity-filters__dual-range-thumb--start" />
                      <span className="opportunity-filters__dual-range-thumb opportunity-filters__dual-range-thumb--end" />
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    <div className="opportunity-filters__panel-head">
                      <h3 className="opportunity-filters__panel-title">Отображение</h3>
                      <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                    </div>
                    <label className="opportunity-filters__checkbox">
                      <input
                        type="checkbox"
                        checked={hideVacanciesOnMap}
                        onChange={(event) => setHideVacanciesOnMap(event.target.checked)}
                      />
                      <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                      <span>Не отображать на карте вакансии и стажировки</span>
                    </label>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    <div className="opportunity-filters__panel-head">
                      <h3 className="opportunity-filters__panel-title">Навыки (Стек)</h3>
                      <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                    </div>
                    <label className="opportunity-filters__search opportunity-filters__search--panel" aria-label="Поиск навыка">
                      <Input
                        placeholder="Поиск навыка"
                        value={skillQuery}
                        onChange={(event) => setSkillQuery(event.target.value)}
                        className="input--sm opportunity-filters__search-input"
                        clearable
                      />
                    </label>
                    <div className="opportunity-filters__tag-card">
                      <div className="opportunity-filters__tag-card-title">Популярные</div>
                      <div className="opportunity-filters__chip-list">
                        {popularTags.map((tag) => (
                          <button key={tag} type="button" className="opportunity-filters__chip">
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="opportunity-filters__toggle-link"
                      onClick={() => setShowAllGroups((current) => !current)}
                    >
                      {showAllGroups ? "Скрыть" : "Показать все"}
                    </button>

                    <div className="opportunity-filters__grouped-list">
                      {filteredSkillGroups.map((group) => (
                        <div key={group.id} className="opportunity-filters__subsection">
                          <p className="opportunity-filters__subsection-title">{group.title}</p>
                          <div className="opportunity-filters__chip-list opportunity-filters__chip-list--spaced">
                            {group.items.map((item) => (
                              <button key={`${group.id}-${item}`} type="button" className="opportunity-filters__chip">
                                {item}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    <div className="opportunity-filters__panel-head">
                      <h3 className="opportunity-filters__panel-title">Уровень</h3>
                      <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                    </div>
                    <div className="opportunity-filters__checkbox-grid">
                      {levelOptions.map((option) => (
                        <label key={option} className="opportunity-filters__checkbox">
                          <input
                            type="checkbox"
                            checked={selectedLevels.includes(option)}
                            onChange={() => handleLevelsChange(option)}
                          />
                          <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    <div className="opportunity-filters__panel-head">
                      <h3 className="opportunity-filters__panel-title">Формат</h3>
                      <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                    </div>
                    <div className="opportunity-filters__checkbox-grid">
                      {formatOptions.map((option) => (
                        <label key={option} className="opportunity-filters__checkbox">
                          <input
                            type="checkbox"
                            checked={selectedFormats.includes(option)}
                            onChange={() => handleFormatsChange(option)}
                          />
                          <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    <div className="opportunity-filters__panel-head">
                      <h3 className="opportunity-filters__panel-title">Занятость</h3>
                      <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                    </div>
                    <div className="opportunity-filters__checkbox-grid">
                      {employmentOptions.map((option) => (
                        <label key={option} className="opportunity-filters__checkbox">
                          <input
                            type="checkbox"
                            checked={selectedEmployment.includes(option)}
                            onChange={() => handleEmploymentChange(option)}
                          />
                          <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    <div className="opportunity-filters__panel-head">
                      <h3 className="opportunity-filters__panel-title">Зарплата</h3>
                      <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                    </div>
                    <div className="opportunity-filters__range-inputs">
                      <Input value={salaryFrom} onChange={(event) => setSalaryFrom(event.target.value)} placeholder="От" className="input--sm" />
                      <Input value={salaryTo} onChange={(event) => setSalaryTo(event.target.value)} placeholder="До" className="input--sm" />
                    </div>
                    <div className="opportunity-filters__dual-range" aria-hidden="true">
                      <span className="opportunity-filters__dual-range-track" />
                      <span className="opportunity-filters__dual-range-fill" />
                      <span className="opportunity-filters__dual-range-thumb opportunity-filters__dual-range-thumb--start" />
                      <span className="opportunity-filters__dual-range-thumb opportunity-filters__dual-range-thumb--end" />
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    <div className="opportunity-filters__panel-head">
                      <h3 className="opportunity-filters__panel-title">Дата публикации</h3>
                      <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                    </div>
                    <div className="opportunity-filters__checkbox-grid">
                      {publicationOptions.map((option) => (
                        <label key={option} className="opportunity-filters__checkbox">
                          <input
                            type="checkbox"
                            checked={selectedPublication.includes(option)}
                            onChange={() => toggleOption(option, selectedPublication, setSelectedPublication)}
                          />
                          <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              <article className="opportunity-filters__accordion-card">
                <div className="opportunity-filters__group-menu">
                  <button
                    type="button"
                    className="opportunity-filters__group-trigger"
                    onClick={() => setExpandedGroups((current) => ({ ...current, events: !current.events }))}
                  >
                    <span className="opportunity-filters__group-title">Мероприятия</span>
                    <span
                      className={
                        expandedGroups.events
                          ? "opportunity-filters__placeholder-arrow opportunity-filters__group-arrow opportunity-filters__placeholder-arrow--open"
                          : "opportunity-filters__placeholder-arrow opportunity-filters__group-arrow"
                      }
                      aria-hidden="true"
                    />
                  </button>
                  <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">
                    Сбросить
                  </button>
                </div>
                {expandedGroups.events ? (
                  <div className="opportunity-filters__accordion-body">
                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Тип</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__checkbox-grid opportunity-filters__checkbox-grid--single">
                        {eventTypeOptions.map((option) => (
                          <label key={option} className="opportunity-filters__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedEventTypes.includes(option)}
                              onChange={() => toggleOption(option, selectedEventTypes, setSelectedEventTypes)}
                            />
                            <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Формат</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__checkbox-grid">
                        {formatOptions.map((option) => (
                          <label key={`event-${option}`} className="opportunity-filters__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedFormats.includes(option)}
                              onChange={() => toggleOption(option, selectedFormats, setSelectedFormats)}
                            />
                            <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Стоимость</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__checkbox-grid">
                        {costOptions.map((option) => (
                          <label key={`event-cost-${option}`} className="opportunity-filters__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedCosts.includes(option)}
                              onChange={() => toggleOption(option, selectedCosts, setSelectedCosts)}
                            />
                            <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                      <div className="opportunity-filters__range-inputs">
                        <Input value={eventCostFrom} onChange={(event) => setEventCostFrom(event.target.value)} placeholder="От" className="input--sm" />
                        <Input value={eventCostTo} onChange={(event) => setEventCostTo(event.target.value)} placeholder="До" className="input--sm" />
                      </div>
                      <div className="opportunity-filters__dual-range" aria-hidden="true">
                        <span className="opportunity-filters__dual-range-track" />
                        <span className="opportunity-filters__dual-range-fill" />
                        <span className="opportunity-filters__dual-range-thumb opportunity-filters__dual-range-thumb--start" />
                        <span className="opportunity-filters__dual-range-thumb opportunity-filters__dual-range-thumb--end" />
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Дата проведения</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <Input
                        value={eventDate}
                        onChange={(event) => setEventDate(event.target.value)}
                        placeholder="00.00.0000"
                        className="input--sm"
                      />
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Организатор</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <label className="opportunity-filters__search opportunity-filters__search--panel" aria-label="Поиск организатора">
                        <Input
                          placeholder="Поиск"
                          value={mentorOrganizerQuery}
                          onChange={(event) => setMentorOrganizerQuery(event.target.value)}
                          className="input--sm opportunity-filters__search-input"
                          clearable
                        />
                      </label>
                      <div className="opportunity-filters__chip-list">
                        {mentorOrganizers.map((item) => (
                          <button key={`event-organizer-${item}`} type="button" className="opportunity-filters__chip">{item}</button>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : null}
              </article>

              <article className="opportunity-filters__accordion-card">
                <div className="opportunity-filters__group-menu">
                  <button
                    type="button"
                    className="opportunity-filters__group-trigger"
                    onClick={() => setExpandedGroups((current) => ({ ...current, mentorship: !current.mentorship }))}
                  >
                    <span className="opportunity-filters__group-title">Менторские программы</span>
                    <span
                      className={
                        expandedGroups.mentorship
                          ? "opportunity-filters__placeholder-arrow opportunity-filters__group-arrow opportunity-filters__placeholder-arrow--open"
                          : "opportunity-filters__placeholder-arrow opportunity-filters__group-arrow"
                      }
                      aria-hidden="true"
                    />
                  </button>
                  <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">
                    Сбросить
                  </button>
                </div>
                {expandedGroups.mentorship ? (
                  <div className="opportunity-filters__accordion-body">
                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Навыки (Экспертиза)</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__chip-list">
                        {mentorExpertiseAreas.map((item) => (
                          <button key={item} type="button" className="opportunity-filters__chip">{item}</button>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Организатор</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <label className="opportunity-filters__search opportunity-filters__search--panel" aria-label="Поиск организатора">
                        <Input
                          placeholder="Поиск"
                          value={mentorOrganizerQuery}
                          onChange={(event) => setMentorOrganizerQuery(event.target.value)}
                          className="input--sm opportunity-filters__search-input"
                          clearable
                        />
                      </label>
                      <div className="opportunity-filters__chip-list">
                        {mentorOrganizers.map((item) => (
                          <button key={item} type="button" className="opportunity-filters__chip">{item}</button>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Направление</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__checkbox-grid">
                        {mentorshipDirectionOptions.map((option) => (
                          <label key={option} className="opportunity-filters__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedMentorDirections.includes(option)}
                              onChange={() => toggleOption(option, selectedMentorDirections, setSelectedMentorDirections)}
                            />
                            <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Доступность</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__checkbox-grid opportunity-filters__checkbox-grid--single">
                        {mentorAvailabilityOptions.map((option) => (
                          <label key={option} className="opportunity-filters__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedMentorAvailability.includes(option)}
                              onChange={() => toggleOption(option, selectedMentorAvailability, setSelectedMentorAvailability)}
                            />
                            <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Опыт</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__checkbox-grid">
                        {mentorExperienceOptions.map((option) => (
                          <label key={option} className="opportunity-filters__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedMentorExperience.includes(option)}
                              onChange={() => toggleOption(option, selectedMentorExperience, setSelectedMentorExperience)}
                            />
                            <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Стоимость</h3>
                        <span className="opportunity-filters__panel-note">₽/час</span>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__range-inputs">
                        <Input value={mentorCostFrom} onChange={(event) => setMentorCostFrom(event.target.value)} placeholder="От" className="input--sm" />
                        <Input value={mentorCostTo} onChange={(event) => setMentorCostTo(event.target.value)} placeholder="До" className="input--sm" />
                      </div>
                      <div className="opportunity-filters__dual-range" aria-hidden="true">
                        <span className="opportunity-filters__dual-range-track" />
                        <span className="opportunity-filters__dual-range-fill" />
                        <span className="opportunity-filters__dual-range-thumb opportunity-filters__dual-range-thumb--start" />
                        <span className="opportunity-filters__dual-range-thumb opportunity-filters__dual-range-thumb--end" />
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Формат</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__checkbox-grid">
                        {formatOptions.map((option) => (
                          <label key={`mentor-${option}`} className="opportunity-filters__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedFormats.includes(option)}
                              onChange={() => toggleOption(option, selectedFormats, setSelectedFormats)}
                            />
                            <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Дата</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <Input
                        value={mentorDate}
                        onChange={(event) => setMentorDate(event.target.value)}
                        placeholder="00.00.0000"
                        className="input--sm"
                      />
                    </section>

                  </div>
                ) : null}
              </article>
              </div>
            </div>
          </div>
      </div>
    </section>
  );
}
