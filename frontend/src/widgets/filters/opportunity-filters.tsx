import { useEffect, useMemo, useRef, useState } from "react";

import "../../features/city-selector/city-selector.css";
import { Input, SegmentedSwitch } from "../../shared/ui";
import { opportunityViewOptions } from "../../entities/opportunity";
import {
  getAddressSuggestions,
  getCitySuggestions,
  type AddressSuggestion,
  type CitySuggestion,
} from "../../features/city-selector/api";
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
  roleName?: string;
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

function normalizeFilterText(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

export function OpportunityFilters({
  viewMode,
  isMapExpanded,
  roleName,
  searchValue = "",
  onSearchChange,
  filterValue = defaultFilterValue,
  onFilterChange = () => undefined,
  onViewModeChange,
}: OpportunityFiltersProps) {
  const themeVariant = roleName === "applicant" ? "secondary" : roleName === "curator" || roleName === "admin" ? "accent" : "primary";
  const badgeThemeVariant = roleName === "applicant" ? "secondary" : roleName === "curator" || roleName === "admin" ? "info" : "primary";
  const filterThemeClassName = `opportunity-filters--${themeVariant}`;
  const [isVacanciesOpen, setIsVacanciesOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [vacancyAddress, setVacancyAddress] = useState("");
  const [selectedVacancyAddressLabel, setSelectedVacancyAddressLabel] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
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
  const [selectedVacancySkills, setSelectedVacancySkills] = useState<string[]>([]);
  const [selectedEventOrganizers, setSelectedEventOrganizers] = useState<string[]>([]);
  const [selectedMentorExpertiseItems, setSelectedMentorExpertiseItems] = useState<string[]>([]);
  const [selectedMentorOrganizers, setSelectedMentorOrganizers] = useState<string[]>([]);
  const [vacancyCitySuggestions, setVacancyCitySuggestions] = useState<CitySuggestion[]>([]);
  const [isVacancyCityLoading, setIsVacancyCityLoading] = useState(false);
  const [hasVacancyCityError, setHasVacancyCityError] = useState(false);
  const [vacancyAddressSuggestions, setVacancyAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isVacancyAddressLoading, setIsVacancyAddressLoading] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const sortRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isFiltersOpen && !isSortOpen) {
      return;
    }

    const spacing = 24;
    const dropdownOffset = 10;

    const updatePopoverMaxHeight = (element: HTMLDivElement | null) => {
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const availableHeight = Math.max(window.innerHeight - rect.bottom - dropdownOffset - spacing, 220);
      element.style.setProperty("--opportunity-filters-popover-max-height", `${availableHeight}px`);
    };

    const syncPopoverBounds = () => {
      if (isFiltersOpen) {
        updatePopoverMaxHeight(filtersRef.current);
      }

      if (isSortOpen) {
        updatePopoverMaxHeight(sortRef.current);
      }
    };

    syncPopoverBounds();

    const handleViewportChange = () => {
      window.requestAnimationFrame(syncPopoverBounds);
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, { passive: true });

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange);
    };
  }, [isFiltersOpen, isSortOpen]);

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
    const groupsToRender = skillGroups;

    if (!normalizedQuery) {
      return groupsToRender;
    }

    return groupsToRender
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.toLowerCase().includes(normalizedQuery)),
      }))
      .filter((group) => group.items.length > 0);
  }, [skillQuery]);

  useEffect(() => {
    setSelectedLevels(filterValue.levels);
  }, [filterValue.levels]);

  useEffect(() => {
    setSelectedFormats(filterValue.formats);
  }, [filterValue.formats]);

  useEffect(() => {
    setSelectedEmployment(filterValue.employment);
  }, [filterValue.employment]);

  useEffect(() => {
    setCityQuery(filterValue.city);
  }, [filterValue.city]);

  useEffect(() => {
    let isActive = true;
    const normalizedQuery = cityQuery.trim();

    if (!normalizedQuery) {
      setVacancyCitySuggestions([]);
      setIsVacancyCityLoading(false);
      setHasVacancyCityError(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsVacancyCityLoading(true);
      setHasVacancyCityError(false);
      void getCitySuggestions(normalizedQuery)
        .then((items) => {
          if (!isActive) {
            return;
          }

          setVacancyCitySuggestions(items);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }

          setHasVacancyCityError(true);
          setVacancyCitySuggestions([]);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }

          setIsVacancyCityLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [cityQuery]);

  useEffect(() => {
    let isActive = true;
    const normalizedQuery = vacancyAddress.trim();
    const selectedCity = cityQuery.trim() || filterValue.city.trim();

    if (!normalizedQuery || !selectedCity) {
      setVacancyAddressSuggestions([]);
      setIsVacancyAddressLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsVacancyAddressLoading(true);
      void getAddressSuggestions(normalizedQuery, selectedCity)
        .then((items) => {
          if (!isActive) {
            return;
          }

          setVacancyAddressSuggestions(items);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }

          setVacancyAddressSuggestions([]);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }

          setIsVacancyAddressLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [cityQuery, filterValue.city, vacancyAddress]);

  const toggleOption = (value: string, selectedValues: string[], setter: (values: string[]) => void) => {
    setter(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  };

  const renderChip = (
    item: string,
    selectedItems: string[],
    setSelectedItems: (values: string[]) => void,
    key?: string,
  ) => (
    <button
      key={key ?? item}
      type="button"
      className={
        selectedItems.includes(item)
          ? `badge badge--${badgeThemeVariant} opportunity-filters__chip opportunity-filters__chip--active`
          : `badge badge--${badgeThemeVariant} opportunity-filters__chip`
      }
      onClick={() => toggleOption(item, selectedItems, setSelectedItems)}
    >
      <span className="badge__label">{item}</span>
    </button>
  );

  const renderSelectedChip = (
    item: string,
    selectedItems: string[],
    setSelectedItems: (values: string[]) => void,
    key?: string,
  ) => (
    <button
      key={key ?? item}
      type="button"
      className={`badge badge--${badgeThemeVariant} opportunity-filters__chip opportunity-filters__chip--active`}
      onClick={() => toggleOption(item, selectedItems, setSelectedItems)}
    >
      <span className="badge__label">
        <span>{item}</span>
        <span className="opportunity-filters__chip-remove" aria-hidden="true" />
      </span>
    </button>
  );

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
    setSelectedVacancySkills([]);
    setSelectedEventOrganizers([]);
    setSelectedMentorExpertiseItems([]);
    setSelectedMentorOrganizers([]);
  };

  const resetVacancyFilters = () => {
    setCityQuery("");
    setVacancyAddress("");
    setSelectedVacancyAddressLabel("");
    setVacancyCitySuggestions([]);
    setVacancyAddressSuggestions([]);
    onFilterChange({
      ...filterValue,
      city: "",
      levels: [],
      formats: [],
      employment: [],
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
    setSelectedVacancySkills([]);
  };

  const resetEventFilters = () => {
    setSelectedFormats([]);
    onFilterChange({ ...filterValue, formats: [] });
    setSelectedEventTypes(["День открытых дверей"]);
    setSelectedCosts(["Платно"]);
    setEventCostFrom("");
    setEventCostTo("");
    setEventDate("");
    setMentorOrganizerQuery("");
    setSelectedEventOrganizers([]);
  };

  const resetMentorshipFilters = () => {
    setSelectedFormats([]);
    onFilterChange({ ...filterValue, formats: [] });
    setMentorOrganizerQuery("");
    setMentorCostFrom("");
    setMentorCostTo("");
    setMentorDate("");
    setSelectedMentorDirections(["Карьерный рост"]);
    setSelectedMentorAvailability(["Сейчас свободен"]);
    setSelectedMentorExperience(["Junior+"]);
    setSelectedMentorExpertiseItems([]);
    setSelectedMentorOrganizers([]);
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

  const renderPanelHead = (title: string, onReset: () => void, note?: string) => (
    <div className="opportunity-filters__panel-head">
      <div className="opportunity-filters__panel-heading">
        <div className="opportunity-filters__panel-title-row">
          <h3 className="opportunity-filters__panel-title">{title}</h3>
          {note ? <span className="opportunity-filters__panel-note">{note}</span> : null}
        </div>
        <button type="button" className="opportunity-filters__panel-reset" onClick={onReset}>
          Сбросить
        </button>
      </div>
    </div>
  );

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
    <section className={`opportunity-filters ${filterThemeClassName}`.trim()} aria-label="Фильтры возможностей">
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
              className={
                isSortOpen
                  ? "opportunity-filters__placeholder opportunity-filters__placeholder--active"
                  : "opportunity-filters__placeholder"
              }
              onClick={() => setIsSortOpen((current) => !current)}
            >
              <span>Сортировка</span>
              <span
                className={
                  isSortOpen
                    ? "opportunity-filters__placeholder-toggle opportunity-filters__placeholder-toggle--open"
                    : "opportunity-filters__placeholder-toggle"
                }
                aria-hidden="true"
              />
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
              className={
                isFiltersOpen
                  ? "opportunity-filters__placeholder opportunity-filters__placeholder--active"
                  : "opportunity-filters__placeholder"
              }
              onClick={() => setIsFiltersOpen((current) => !current)}
            >
              <span>Фильтры</span>
              <span
                className={
                  isFiltersOpen
                    ? "opportunity-filters__placeholder-toggle opportunity-filters__placeholder-toggle--open"
                    : "opportunity-filters__placeholder-toggle"
                }
                aria-hidden="true"
              />
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
                    <span className="opportunity-filters__group-heading">
                      <span className="opportunity-filters__group-title">Вакансии и стажировки</span>
                      <span
                        className="opportunity-filters__reset opportunity-filters__reset--inline"
                        onClick={(event) => {
                          event.stopPropagation();
                          resetVacancyFilters();
                        }}
                      >
                        Сбросить
                      </span>
                    </span>
                    <span
                      className={
                        isVacanciesOpen
                          ? "opportunity-filters__placeholder-toggle opportunity-filters__group-toggle opportunity-filters__placeholder-toggle--open"
                          : "opportunity-filters__placeholder-toggle opportunity-filters__group-toggle"
                      }
                      aria-hidden="true"
                    />
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
                    {renderPanelHead("Город", () => handleCitySelect(""))}
                    <div className="city-selector__search opportunity-filters__city-search-shell" aria-label="Город">
                      <span className="city-selector__search-icon" aria-hidden="true" />
                      <Input
                        type="search"
                        placeholder="Поиск по городам"
                        value={cityQuery}
                        onChange={(event) => handleCityInputChange(event.target.value)}
                        className="input--sm city-selector__search-input opportunity-filters__search-input"
                        clearable
                      />
                    </div>
                    {cityQuery.trim() && normalizeFilterText(cityQuery) !== normalizeFilterText(filterValue.city) ? (
                      <div className="city-selector__list opportunity-filters__city-selector-list" role="listbox" aria-label="Список городов">
                        {isVacancyCityLoading ? <div className="city-selector__empty">Ищем города...</div> : null}
                        {!isVacancyCityLoading && hasVacancyCityError ? <div className="city-selector__empty">Не удалось загрузить список городов.</div> : null}
                        {!isVacancyCityLoading && !hasVacancyCityError && vacancyCitySuggestions.length === 0 ? <div className="city-selector__empty">Ничего не найдено.</div> : null}
                        {!isVacancyCityLoading && !hasVacancyCityError && vacancyCitySuggestions.map((city) => (
                          <button
                            key={city.id}
                            type="button"
                            className={city.name === filterValue.city ? "city-selector__option city-selector__option--active" : "city-selector__option"}
                            onClick={() => handleCitySelect(city.name)}
                          >
                            <span className="city-selector__option-label">{city.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    {renderPanelHead("Радиус поиска, км", () => {
                      setVacancyAddress("");
                      setSelectedVacancyAddressLabel("");
                      setVacancyAddressSuggestions([]);
                      setRadiusFrom("0");
                      setRadiusTo("50");
                    })}
                    <div className="city-selector__search opportunity-filters__city-search-shell" aria-label="Адрес поиска">
                      <span className="city-selector__search-icon" aria-hidden="true" />
                      <Input
                        value={vacancyAddress}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setVacancyAddress(nextValue);
                          if (nextValue !== selectedVacancyAddressLabel) {
                            setSelectedVacancyAddressLabel("");
                          }
                        }}
                        placeholder="Улица и номер дома"
                        className="input--sm city-selector__search-input opportunity-filters__search-input"
                        clearable
                      />
                    </div>
                    {vacancyAddress.trim() && normalizeFilterText(vacancyAddress) !== normalizeFilterText(selectedVacancyAddressLabel) ? (
                      <div className="city-selector__list opportunity-filters__city-selector-list" role="listbox" aria-label="Список адресов">
                        {isVacancyAddressLoading ? (
                          <div className="city-selector__empty">Загружаем адреса...</div>
                        ) : vacancyAddressSuggestions.length > 0 ? (
                          vacancyAddressSuggestions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="city-selector__option opportunity-filters__address-option"
                              onClick={() => {
                                setSelectedVacancyAddressLabel(item.fullAddress);
                                setVacancyAddress(item.fullAddress);
                              }}
                            >
                              <span className="city-selector__option-label opportunity-filters__address-option-title">{item.fullAddress}</span>
                              {item.subtitle ? <span className="opportunity-filters__address-option-subtitle">{item.subtitle}</span> : null}
                            </button>
                          ))
                        ) : (
                          <div className="city-selector__empty">Ничего не найдено.</div>
                        )}
                      </div>
                    ) : null}
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
                    {renderPanelHead("Отображение", () => setHideVacanciesOnMap(false))}
                    <label className="opportunity-filters__selection-toggle">
                      <input
                        type="checkbox"
                        checked={hideVacanciesOnMap}
                        onChange={(event) => setHideVacanciesOnMap(event.target.checked)}
                      />
                      <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                      <span>Не отображать в списке вакансии и стажировки</span>
                    </label>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    {renderPanelHead("Навыки (Стек)", () => setSkillQuery(""))}
                    <label className="opportunity-filters__search opportunity-filters__search--panel" aria-label="Поиск навыка">
                      <Input
                        placeholder="Поиск навыка"
                        value={skillQuery}
                        onChange={(event) => setSkillQuery(event.target.value)}
                        className="input--sm opportunity-filters__search-input"
                        clearable
                      />
                    </label>
                    {selectedVacancySkills.length > 0 ? (
                      <div className="opportunity-filters__chip-list">
                        {selectedVacancySkills.map((item) =>
                          renderSelectedChip(item, selectedVacancySkills, setSelectedVacancySkills),
                        )}
                      </div>
                    ) : null}
                    <div className="opportunity-filters__tag-card">
                      <div className="opportunity-filters__tag-card-title">Популярные</div>
                      <div className="opportunity-filters__chip-list">
                        {popularTags.map((tag) => (
                          renderChip(tag, selectedVacancySkills, setSelectedVacancySkills)
                        ))}
                      </div>
                    </div>
                    <div className="opportunity-filters__grouped-list">
                      {filteredSkillGroups.map((group) => (
                        <div key={group.id} className="opportunity-filters__subsection">
                          <p className="opportunity-filters__subsection-title">{group.title}</p>
                          <div className="opportunity-filters__chip-list opportunity-filters__chip-list--spaced">
                            {group.items.map((item) => (
                              renderChip(item, selectedVacancySkills, setSelectedVacancySkills, `${group.id}-${item}`)
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    {renderPanelHead("Уровень", () => {
                      setSelectedLevels([]);
                      onFilterChange({ ...filterValue, levels: [] });
                    })}
                    <div className="opportunity-filters__selection-list">
                      {levelOptions.map((option) => (
                        <label key={option} className="opportunity-filters__selection-toggle">
                          <input
                            type="checkbox"
                            checked={selectedLevels.includes(option)}
                            onChange={() => handleLevelsChange(option)}
                          />
                          <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    {renderPanelHead("Формат", () => {
                      setSelectedFormats([]);
                      onFilterChange({ ...filterValue, formats: [] });
                    })}
                    <div className="opportunity-filters__selection-list">
                      {formatOptions.map((option) => (
                        <label key={option} className="opportunity-filters__selection-toggle">
                          <input
                            type="checkbox"
                            checked={selectedFormats.includes(option)}
                            onChange={() => handleFormatsChange(option)}
                          />
                          <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    {renderPanelHead("Занятость", () => {
                      setSelectedEmployment([]);
                      onFilterChange({ ...filterValue, employment: [] });
                    })}
                    <div className="opportunity-filters__selection-list">
                      {employmentOptions.map((option) => (
                        <label key={option} className="opportunity-filters__selection-toggle">
                          <input
                            type="checkbox"
                            checked={selectedEmployment.includes(option)}
                            onChange={() => handleEmploymentChange(option)}
                          />
                          <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                    {renderPanelHead("Зарплата", () => {
                      setSalaryFrom("");
                      setSalaryTo("");
                    })}
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
                    {renderPanelHead("Дата публикации", () => setSelectedPublication(["За всё время"]))}
                    <div className="opportunity-filters__selection-list">
                      {publicationOptions.map((option) => (
                        <label key={option} className="opportunity-filters__selection-toggle">
                          <input
                            type="checkbox"
                            checked={selectedPublication.includes(option)}
                            onChange={() => toggleOption(option, selectedPublication, setSelectedPublication)}
                          />
                          <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
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
                    <span className="opportunity-filters__group-heading">
                      <span className="opportunity-filters__group-title">Мероприятия</span>
                      <span
                        className="opportunity-filters__reset opportunity-filters__reset--inline"
                        onClick={(event) => {
                          event.stopPropagation();
                          resetEventFilters();
                        }}
                      >
                        Сбросить
                      </span>
                    </span>
                    <span
                      className={
                        expandedGroups.events
                          ? "opportunity-filters__placeholder-toggle opportunity-filters__group-toggle opportunity-filters__placeholder-toggle--open"
                          : "opportunity-filters__placeholder-toggle opportunity-filters__group-toggle"
                      }
                      aria-hidden="true"
                    />
                  </button>
                </div>
                {expandedGroups.events ? (
                  <div className="opportunity-filters__accordion-body">
                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Тип", () => setSelectedEventTypes(["День открытых дверей"]))}
                      <div className="opportunity-filters__selection-list opportunity-filters__selection-list--single">
                        {eventTypeOptions.map((option) => (
                          <label key={option} className="opportunity-filters__selection-toggle">
                            <input
                              type="checkbox"
                              checked={selectedEventTypes.includes(option)}
                              onChange={() => toggleOption(option, selectedEventTypes, setSelectedEventTypes)}
                            />
                            <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Формат", () => {
                        setSelectedFormats([]);
                        onFilterChange({ ...filterValue, formats: [] });
                      })}
                      <div className="opportunity-filters__selection-list">
                        {formatOptions.map((option) => (
                          <label key={`event-${option}`} className="opportunity-filters__selection-toggle">
                            <input
                              type="checkbox"
                              checked={selectedFormats.includes(option)}
                              onChange={() => toggleOption(option, selectedFormats, setSelectedFormats)}
                            />
                            <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Стоимость", () => {
                        setSelectedCosts(["Платно"]);
                        setEventCostFrom("");
                        setEventCostTo("");
                      })}
                      <div className="opportunity-filters__selection-list">
                        {costOptions.map((option) => (
                          <label key={`event-cost-${option}`} className="opportunity-filters__selection-toggle">
                            <input
                              type="checkbox"
                              checked={selectedCosts.includes(option)}
                              onChange={() => toggleOption(option, selectedCosts, setSelectedCosts)}
                            />
                            <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
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
                      {renderPanelHead("Дата проведения", () => setEventDate(""))}
                      <Input
                        value={eventDate}
                        onChange={(event) => setEventDate(event.target.value)}
                        placeholder="00.00.0000"
                        className="input--sm"
                      />
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Организатор", () => setMentorOrganizerQuery(""))}
                      <label className="opportunity-filters__search opportunity-filters__search--panel" aria-label="Поиск организатора">
                        <Input
                          placeholder="Поиск"
                          value={mentorOrganizerQuery}
                          onChange={(event) => setMentorOrganizerQuery(event.target.value)}
                          className="input--sm opportunity-filters__search-input"
                          clearable
                        />
                      </label>
                      {selectedEventOrganizers.length > 0 ? (
                        <div className="opportunity-filters__chip-list">
                          {selectedEventOrganizers.map((item) =>
                            renderSelectedChip(item, selectedEventOrganizers, setSelectedEventOrganizers),
                          )}
                        </div>
                      ) : null}
                      <div className="opportunity-filters__chip-list">
                        {mentorOrganizers.map((item) => (
                          renderChip(item, selectedEventOrganizers, setSelectedEventOrganizers, `event-organizer-${item}`)
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
                    <span className="opportunity-filters__group-heading">
                      <span className="opportunity-filters__group-title">Менторские программы</span>
                      <span
                        className="opportunity-filters__reset opportunity-filters__reset--inline"
                        onClick={(event) => {
                          event.stopPropagation();
                          resetMentorshipFilters();
                        }}
                      >
                        Сбросить
                      </span>
                    </span>
                    <span
                      className={
                        expandedGroups.mentorship
                          ? "opportunity-filters__placeholder-toggle opportunity-filters__group-toggle opportunity-filters__placeholder-toggle--open"
                          : "opportunity-filters__placeholder-toggle opportunity-filters__group-toggle"
                      }
                      aria-hidden="true"
                    />
                  </button>
                </div>
                {expandedGroups.mentorship ? (
                  <div className="opportunity-filters__accordion-body">
                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Навыки (Экспертиза)", () => undefined)}
                      {selectedMentorExpertiseItems.length > 0 ? (
                        <div className="opportunity-filters__chip-list">
                          {selectedMentorExpertiseItems.map((item) =>
                            renderSelectedChip(item, selectedMentorExpertiseItems, setSelectedMentorExpertiseItems),
                          )}
                        </div>
                      ) : null}
                      <div className="opportunity-filters__chip-list">
                        {mentorExpertiseAreas.map((item) => (
                          renderChip(item, selectedMentorExpertiseItems, setSelectedMentorExpertiseItems)
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Организатор", () => setMentorOrganizerQuery(""))}
                      <label className="opportunity-filters__search opportunity-filters__search--panel" aria-label="Поиск организатора">
                        <Input
                          placeholder="Поиск"
                          value={mentorOrganizerQuery}
                          onChange={(event) => setMentorOrganizerQuery(event.target.value)}
                          className="input--sm opportunity-filters__search-input"
                          clearable
                        />
                      </label>
                      {selectedMentorOrganizers.length > 0 ? (
                        <div className="opportunity-filters__chip-list">
                          {selectedMentorOrganizers.map((item) =>
                            renderSelectedChip(item, selectedMentorOrganizers, setSelectedMentorOrganizers),
                          )}
                        </div>
                      ) : null}
                      <div className="opportunity-filters__chip-list">
                        {mentorOrganizers.map((item) => (
                          renderChip(item, selectedMentorOrganizers, setSelectedMentorOrganizers)
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Направление", () => setSelectedMentorDirections(["Карьерный рост"]))}
                      <div className="opportunity-filters__selection-list">
                        {mentorshipDirectionOptions.map((option) => (
                          <label key={option} className="opportunity-filters__selection-toggle">
                            <input
                              type="checkbox"
                              checked={selectedMentorDirections.includes(option)}
                              onChange={() => toggleOption(option, selectedMentorDirections, setSelectedMentorDirections)}
                            />
                            <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Доступность", () => setSelectedMentorAvailability(["Сейчас свободен"]))}
                      <div className="opportunity-filters__selection-list opportunity-filters__selection-list--single">
                        {mentorAvailabilityOptions.map((option) => (
                          <label key={option} className="opportunity-filters__selection-toggle">
                            <input
                              type="checkbox"
                              checked={selectedMentorAvailability.includes(option)}
                              onChange={() => toggleOption(option, selectedMentorAvailability, setSelectedMentorAvailability)}
                            />
                            <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Опыт", () => setSelectedMentorExperience(["Junior+"]))}
                      <div className="opportunity-filters__selection-list">
                        {mentorExperienceOptions.map((option) => (
                          <label key={option} className="opportunity-filters__selection-toggle">
                            <input
                              type="checkbox"
                              checked={selectedMentorExperience.includes(option)}
                              onChange={() => toggleOption(option, selectedMentorExperience, setSelectedMentorExperience)}
                            />
                            <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Стоимость", () => {
                        setMentorCostFrom("");
                        setMentorCostTo("");
                      }, "₽/час")}
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
                      {renderPanelHead("Формат", () => {
                        setSelectedFormats([]);
                        onFilterChange({ ...filterValue, formats: [] });
                      })}
                      <div className="opportunity-filters__selection-list">
                        {formatOptions.map((option) => (
                          <label key={`mentor-${option}`} className="opportunity-filters__selection-toggle">
                            <input
                              type="checkbox"
                              checked={selectedFormats.includes(option)}
                              onChange={() => toggleOption(option, selectedFormats, setSelectedFormats)}
                            />
                            <span className="opportunity-filters__selection-indicator" aria-hidden="true" />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="opportunity-filters__panel-section opportunity-filters__panel-section--card">
                      {renderPanelHead("Дата", () => setMentorDate(""))}
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
