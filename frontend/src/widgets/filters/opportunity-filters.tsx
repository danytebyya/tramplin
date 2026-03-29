import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Input, SegmentedSwitch } from "../../shared/ui";
import { opportunityViewOptions } from "../../entities/opportunity";
import "./filters.css";

type OpportunityFiltersProps = {
  viewMode: "map" | "list";
  isMapExpanded: boolean;
  onViewModeChange: (viewMode: "map" | "list") => void;
};

type FilterGroup = {
  id: string;
  title: string;
  items: string[];
};

const cityOptions = ["Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Чебоксары"];
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

const levelOptions = ["Стажер (без опыта)", "Junior", "Middle", "Senior"];
const formatOptions = ["Оффлайн", "Гибрид", "Удаленно"];
const employmentOptions = ["Full-time", "Part-time", "Проектная работа", "Стажировка"];
const publicationOptions = ["За все время", "За сегодня", "За 3 дня", "За неделю", "За месяц"];
const companyOptions = ["Только верифицированные компании", "Только с рейтингом 4,5 и выше"];
const eventTypeOptions = ["День открытых дверей", "Хакатон", "Лекция/воркшоп", "Конференция", "Карьерный день"];
const costOptions = ["Бесплатно", "Платно"];
const mentorExpertiseAreas = ["Языки программирования", "Фреймворки и библиотеки", "Базы данных", "DevOps и инструменты", "Дизайн", "Аналитика и Data Science", "Другое"];
const mentorOrganizers = ["Организатор 1 после поиска", "Организатор 2 после поиска"];
const mentorshipDirectionOptions = ["Карьерный рост", "Технические навыки", "Подготовка к собеседованиям", "Soft skills", "Code review"];
const mentorAvailabilityOptions = ["Сейчас свободен", "В течение недели"];
const mentorExperienceOptions = ["Junior+", "Middle+", "Senior"];

export function OpportunityFilters({ viewMode, isMapExpanded, onViewModeChange }: OpportunityFiltersProps) {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("Чебоксары");
  const [skillQuery, setSkillQuery] = useState("");
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    languages: true,
    frameworks: true,
    databases: true,
    devops: true,
    design: true,
    other: true,
    events: true,
    mentorship: true,
  });
  const [selectedLevels, setSelectedLevels] = useState<string[]>(["Стажер (без опыта)"]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["Оффлайн"]);
  const [selectedEmployment, setSelectedEmployment] = useState<string[]>(["Full-time"]);
  const [selectedPublication, setSelectedPublication] = useState<string[]>(["За все время"]);
  const [selectedCompanyOptions, setSelectedCompanyOptions] = useState<string[]>([
    "Только верифицированные компании",
    "Только с рейтингом 4,5 и выше",
  ]);
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

  const visibleCities = useMemo(() => {
    const normalizedQuery = cityQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return cityOptions;
    }

    return cityOptions.filter((city) => city.toLowerCase().includes(normalizedQuery));
  }, [cityQuery]);

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

  const toggleOption = (value: string, selectedValues: string[], setter: (values: string[]) => void) => {
    setter(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  };

  const resetAllFilters = () => {
    setCityQuery("");
    setSelectedCity("Чебоксары");
    setSkillQuery("");
    setSelectedLevels(["Стажер (без опыта)"]);
    setSelectedFormats(["Оффлайн"]);
    setSelectedEmployment(["Full-time"]);
    setSelectedPublication(["За все время"]);
    setSelectedCompanyOptions(["Только верифицированные компании", "Только с рейтингом 4,5 и выше"]);
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
              clearable
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
              <button type="button" className="opportunity-filters__simple-option">Сначала новые</button>
              <button type="button" className="opportunity-filters__simple-option">По зарплате</button>
              <button type="button" className="opportunity-filters__simple-option">По релевантности</button>
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
              <section className="opportunity-filters__panel-section">
                <div className="opportunity-filters__panel-head">
                  <h3 className="opportunity-filters__panel-title">Город</h3>
                </div>
                <label className="opportunity-filters__search opportunity-filters__search--panel" aria-label="Город">
                  <Input
                    placeholder="Город"
                    value={cityQuery}
                    onChange={(event) => setCityQuery(event.target.value)}
                    className="input--sm opportunity-filters__search-input"
                    clearable
                  />
                </label>
                <div className="opportunity-filters__city-list" role="listbox" aria-label="Список городов">
                  {visibleCities.map((city) => (
                    <button
                      key={city}
                      type="button"
                      className={
                        city === selectedCity
                          ? "opportunity-filters__city-option opportunity-filters__city-option--active"
                          : "opportunity-filters__city-option"
                      }
                      onClick={() => setSelectedCity(city)}
                    >
                      {city}
                    </button>
                  ))}
                </div>
                <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">
                  Сбросить
                </button>
              </section>

              <section className="opportunity-filters__panel-section">
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

              <section className="opportunity-filters__panel-section">
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

              <section className="opportunity-filters__panel-section">
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

                <div className="opportunity-filters__accordion-list">
                  {filteredSkillGroups.map((group) => {
                    const isExpanded = expandedGroups[group.id] ?? true;

                    return (
                      <article key={group.id} className="opportunity-filters__accordion-card">
                        <button
                          type="button"
                          className="opportunity-filters__accordion-head"
                          onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !isExpanded }))}
                        >
                          <span>{group.title}</span>
                          <span
                            className={
                              isExpanded
                                ? "opportunity-filters__placeholder-arrow opportunity-filters__placeholder-arrow--open"
                                : "opportunity-filters__placeholder-arrow"
                            }
                            aria-hidden="true"
                          />
                        </button>
                        {isExpanded ? (
                          <div className="opportunity-filters__chip-list opportunity-filters__chip-list--spaced">
                            {group.items.map((item) => (
                              <button key={`${group.id}-${item}`} type="button" className="opportunity-filters__chip">
                                {item}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="opportunity-filters__panel-section">
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
                        onChange={() => toggleOption(option, selectedLevels, setSelectedLevels)}
                      />
                      <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="opportunity-filters__panel-section">
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
                        onChange={() => toggleOption(option, selectedFormats, setSelectedFormats)}
                      />
                      <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="opportunity-filters__panel-section">
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
                        onChange={() => toggleOption(option, selectedEmployment, setSelectedEmployment)}
                      />
                      <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="opportunity-filters__panel-section">
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

              <section className="opportunity-filters__panel-section">
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

              <section className="opportunity-filters__panel-section">
                <div className="opportunity-filters__panel-head">
                  <h3 className="opportunity-filters__panel-title">Компания</h3>
                  <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                </div>
                <div className="opportunity-filters__checkbox-grid">
                  {companyOptions.map((option) => (
                    <label key={option} className="opportunity-filters__checkbox">
                      <input
                        type="checkbox"
                        checked={selectedCompanyOptions.includes(option)}
                        onChange={() => toggleOption(option, selectedCompanyOptions, setSelectedCompanyOptions)}
                      />
                      <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </section>

              <article className="opportunity-filters__accordion-card">
                <button
                  type="button"
                  className="opportunity-filters__accordion-head"
                  onClick={() => setExpandedGroups((current) => ({ ...current, events: !current.events }))}
                >
                  <span>Мероприятия</span>
                  <span
                    className={
                      expandedGroups.events
                        ? "opportunity-filters__placeholder-arrow opportunity-filters__placeholder-arrow--open"
                        : "opportunity-filters__placeholder-arrow"
                    }
                    aria-hidden="true"
                  />
                </button>
                {expandedGroups.events ? (
                  <div className="opportunity-filters__accordion-body">
                    <section className="opportunity-filters__panel-section">
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

                    <section className="opportunity-filters__panel-section">
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

                    <section className="opportunity-filters__panel-section">
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

                    <section className="opportunity-filters__panel-section">
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

                    <section className="opportunity-filters__panel-section">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Компания</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__checkbox-grid opportunity-filters__checkbox-grid--single">
                        {companyOptions.map((option) => (
                          <label key={`event-company-${option}`} className="opportunity-filters__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedCompanyOptions.includes(option)}
                              onChange={() => toggleOption(option, selectedCompanyOptions, setSelectedCompanyOptions)}
                            />
                            <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : null}
              </article>

              <article className="opportunity-filters__accordion-card">
                <button
                  type="button"
                  className="opportunity-filters__accordion-head"
                  onClick={() => setExpandedGroups((current) => ({ ...current, mentorship: !current.mentorship }))}
                >
                  <span>Менторские программы</span>
                  <span
                    className={
                      expandedGroups.mentorship
                        ? "opportunity-filters__placeholder-arrow opportunity-filters__placeholder-arrow--open"
                        : "opportunity-filters__placeholder-arrow"
                    }
                    aria-hidden="true"
                  />
                </button>
                {expandedGroups.mentorship ? (
                  <div className="opportunity-filters__accordion-body">
                    <section className="opportunity-filters__panel-section">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Область экспертизы</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__chip-list">
                        {mentorExpertiseAreas.map((item) => (
                          <button key={item} type="button" className="opportunity-filters__chip">{item}</button>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section">
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

                    <section className="opportunity-filters__panel-section">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Направление менторства</h3>
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

                    <section className="opportunity-filters__panel-section">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Доступность ментора</h3>
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

                    <section className="opportunity-filters__panel-section">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Опыт ментора</h3>
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

                    <section className="opportunity-filters__panel-section">
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

                    <section className="opportunity-filters__panel-section">
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

                    <section className="opportunity-filters__panel-section">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Дата проведения</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <Input
                        value={mentorDate}
                        onChange={(event) => setMentorDate(event.target.value)}
                        placeholder="00.00.0000"
                        className="input--sm"
                      />
                    </section>

                    <section className="opportunity-filters__panel-section">
                      <div className="opportunity-filters__panel-head">
                        <h3 className="opportunity-filters__panel-title">Компания</h3>
                        <button type="button" className="opportunity-filters__reset opportunity-filters__reset--inline">Сбросить</button>
                      </div>
                      <div className="opportunity-filters__checkbox-grid opportunity-filters__checkbox-grid--single">
                        {companyOptions.map((option) => (
                          <label key={`mentor-company-${option}`} className="opportunity-filters__checkbox">
                            <input
                              type="checkbox"
                              checked={selectedCompanyOptions.includes(option)}
                              onChange={() => toggleOption(option, selectedCompanyOptions, setSelectedCompanyOptions)}
                            />
                            <span className="opportunity-filters__checkbox-box" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : null}
              </article>

              <div className="opportunity-filters__footer">
                <Button type="button" variant="secondary" fullWidth>
                  Показать результаты
                </Button>
              </div>
              </div>
            </div>
          </div>
      </div>
    </section>
  );
}
