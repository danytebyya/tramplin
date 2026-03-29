import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { load } from "@2gis/mapgl";
import { Clusterer } from "@2gis/mapgl-clusterer";
import type { ClusterStyle, InputMarker } from "@2gis/mapgl-clusterer";
import type { Map as DGisMap } from "@2gis/mapgl/types";

import verifiedIcon from "../../assets/icons/verified.svg";
import { Opportunity } from "../../entities/opportunity";
import {
  AddressSuggestion,
  CitySuggestion,
  getAddressSuggestions,
  getCitySuggestions,
  getCityViewportByName,
  popularCities,
} from "../../features/city-selector/api";
import {
  OpportunityTagCatalogCategory,
  listOpportunityTagCatalogRequest,
} from "../../features/opportunity/api";
import { env } from "../../shared/config/env";
import { Badge, Button, Checkbox, DateInput, Input } from "../../shared/ui";
import "../../features/city-selector/city-selector.css";
import "./map-view.css";

type FilterGroup = {
  id: string;
  title: string;
  items: string[];
};

type MapViewProps = {
  opportunities: Opportunity[];
  favoriteOpportunityIds: string[];
  appliedOpportunityIds?: string[];
  selectedOpportunityId: string | null;
  selectedCity: string;
  selectedCityViewport?: {
    center: [number, number];
    zoom: number;
  } | null;
  isExpanded: boolean;
  isTransitioning: boolean;
  roleName?: string;
  onSelectOpportunity: (opportunityId: string) => void;
  onToggleFavorite: (opportunityId: string) => void;
  onSelectCity: (city: string) => void;
  onCloseDetails: () => void;
  onToggleExpand: () => void;
  onApply?: (opportunityId: string) => void;
};

const mapCenter = [47.2512, 56.1287];
const cityViewportByName: Record<string, { center: [number, number]; zoom: number }> = {
  Москва: { center: [37.6176, 55.7558], zoom: 11 },
  "Санкт-Петербург": { center: [30.3159, 59.9391], zoom: 11 },
  Казань: { center: [49.1221, 55.7887], zoom: 11 },
  Новосибирск: { center: [82.9204, 55.0302], zoom: 11 },
  Чебоксары: { center: [47.2512, 56.1287], zoom: 12 },
};

const vacancySkillGroups: FilterGroup[] = [
  { id: "languages", title: "Языки программирования", items: ["JavaScript", "TypeScript", "Python", "Java", "Go", "C#", "PHP"] },
  { id: "frameworks", title: "Фреймворки и библиотеки", items: ["React", "Vue", "Angular", "Next.js", "Django", "FastAPI", "Node.js"] },
  { id: "databases", title: "Базы данных", items: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch"] },
  { id: "devops", title: "DevOps", items: ["Docker", "Kubernetes", "CI/CD", "GitHub Actions", "Terraform"] },
  { id: "clouds", title: "Облака", items: ["AWS", "Azure", "Google Cloud", "Yandex Cloud"] },
  { id: "analytics", title: "Аналитика и Data Science", items: ["SQL", "Pandas", "NumPy", "Power BI", "Tableau"] },
  { id: "design", title: "Дизайн", items: ["Figma", "Adobe XD", "Photoshop", "Illustrator"] },
  { id: "other", title: "Другое", items: ["Git", "Scrum", "Agile", "English"] },
];
const themeGroups: FilterGroup[] = [
  { id: "languages", title: "Языки программирования", items: ["Backend", "Frontend", "Mobile"] },
  { id: "frameworks", title: "Фреймворки и библиотеки", items: ["React", "Vue", "Angular", "Next.js"] },
  { id: "databases", title: "Базы данных", items: ["PostgreSQL", "MySQL", "Redis"] },
  { id: "devops", title: "DevOps и инструменты", items: ["Docker", "Kubernetes", "CI/CD"] },
  { id: "design", title: "Дизайн", items: ["UX/UI", "Product Design", "Graphic Design"] },
  { id: "analytics", title: "Аналитика и Data Science", items: ["Analytics", "ML", "BI"] },
  { id: "other", title: "Другое", items: ["Soft skills", "Карьера", "Нетворкинг"] },
];
const mentorExpertiseGroups: FilterGroup[] = [
  { id: "languages", title: "Языки программирования", items: ["Python", "JavaScript", "Go", "Java"] },
  { id: "frameworks", title: "Фреймворки и библиотеки", items: ["React", "Vue", "Django", "FastAPI"] },
  { id: "databases", title: "Базы данных", items: ["PostgreSQL", "MySQL", "MongoDB"] },
  { id: "devops", title: "DevOps и инструменты", items: ["Docker", "Kubernetes", "CI/CD"] },
  { id: "design", title: "Дизайн", items: ["Figma", "UX/UI"] },
  { id: "analytics", title: "Аналитика и Data Science", items: ["SQL", "Pandas", "ML"] },
  { id: "other", title: "Другое", items: ["Soft skills", "Leadership", "Product"] },
];
const vacancyLevels = ["Junior", "Middle", "Senior"];
const formatOptions = ["Офлайн", "Гибрид", "Удалённо"];
const employmentOptions = ["Полная занятость", "Частичная занятость", "Проектная работа", "Стажировка"];
const publicationOptions = ["За всё время", "За сегодня", "За 3 дня", "За неделю"];
const eventTypeOptions = ["День открытых дверей", "Хакатон", "Лекция / воркшоп", "Конференция", "Карьерный день"];
const costOptions = ["Бесплатно", "Платно"];
const mentorshipDirections = ["Карьерный рост", "Технические навыки", "Подготовка к собеседованиям", "Soft skills", "Code review"];
const mentorAvailabilityOptions = ["Сейчас свободен", "В течение недели"];
const mentorExperienceOptions = ["Junior+", "Middle+", "Senior"];
const popularVacancySkills = ["Python", "JavaScript", "React", "SQL", "Docker"];
const HARD_SKILL_EXCLUDED_CATEGORY_SLUGS = [
  "applicant-soft-skills",
  "spoken-languages",
  "level-format",
  "specialization",
];

function normalizeCityValue(city: string) {
  return city.trim().toLowerCase();
}

function normalizeCatalogValue(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function collectHardSkillItems(categories: OpportunityTagCatalogCategory[] | undefined) {
  const itemMap = new Map<string, string>();

  for (const category of categories ?? []) {
    if (HARD_SKILL_EXCLUDED_CATEGORY_SLUGS.includes(category.slug)) {
      continue;
    }

    if (!["technology", "skill", "language"].includes(category.tagType)) {
      continue;
    }

    for (const item of category.items) {
      const normalizedName = item.name.trim();
      if (normalizedName.length === 0 || itemMap.has(normalizedName)) {
        continue;
      }

      itemMap.set(normalizedName, normalizedName);
    }
  }

  return Array.from(itemMap.values()).sort((left, right) => left.localeCompare(right, "ru"));
}

function filterCatalogItems(items: string[], query: string, selected: string[]) {
  const normalizedQuery = normalizeCatalogValue(query);

  return items.filter((item) => {
    if (selected.includes(item)) {
      return false;
    }

    if (normalizedQuery.length === 0) {
      return true;
    }

    return normalizeCatalogValue(item).includes(normalizedQuery);
  });
}

function resolveViewportByCityName(selectedCity: string) {
  const normalizedSelectedCity = normalizeCityValue(selectedCity);

  const exactMatch = Object.entries(cityViewportByName).find(
    ([cityName]) => normalizeCityValue(cityName) === normalizedSelectedCity,
  );

  if (exactMatch) {
    return exactMatch[1];
  }

  const partialMatch = Object.entries(cityViewportByName).find(([cityName]) => {
    const normalizedCityName = normalizeCityValue(cityName);
    return (
      normalizedSelectedCity.includes(normalizedCityName) ||
      normalizedCityName.includes(normalizedSelectedCity)
    );
  });

  return partialMatch?.[1];
}

function getViewportByCoordinates(opportunities: Opportunity[]) {
  const longitudeValues = opportunities.map((opportunity) => opportunity.longitude);
  const latitudeValues = opportunities.map((opportunity) => opportunity.latitude);
  const minLongitude = Math.min(...longitudeValues);
  const maxLongitude = Math.max(...longitudeValues);
  const minLatitude = Math.min(...latitudeValues);
  const maxLatitude = Math.max(...latitudeValues);
  const centerLongitude = (minLongitude + maxLongitude) / 2;
  const centerLatitude = (minLatitude + maxLatitude) / 2;
  const longitudeSpan = Math.abs(maxLongitude - minLongitude);
  const latitudeSpan = Math.abs(maxLatitude - minLatitude);
  const widestSpan = Math.max(longitudeSpan, latitudeSpan);

  let zoom = 11;
  if (widestSpan > 20) {
    zoom = 3;
  } else if (widestSpan > 12) {
    zoom = 4;
  } else if (widestSpan > 6) {
    zoom = 5;
  } else if (widestSpan > 3) {
    zoom = 6;
  } else if (widestSpan > 1.5) {
    zoom = 7;
  }

  return {
    center: [centerLongitude, centerLatitude] as [number, number],
    zoom,
  };
}

function getOpportunityKindLabel(kind: Opportunity["kind"]) {
  if (kind === "internship") {
    return "Стажировка";
  }

  if (kind === "event") {
    return "Мероприятие";
  }

  if (kind === "mentorship") {
    return "Менторство";
  }

  return "Вакансия";
}

function normalizeFilterText(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function parseNumberInput(value: string) {
  const normalizedValue = value.replace(",", ".").trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseAmountLabel(value: string) {
  const normalizedValue = normalizeFilterText(value);
  const isFree = normalizedValue.includes("бесплат");
  const numbers = value
    .replace(/\u00A0/g, " ")
    .match(/\d+(?:[\s.,]\d+)*/g)
    ?.map((item) => Number(item.replace(/\s+/g, "").replace(",", ".")))
    .filter((item) => Number.isFinite(item)) ?? [];

  if (numbers.length === 0) {
    return {
      min: isFree ? 0 : null,
      max: isFree ? 0 : null,
      isFree,
    };
  }

  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    isFree,
  };
}

function normalizeFormatOption(value: string): Opportunity["format"] | null {
  const normalizedValue = normalizeFilterText(value);

  if (normalizedValue === "офлайн") {
    return "office";
  }

  if (normalizedValue === "гибрид") {
    return "hybrid";
  }

  if (normalizedValue === "удаленно" || normalizedValue === "удалённо") {
    return "remote";
  }

  return null;
}

function normalizeLevelOption(value: string) {
  const normalizedValue = normalizeFilterText(value);

  if (normalizedValue.includes("junior")) {
    return "junior";
  }

  if (normalizedValue.includes("middle")) {
    return "middle";
  }

  if (normalizedValue.includes("senior")) {
    return "senior";
  }

  if (normalizedValue.includes("стаж")) {
    return "intern";
  }

  return normalizedValue;
}

function normalizeEmploymentOption(value: string) {
  const normalizedValue = normalizeFilterText(value);

  if (normalizedValue.includes("полная") || normalizedValue.includes("full")) {
    return "full";
  }

  if (normalizedValue.includes("частич") || normalizedValue.includes("part")) {
    return "part";
  }

  if (normalizedValue.includes("проект") || normalizedValue.includes("project")) {
    return "project";
  }

  if (normalizedValue.includes("стаж")) {
    return "internship";
  }

  return normalizedValue;
}

function isSameDay(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) {
    return false;
  }

  const leftDate = new Date(left);
  const rightDate = new Date(right);

  return (
    !Number.isNaN(leftDate.getTime()) &&
    !Number.isNaN(rightDate.getTime()) &&
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function haversineDistanceKm(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
) {
  const earthRadiusKm = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function matchesTagSelection(opportunity: Opportunity, selectedTags: string[]) {
  if (selectedTags.length === 0) {
    return true;
  }

  const opportunityTags = opportunity.tags.map((item) => normalizeCatalogValue(item));
  return selectedTags.every((tag) => opportunityTags.includes(normalizeCatalogValue(tag)));
}

function matchesStringSelection(value: string | null | undefined, selectedValues: string[]) {
  if (selectedValues.length === 0) {
    return true;
  }

  if (!value) {
    return false;
  }

  return selectedValues.some((item) => normalizeFilterText(item) === normalizeFilterText(value));
}

function matchesNumericRange(value: string, from: string, to: string) {
  const amount = parseAmountLabel(value);
  const parsedFrom = parseNumberInput(from);
  const parsedTo = parseNumberInput(to);

  if (parsedFrom === null && parsedTo === null) {
    return true;
  }

  if (amount.min === null && amount.max === null) {
    return false;
  }

  const minValue = amount.min ?? amount.max ?? 0;
  const maxValue = amount.max ?? amount.min ?? 0;

  if (parsedFrom !== null && maxValue < parsedFrom) {
    return false;
  }

  if (parsedTo !== null && minValue > parsedTo) {
    return false;
  }

  return true;
}

const formatLabels: Array<{ label: string; value: Opportunity["format"] | "saved" }> = [
  { label: "Офлайн", value: "office" },
  { label: "Гибрид", value: "hybrid" },
  { label: "Удаленно", value: "remote" },
  { label: "Избранное", value: "saved" },
];

const baseFormatValue: Opportunity["format"][] = ["office", "hybrid", "remote"];
const initialFormatValue: Array<Opportunity["format"] | "saved"> = [...baseFormatValue];

function toggleFormatSelection(
  current: Array<Opportunity["format"] | "saved">,
  nextValue: Opportunity["format"] | "saved",
): Array<Opportunity["format"] | "saved"> {
  if (nextValue === "saved") {
    return current.length === 1 && current[0] === "saved" ? [...baseFormatValue] : ["saved"];
  }

  if (current.length === 1 && current[0] === "saved") {
    return [nextValue];
  }

  if (current.includes(nextValue)) {
    const remainingValues = current.filter((value) => value !== nextValue);
    return remainingValues.length > 0 ? remainingValues : [...baseFormatValue];
  }

  return [...current, nextValue];
}

const markerPalette = {
  office: "#2563eb",
  hybrid: "#06b6d4",
  remote: "#6b7280",
  saved: "#f59e0b",
} as const;

const clusterPaletteByRole = {
  applicant: {
    color: "#06b6d4",
    hoverColor: "#0891b2",
  },
  employer: {
    color: "#2563eb",
    hoverColor: "#1d4ed8",
  },
  curator: {
    color: "#f59e0b",
    hoverColor: "#d97706",
  },
  default: {
    color: "#2563eb",
    hoverColor: "#1d4ed8",
  },
} as const;

function encodeSvg(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createPinIcon(color: string, isActive = false) {
  const width = isActive ? 38 : 34;
  const height = isActive ? 38 : 34;

  return encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 34 34" fill="none">
      <path d="M17 2C10.0964 2 4.5 7.59644 4.5 14.5C4.5 19.9207 7.95667 24.5338 12.7858 26.2468L17 32L21.2142 26.2468C26.0433 24.5338 29.5 19.9207 29.5 14.5C29.5 7.59644 23.9036 2 17 2Z" fill="${color}"/>
      <circle cx="17" cy="14.5" r="5.5" fill="white"/>
    </svg>
  `);
}

function createClusterIcon(color: string, hoverColor: string) {
  const base = encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="48" viewBox="0 0 56 48" fill="none">
      <rect x="4" y="4" width="48" height="40" rx="12" fill="${color}"/>
    </svg>
  `);

  const hover = encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="48" viewBox="0 0 56 48" fill="none">
      <rect x="4" y="4" width="48" height="40" rx="12" fill="${hoverColor}"/>
    </svg>
  `);

  return { base, hover };
}

function createClusterStyle(pointsCount: number, roleName?: string): ClusterStyle {
  const palette =
    roleName === "applicant" || roleName === "employer" || roleName === "curator"
      ? clusterPaletteByRole[roleName]
      : clusterPaletteByRole.default;
  const clusterIcons = createClusterIcon(palette.color, palette.hoverColor);

  return {
    type: "webgl",
    icon: clusterIcons.base,
    hoverIcon: clusterIcons.hover,
    size: [56, 48],
    hoverSize: [58, 50],
    anchor: [28, 24],
    labelText: String(pointsCount),
    labelColor: "#ffffff",
    labelFontSize: 16,
    labelHaloColor: "#00000000",
    labelHaloRadius: 0,
    labelRelativeAnchor: [0.5, 0.5],
    labelOffset: [0, 0],
  };
}

function resolveMarkerColor(opportunity: Opportunity, favoriteOpportunityIds: string[]) {
  if (favoriteOpportunityIds.includes(opportunity.id)) {
    return markerPalette.saved;
  }

  if (opportunity.format === "office") {
    return markerPalette.office;
  }

  if (opportunity.format === "hybrid") {
    return markerPalette.hybrid;
  }

  return markerPalette.remote;
}

function applyViewport(
  map: DGisMap,
  viewport: {
    center: [number, number];
    zoom: number;
  },
  {
    duration,
    shouldUpdateZoom,
  }: {
    duration: number;
    shouldUpdateZoom: boolean;
  },
) {
  map.setCenter(viewport.center, { duration });

  if (shouldUpdateZoom) {
    map.setZoom(viewport.zoom, { duration });
  }
}

export function MapView({
  opportunities,
  favoriteOpportunityIds,
  appliedOpportunityIds = [],
  selectedOpportunityId,
  selectedCity,
  selectedCityViewport,
  isExpanded,
  isTransitioning,
  roleName,
  onSelectOpportunity,
  onToggleFavorite,
  onSelectCity,
  onCloseDetails,
  onToggleExpand,
  onApply,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<DGisMap | null>(null);
  const clustererRef = useRef<Clusterer | null>(null);
  const hasAlignedInitialViewportRef = useRef(false);
  const previousSelectedOpportunityIdRef = useRef<string | null>(null);
  const onSelectOpportunityRef = useRef(onSelectOpportunity);
  const onCloseDetailsRef = useRef(onCloseDetails);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isMapVisible, setIsMapVisible] = useState(false);
  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const [isOpportunitiesOpen, setIsOpportunitiesOpen] = useState(true);
  const [isEventsOpen, setIsEventsOpen] = useState(false);
  const [isMentorshipOpen, setIsMentorshipOpen] = useState(false);
  const [isFormatBarExpanded, setIsFormatBarExpanded] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<Array<Opportunity["format"] | "saved">>(initialFormatValue);
  const [selectedVacancyCity, setSelectedVacancyCity] = useState("");
  const [vacancyCityQuery, setVacancyCityQuery] = useState("");
  const [selectedEventCity, setSelectedEventCity] = useState("");
  const [eventCityQuery, setEventCityQuery] = useState("");
  const [selectedMentorCity, setSelectedMentorCity] = useState("");
  const [mentorCityQuery, setMentorCityQuery] = useState("");
  const [selectedVacancyAddressLabel, setSelectedVacancyAddressLabel] = useState("");
  const [selectedVacancyAddressPoint, setSelectedVacancyAddressPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [vacancyAddress, setVacancyAddress] = useState("");
  const [selectedEventAddressLabel, setSelectedEventAddressLabel] = useState("");
  const [selectedEventAddressPoint, setSelectedEventAddressPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [eventAddress, setEventAddress] = useState("");
  const [selectedMentorAddressLabel, setSelectedMentorAddressLabel] = useState("");
  const [selectedMentorAddressPoint, setSelectedMentorAddressPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [mentorAddress, setMentorAddress] = useState("");
  const [vacancyRadiusFrom, setVacancyRadiusFrom] = useState("");
  const [vacancyRadiusTo, setVacancyRadiusTo] = useState("");
  const [eventRadiusFrom, setEventRadiusFrom] = useState("");
  const [eventRadiusTo, setEventRadiusTo] = useState("");
  const [mentorRadiusFrom, setMentorRadiusFrom] = useState("");
  const [mentorRadiusTo, setMentorRadiusTo] = useState("");
  const [hideEventsOnMap, setHideEventsOnMap] = useState(false);
  const [hideMentorshipOnEventMap, setHideMentorshipOnEventMap] = useState(false);
  const [hideEventsOnMentorMap, setHideEventsOnMentorMap] = useState(false);
  const [vacancySkillQuery, setVacancySkillQuery] = useState("");
  const [eventThemeQuery, setEventThemeQuery] = useState("");
  const [mentorExpertiseQuery, setMentorExpertiseQuery] = useState("");
  const [selectedVacancySkills, setSelectedVacancySkills] = useState<string[]>([]);
  const [selectedEventThemes, setSelectedEventThemes] = useState<string[]>([]);
  const [selectedMentorExpertise, setSelectedMentorExpertise] = useState<string[]>([]);
  const [selectedVacancyLevels, setSelectedVacancyLevels] = useState<string[]>([]);
  const [selectedVacancyFormats, setSelectedVacancyFormats] = useState<string[]>([]);
  const [selectedVacancyEmployment, setSelectedVacancyEmployment] = useState<string[]>([]);
  const [vacancySalaryFrom, setVacancySalaryFrom] = useState("");
  const [vacancySalaryTo, setVacancySalaryTo] = useState("");
  const [selectedPublicationPeriods, setSelectedPublicationPeriods] = useState<string[]>([]);
  const [eventOrganizerQuery, setEventOrganizerQuery] = useState("");
  const [mentorOrganizerQuery, setMentorOrganizerQuery] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [selectedEventFormats, setSelectedEventFormats] = useState<string[]>([]);
  const [selectedEventCosts, setSelectedEventCosts] = useState<string[]>([]);
  const [eventCostFrom, setEventCostFrom] = useState("");
  const [eventCostTo, setEventCostTo] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [selectedMentorshipDirections, setSelectedMentorshipDirections] = useState<string[]>([]);
  const [selectedMentorAvailability, setSelectedMentorAvailability] = useState<string[]>([]);
  const [selectedMentorExperience, setSelectedMentorExperience] = useState<string[]>([]);
  const [mentorCostFrom, setMentorCostFrom] = useState("");
  const [mentorCostTo, setMentorCostTo] = useState("");
  const [selectedMentorFormats, setSelectedMentorFormats] = useState<string[]>([]);
  const [mentorDate, setMentorDate] = useState("");
  const [vacancyCitySuggestions, setVacancyCitySuggestions] = useState<CitySuggestion[]>([]);
  const [eventCitySuggestions, setEventCitySuggestions] = useState<CitySuggestion[]>([]);
  const [mentorCitySuggestions, setMentorCitySuggestions] = useState<CitySuggestion[]>([]);
  const [isVacancyCityLoading, setIsVacancyCityLoading] = useState(false);
  const [isEventCityLoading, setIsEventCityLoading] = useState(false);
  const [isMentorCityLoading, setIsMentorCityLoading] = useState(false);
  const [hasVacancyCityError, setHasVacancyCityError] = useState(false);
  const [hasEventCityError, setHasEventCityError] = useState(false);
  const [hasMentorCityError, setHasMentorCityError] = useState(false);
  const [vacancyAddressSuggestions, setVacancyAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [eventAddressSuggestions, setEventAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [mentorAddressSuggestions, setMentorAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isVacancyAddressLoading, setIsVacancyAddressLoading] = useState(false);
  const [isEventAddressLoading, setIsEventAddressLoading] = useState(false);
  const [isMentorAddressLoading, setIsMentorAddressLoading] = useState(false);
  const tagCatalogQuery = useQuery({
    queryKey: ["opportunity-tag-catalog"],
    queryFn: listOpportunityTagCatalogRequest,
  });
  const filteredOpportunities = useMemo(() => {
    const normalizedVacancyCity = normalizeFilterText(selectedVacancyCity);
    const normalizedEventCity = normalizeFilterText(selectedEventCity);
    const normalizedMentorCity = normalizeFilterText(selectedMentorCity);
    const normalizedEventOrganizer = normalizeFilterText(eventOrganizerQuery);
    const normalizedMentorOrganizer = normalizeFilterText(mentorOrganizerQuery);
    const normalizedVacancyFormats = selectedVacancyFormats
      .map(normalizeFormatOption)
      .filter((item): item is Opportunity["format"] => Boolean(item));
    const normalizedEventFormats = selectedEventFormats
      .map(normalizeFormatOption)
      .filter((item): item is Opportunity["format"] => Boolean(item));
    const normalizedMentorFormats = selectedMentorFormats
      .map(normalizeFormatOption)
      .filter((item): item is Opportunity["format"] => Boolean(item));
    const normalizedVacancyLevels = selectedVacancyLevels.map(normalizeLevelOption);
    const normalizedMentorExperience = selectedMentorExperience.map(normalizeLevelOption);
    const normalizedVacancyEmployment = selectedVacancyEmployment.map(normalizeEmploymentOption);
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    return opportunities.filter((opportunity) => {
      const isFavorite = favoriteOpportunityIds.includes(opportunity.id);
      const isSavedOnlyMode = selectedFormat.length === 1 && selectedFormat[0] === "saved";
      const isFormatVisible = isSavedOnlyMode ? true : selectedFormat.includes(opportunity.format);
      const isFavoriteVisible = isSavedOnlyMode ? isFavorite : true;

      if (!isFormatVisible || !isFavoriteVisible) {
        return false;
      }

      const opportunityKind = opportunity.kind;
      const normalizedOpportunityCity = normalizeFilterText(opportunity.city ?? opportunity.locationLabel);
      const normalizedCompanyName = normalizeFilterText(opportunity.companyName);
      const normalizedLevel = normalizeLevelOption(opportunity.levelLabel);
      const normalizedEmployment = normalizeEmploymentOption(opportunity.employmentLabel);
      const plannedDate = opportunity.plannedPublishAt ?? null;
      const publishedDate = opportunity.publishedAt ?? null;

      if ((opportunityKind === "vacancy" || opportunityKind === "internship") && hideEventsOnMap) {
        return false;
      }

      if (opportunityKind === "event" && hideMentorshipOnEventMap) {
        return false;
      }

      if (opportunityKind === "mentorship" && hideEventsOnMentorMap) {
        return false;
      }

      if (opportunityKind === "vacancy" || opportunityKind === "internship") {
        if (normalizedVacancyCity && !normalizedOpportunityCity.includes(normalizedVacancyCity)) {
          return false;
        }

        if ((vacancyRadiusFrom || vacancyRadiusTo) && selectedVacancyAddressPoint) {
          const distanceKm = haversineDistanceKm(selectedVacancyAddressPoint, {
            lat: opportunity.latitude,
            lon: opportunity.longitude,
          });
          const fromKm = parseNumberInput(vacancyRadiusFrom);
          const toKm = parseNumberInput(vacancyRadiusTo);

          if ((fromKm !== null && distanceKm < fromKm) || (toKm !== null && distanceKm > toKm)) {
            return false;
          }
        }

        if (!matchesTagSelection(opportunity, selectedVacancySkills)) {
          return false;
        }

        if (normalizedVacancyLevels.length > 0 && !normalizedVacancyLevels.includes(normalizedLevel)) {
          return false;
        }

        if (normalizedVacancyFormats.length > 0 && !normalizedVacancyFormats.includes(opportunity.format)) {
          return false;
        }

        if (normalizedVacancyEmployment.length > 0 && !normalizedVacancyEmployment.includes(normalizedEmployment)) {
          return false;
        }

        if (!matchesNumericRange(opportunity.salaryLabel, vacancySalaryFrom, vacancySalaryTo)) {
          return false;
        }

        if (selectedPublicationPeriods.length > 0 && !selectedPublicationPeriods.includes("За всё время")) {
          if (!publishedDate) {
            return false;
          }

          const publishedAt = new Date(publishedDate);
          if (Number.isNaN(publishedAt.getTime())) {
            return false;
          }

          const elapsedMs = now.getTime() - publishedAt.getTime();
          const matchesPublicationPeriod = selectedPublicationPeriods.some((period) => {
            if (period === "За сегодня") {
              return elapsedMs <= oneDayMs;
            }

            if (period === "За 3 дня") {
              return elapsedMs <= oneDayMs * 3;
            }

            if (period === "За неделю") {
              return elapsedMs <= oneDayMs * 7;
            }

            return false;
          });

          if (!matchesPublicationPeriod) {
            return false;
          }
        }

        return true;
      }

      if (opportunityKind === "event") {
        if (normalizedEventCity && !normalizedOpportunityCity.includes(normalizedEventCity)) {
          return false;
        }

        if ((eventRadiusFrom || eventRadiusTo) && selectedEventAddressPoint) {
          const distanceKm = haversineDistanceKm(selectedEventAddressPoint, {
            lat: opportunity.latitude,
            lon: opportunity.longitude,
          });
          const fromKm = parseNumberInput(eventRadiusFrom);
          const toKm = parseNumberInput(eventRadiusTo);

          if ((fromKm !== null && distanceKm < fromKm) || (toKm !== null && distanceKm > toKm)) {
            return false;
          }
        }

        if (!matchesTagSelection(opportunity, selectedEventThemes)) {
          return false;
        }

        if (normalizedEventOrganizer && !normalizedCompanyName.includes(normalizedEventOrganizer)) {
          return false;
        }

        if (!matchesStringSelection(opportunity.eventType, selectedEventTypes)) {
          return false;
        }

        if (normalizedEventFormats.length > 0 && !normalizedEventFormats.includes(opportunity.format)) {
          return false;
        }

        if (selectedEventCosts.length > 0) {
          const amount = parseAmountLabel(opportunity.salaryLabel);
          const wantsFree = selectedEventCosts.includes("Бесплатно");
          const wantsPaid = selectedEventCosts.includes("Платно");
          const isPaid = !amount.isFree && ((amount.max ?? 0) > 0 || normalizeFilterText(opportunity.salaryLabel).length > 0);

          if (!((wantsFree && amount.isFree) || (wantsPaid && isPaid))) {
            return false;
          }
        }

        if (!matchesNumericRange(opportunity.salaryLabel, eventCostFrom, eventCostTo)) {
          return false;
        }

        if (eventDate && !isSameDay(plannedDate, eventDate)) {
          return false;
        }

        return true;
      }

      if (opportunityKind === "mentorship") {
        if (normalizedMentorCity && !normalizedOpportunityCity.includes(normalizedMentorCity)) {
          return false;
        }

        if ((mentorRadiusFrom || mentorRadiusTo) && selectedMentorAddressPoint) {
          const distanceKm = haversineDistanceKm(selectedMentorAddressPoint, {
            lat: opportunity.latitude,
            lon: opportunity.longitude,
          });
          const fromKm = parseNumberInput(mentorRadiusFrom);
          const toKm = parseNumberInput(mentorRadiusTo);

          if ((fromKm !== null && distanceKm < fromKm) || (toKm !== null && distanceKm > toKm)) {
            return false;
          }
        }

        if (!matchesTagSelection(opportunity, selectedMentorExpertise)) {
          return false;
        }

        if (normalizedMentorOrganizer && !normalizedCompanyName.includes(normalizedMentorOrganizer)) {
          return false;
        }

        if (!matchesStringSelection(opportunity.mentorshipDirection, selectedMentorshipDirections)) {
          return false;
        }

        if (selectedMentorAvailability.length > 0) {
          const plannedAt = plannedDate ? new Date(plannedDate) : null;
          const isDateValid = plannedAt !== null && !Number.isNaN(plannedAt.getTime());
          const matchesAvailability = selectedMentorAvailability.some((item) => {
            if (item === "Сейчас свободен") {
              return !isDateValid || (plannedAt as Date).getTime() <= now.getTime();
            }

            if (item === "В течение недели") {
              return isDateValid && (plannedAt as Date).getTime() > now.getTime() && (plannedAt as Date).getTime() <= now.getTime() + oneDayMs * 7;
            }

            return false;
          });

          if (!matchesAvailability) {
            return false;
          }
        }

        if (normalizedMentorExperience.length > 0) {
          const currentMentorExperience = normalizeLevelOption(opportunity.mentorExperience ?? opportunity.levelLabel);
          if (!normalizedMentorExperience.includes(currentMentorExperience)) {
            return false;
          }
        }

        if (!matchesNumericRange(opportunity.salaryLabel, mentorCostFrom, mentorCostTo)) {
          return false;
        }

        if (normalizedMentorFormats.length > 0 && !normalizedMentorFormats.includes(opportunity.format)) {
          return false;
        }

        if (mentorDate && !isSameDay(plannedDate, mentorDate)) {
          return false;
        }

        return true;
      }

      return true;
    });
  }, [
    eventCostFrom,
    eventCostTo,
    eventDate,
    eventOrganizerQuery,
    eventRadiusFrom,
    eventRadiusTo,
    favoriteOpportunityIds,
    hideEventsOnMap,
    hideEventsOnMentorMap,
    hideMentorshipOnEventMap,
    mentorCostFrom,
    mentorCostTo,
    mentorDate,
    mentorOrganizerQuery,
    mentorRadiusFrom,
    mentorRadiusTo,
    opportunities,
    selectedEventCosts,
    selectedEventFormats,
    selectedEventThemes,
    selectedEventTypes,
    selectedFormat,
    selectedMentorAddressPoint,
    selectedMentorAvailability,
    selectedMentorCity,
    selectedMentorExperience,
    selectedMentorExpertise,
    selectedMentorFormats,
    selectedMentorshipDirections,
    selectedVacancyAddressPoint,
    selectedVacancyCity,
    selectedVacancyEmployment,
    selectedVacancyFormats,
    selectedVacancyLevels,
    selectedVacancySkills,
    selectedPublicationPeriods,
    selectedEventAddressPoint,
    selectedEventCity,
    vacancyRadiusFrom,
    vacancyRadiusTo,
    vacancySalaryFrom,
    vacancySalaryTo,
  ]);
  const normalizedSelectedCity = normalizeCityValue(selectedCity);
  const cityMatchedOpportunities = useMemo(() => {
    return filteredOpportunities.filter((opportunity) =>
      normalizeCityValue(opportunity.locationLabel).includes(normalizedSelectedCity),
    );
  }, [filteredOpportunities, normalizedSelectedCity]);
  const selectedOpportunity = filteredOpportunities.find(
    (opportunity) => opportunity.id === selectedOpportunityId,
  );
  const isSelectedOpportunityFavorite = selectedOpportunity
    ? favoriteOpportunityIds.includes(selectedOpportunity.id)
    : false;
  const isSelectedOpportunityApplied = selectedOpportunity
    ? appliedOpportunityIds.includes(selectedOpportunity.id)
    : false;
  const themeVariant = roleName === "applicant" ? "secondary" : roleName === "curator" ? "accent" : "primary";
  const badgeThemeVariant = roleName === "applicant" ? "secondary" : roleName === "curator" ? "info" : "primary";
  const outlineThemeVariant = themeVariant === "secondary" ? "secondary-outline" : themeVariant === "accent" ? "accent-outline" : "primary-outline";
  const hardSkillOptions = useMemo(
    () => collectHardSkillItems(tagCatalogQuery.data),
    [tagCatalogQuery.data],
  );
  const filteredVacancySkillOptions = useMemo(
    () => filterCatalogItems(hardSkillOptions, vacancySkillQuery, selectedVacancySkills),
    [hardSkillOptions, selectedVacancySkills, vacancySkillQuery],
  );
  const filteredEventThemeOptions = useMemo(
    () => filterCatalogItems(hardSkillOptions, eventThemeQuery, selectedEventThemes),
    [eventThemeQuery, hardSkillOptions, selectedEventThemes],
  );
  const filteredMentorExpertiseOptions = useMemo(
    () => filterCatalogItems(hardSkillOptions, mentorExpertiseQuery, selectedMentorExpertise),
    [hardSkillOptions, mentorExpertiseQuery, selectedMentorExpertise],
  );
  const registeredCompanyOptions = useMemo(() => {
    const companyMap = new Map<string, string>();

    opportunities.forEach((opportunity) => {
      const companyName = opportunity.companyName.trim();
      if (!companyName) {
        return;
      }

      companyMap.set(companyName.toLocaleLowerCase("ru-RU"), companyName);
    });

    return Array.from(companyMap.values()).sort((left, right) => left.localeCompare(right, "ru"));
  }, [opportunities]);

  const toggleSelection = (value: string, selectedValues: string[], setter: (value: string[]) => void) => {
    setter(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  };

  const filterGroups = (groups: FilterGroup[], query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.toLowerCase().includes(normalizedQuery)),
      }))
      .filter((group) => group.items.length > 0);
  };

  const filterSuggestions = (items: string[], query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => item.toLowerCase().includes(normalizedQuery));
  };

  const resetVacancyFilters = () => {
    setSelectedVacancyCity("");
    setVacancyCityQuery("");
    setSelectedVacancyAddressLabel("");
    setSelectedVacancyAddressPoint(null);
    setVacancyAddress("");
    setVacancyRadiusFrom("");
    setVacancyRadiusTo("");
    setHideEventsOnMap(false);
    setVacancySkillQuery("");
    setSelectedVacancySkills([]);
    setSelectedVacancyLevels([]);
    setSelectedVacancyFormats([]);
    setSelectedVacancyEmployment([]);
    setVacancySalaryFrom("");
    setVacancySalaryTo("");
    setSelectedPublicationPeriods([]);
  };

  const resetEventFilters = () => {
    setSelectedEventCity("");
    setEventCityQuery("");
    setSelectedEventAddressLabel("");
    setSelectedEventAddressPoint(null);
    setEventAddress("");
    setEventRadiusFrom("");
    setEventRadiusTo("");
    setHideMentorshipOnEventMap(false);
    setEventThemeQuery("");
    setSelectedEventThemes([]);
    setEventOrganizerQuery("");
    setSelectedEventTypes([]);
    setSelectedEventFormats([]);
    setSelectedEventCosts([]);
    setEventCostFrom("");
    setEventCostTo("");
    setEventDate("");
  };

  const resetMentorshipFilters = () => {
    setSelectedMentorCity("");
    setMentorCityQuery("");
    setSelectedMentorAddressLabel("");
    setSelectedMentorAddressPoint(null);
    setMentorAddress("");
    setMentorRadiusFrom("");
    setMentorRadiusTo("");
    setHideEventsOnMentorMap(false);
    setMentorExpertiseQuery("");
    setSelectedMentorExpertise([]);
    setMentorOrganizerQuery("");
    setSelectedMentorshipDirections([]);
    setSelectedMentorAvailability([]);
    setSelectedMentorExperience([]);
    setMentorCostFrom("");
    setMentorCostTo("");
    setSelectedMentorFormats([]);
    setMentorDate("");
  };

  useEffect(() => {
    let isActive = true;
    const normalizedQuery = vacancyCityQuery.trim();

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
  }, [vacancyCityQuery]);

  useEffect(() => {
    let isActive = true;
    const normalizedQuery = eventCityQuery.trim();

    if (!normalizedQuery) {
      setEventCitySuggestions([]);
      setIsEventCityLoading(false);
      setHasEventCityError(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsEventCityLoading(true);
      setHasEventCityError(false);
      void getCitySuggestions(normalizedQuery)
        .then((items) => {
          if (!isActive) {
            return;
          }
          setEventCitySuggestions(items);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }
          setHasEventCityError(true);
          setEventCitySuggestions([]);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setIsEventCityLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [eventCityQuery]);

  useEffect(() => {
    let isActive = true;
    const normalizedQuery = mentorCityQuery.trim();

    if (!normalizedQuery) {
      setMentorCitySuggestions([]);
      setIsMentorCityLoading(false);
      setHasMentorCityError(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsMentorCityLoading(true);
      setHasMentorCityError(false);
      void getCitySuggestions(normalizedQuery)
        .then((items) => {
          if (!isActive) {
            return;
          }
          setMentorCitySuggestions(items);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }
          setHasMentorCityError(true);
          setMentorCitySuggestions([]);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setIsMentorCityLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [mentorCityQuery]);

  useEffect(() => {
    let isActive = true;
    const normalizedQuery = vacancyAddress.trim();

    if (!normalizedQuery) {
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
  }, [selectedCity, vacancyAddress]);

  useEffect(() => {
    let isActive = true;
    const normalizedQuery = eventAddress.trim();

    if (!normalizedQuery) {
      setEventAddressSuggestions([]);
      setIsEventAddressLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsEventAddressLoading(true);
      void getAddressSuggestions(normalizedQuery, selectedCity)
        .then((items) => {
          if (!isActive) {
            return;
          }
          setEventAddressSuggestions(items);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }
          setEventAddressSuggestions([]);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setIsEventAddressLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [eventAddress, selectedCity]);

  useEffect(() => {
    let isActive = true;
    const normalizedQuery = mentorAddress.trim();

    if (!normalizedQuery) {
      setMentorAddressSuggestions([]);
      setIsMentorAddressLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsMentorAddressLoading(true);
      void getAddressSuggestions(normalizedQuery, selectedCity)
        .then((items) => {
          if (!isActive) {
            return;
          }
          setMentorAddressSuggestions(items);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }
          setMentorAddressSuggestions([]);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setIsMentorAddressLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [mentorAddress, selectedCity]);

  useEffect(() => {
    onSelectOpportunityRef.current = onSelectOpportunity;
  }, [onSelectOpportunity]);

  useEffect(() => {
    onCloseDetailsRef.current = onCloseDetails;
  }, [onCloseDetails]);

  useEffect(() => {
    const container = mapContainerRef.current;

    if (!container || mapInstanceRef.current) {
      return;
    }

    if (!env.map2gisKey) {
      setMapError("Для отображения карты 2GIS добавьте VITE_2GIS_MAP_KEY во frontend env.");
      return;
    }

    let isMounted = true;

    setMapError(null);

    void load()
      .then((mapglAPI) => {
        if (!isMounted) {
          return;
        }

        mapInstanceRef.current = new mapglAPI.Map(container, {
          center: mapCenter,
          zoom: 12,
          key: env.map2gisKey,
          zoomControl: false,
          trafficControl: false,
          scaleControl: false,
          copyright: "bottomLeft",
        });
        setIsMapReady(true);

        window.requestAnimationFrame(() => {
          mapInstanceRef.current?.invalidateSize();
          window.requestAnimationFrame(() => {
            mapInstanceRef.current?.invalidateSize();
            setIsMapVisible(true);
          });
        });
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setMapError("Не удалось загрузить карту 2GIS. Проверьте ключ и доступность API.");
      });

    return () => {
      isMounted = false;
      clustererRef.current?.destroy();
      clustererRef.current = null;
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || clustererRef.current) {
      return;
    }

    const map = mapInstanceRef.current;
    const clusterer = new Clusterer(map as never, {
      radius: 64,
      disableClusteringAtZoom: 13,
      clusterStyle: (pointsCount) => createClusterStyle(pointsCount, roleName),
    });

    clusterer.on("click", (event) => {
      if (event.target.type === "cluster") {
        const expansionZoom = clusterer.getClusterExpansionZoom(event.target.id);
        map.setCenter(event.lngLat, { duration: 280 });
        map.setZoom(Math.min(expansionZoom, 14), { duration: 280 });
        return;
      }

      const opportunityId = event.target.data.userData?.opportunityId as string | undefined;
      if (opportunityId) {
        onSelectOpportunityRef.current(opportunityId);
      }
    });

    clustererRef.current = clusterer;

    return () => {
      clusterer.destroy();
      if (clustererRef.current === clusterer) {
        clustererRef.current = null;
      }
    };
  }, [isMapReady, roleName]);

  useEffect(() => {
    if (!isMapReady || !mapContainerRef.current || !mapInstanceRef.current) {
      return;
    }

    const map = mapInstanceRef.current;
    const container = mapContainerRef.current;
    let frameId = 0;

    const syncSize = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        map.invalidateSize();
      });
    };

    syncSize();

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
    });

    resizeObserver.observe(container);
    window.addEventListener("resize", syncSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncSize);
      window.cancelAnimationFrame(frameId);
    };
  }, [isMapReady]);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      return;
    }

    const map = mapInstanceRef.current;
    const handleMoveStart = (event: { isUser: boolean }) => {
      if (!event.isUser || !selectedOpportunityId) {
        return;
      }

      onCloseDetailsRef.current();
    };

    map.on("movestart", handleMoveStart);

    return () => {
      map.off("movestart", handleMoveStart);
    };
  }, [selectedOpportunityId]);

  useEffect(() => {
    if (!isMapReady || !clustererRef.current) {
      return;
    }

    const inputMarkers: InputMarker[] = filteredOpportunities.map((opportunity) => {
      const markerColor = resolveMarkerColor(opportunity, favoriteOpportunityIds);
      const isSelected = opportunity.id === selectedOpportunityId;

      return {
        type: "webgl",
        coordinates: [opportunity.longitude, opportunity.latitude],
        icon: createPinIcon(markerColor, isSelected),
        hoverIcon: createPinIcon(markerColor, true),
        size: isSelected ? [38, 38] : [34, 34],
        hoverSize: [38, 38],
        anchor: isSelected ? [19, 38] : [17, 34],
        hoverAnchor: [19, 38],
        zIndex: isSelected ? 3 : 2,
        userData: {
          opportunityId: opportunity.id,
        },
      };
    });

    clustererRef.current.load(inputMarkers);
  }, [favoriteOpportunityIds, filteredOpportunities, isMapReady, selectedOpportunityId]);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      return;
    }

    let animationFrameId = 0;
    const startedAt = window.performance.now();

    const syncDuringTransition = (now: number) => {
      mapInstanceRef.current?.invalidateSize();

      if (now - startedAt < 560) {
        animationFrameId = window.requestAnimationFrame(syncDuringTransition);
      }
    };

    animationFrameId = window.requestAnimationFrame(syncDuringTransition);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [isExpanded]);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      return;
    }

    const rightPadding = selectedOpportunity ? (isExpanded ? 200 : 100) : 0;

    mapInstanceRef.current.setPadding(
      {
        top: 0,
        right: rightPadding,
        bottom: 0,
        left: 0,
      },
      { duration: 280 },
    );

    if (!selectedOpportunity) {
      return;
    }

    mapInstanceRef.current.setCenter(
      [selectedOpportunity.longitude, selectedOpportunity.latitude],
      { duration: 280 },
    );
    mapInstanceRef.current.setZoom(isExpanded ? 16.5 : 15.5, { duration: 280 });
  }, [isExpanded, selectedOpportunity, selectedOpportunityId]);

  useEffect(() => {
    if (!mapInstanceRef.current || selectedOpportunity) {
      return;
    }

    const shouldUpdateZoom = !hasAlignedInitialViewportRef.current;

    if (previousSelectedOpportunityIdRef.current && !selectedOpportunityId) {
      return;
    }

    if (cityMatchedOpportunities.length > 0) {
      const viewport = getViewportByCoordinates(cityMatchedOpportunities);
      applyViewport(mapInstanceRef.current, viewport, { duration: 320, shouldUpdateZoom });
      hasAlignedInitialViewportRef.current = true;
      return;
    }

    const knownViewport = selectedCityViewport ?? resolveViewportByCityName(selectedCity);

    if (knownViewport) {
      applyViewport(mapInstanceRef.current, knownViewport, { duration: 320, shouldUpdateZoom });
      hasAlignedInitialViewportRef.current = true;
      return;
    }

    let isActive = true;

    void getCityViewportByName(selectedCity)
      .then((fetchedViewport) => {
        if (!isActive || !mapInstanceRef.current || !fetchedViewport) {
          return;
        }

        applyViewport(mapInstanceRef.current, fetchedViewport, { duration: 320, shouldUpdateZoom });
        hasAlignedInitialViewportRef.current = true;
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [cityMatchedOpportunities, selectedCity, selectedCityViewport, selectedOpportunity, selectedOpportunityId]);

  useEffect(() => {
    if (!mapInstanceRef.current || selectedOpportunity || filteredOpportunities.length === 0 || hasAlignedInitialViewportRef.current) {
      return;
    }

    const viewport = getViewportByCoordinates(filteredOpportunities);
    mapInstanceRef.current.setCenter(viewport.center, { duration: 0 });
    mapInstanceRef.current.setZoom(viewport.zoom, { duration: 0 });
    hasAlignedInitialViewportRef.current = true;
  }, [filteredOpportunities, selectedOpportunity]);

  useEffect(() => {
    previousSelectedOpportunityIdRef.current = selectedOpportunityId;
  }, [selectedOpportunityId]);

  useEffect(() => {
    if (!selectedOpportunityId) {
      return;
    }

    if (filteredOpportunities.some((opportunity) => opportunity.id === selectedOpportunityId)) {
      return;
    }

    onCloseDetails();
  }, [filteredOpportunities, onCloseDetails, selectedOpportunityId]);

  const handleZoomIn = () => {
    if (!mapInstanceRef.current) {
      return;
    }

    mapInstanceRef.current.setZoom(mapInstanceRef.current.getZoom() + 1, { duration: 220 });
  };

  const handleZoomOut = () => {
    if (!mapInstanceRef.current) {
      return;
    }

    mapInstanceRef.current.setZoom(mapInstanceRef.current.getZoom() - 1, { duration: 220 });
  };

  const renderCitySection = (
    query: string,
    setQuery: (value: string) => void,
    selectedValue: string,
    setSelectedValue: (value: string) => void,
    suggestions: CitySuggestion[],
    isLoading: boolean,
    hasError: boolean,
    reset: () => void,
  ) => (
    <div className="map-view__filter-block">
      <div className="map-view__filter-block-head">
        <h3 className="map-view__filter-title">Город</h3>
        <button type="button" className="map-view__filter-reset-link" onClick={reset}>Сбросить</button>
      </div>
      <div className="city-selector__search map-view__city-search-shell">
        <span className="city-selector__search-icon" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            if (nextValue !== selectedValue) {
              setSelectedValue("");
            }
          }}
          placeholder="Поиск по городам"
          clearable
          className={`input--${themeVariant} input--sm city-selector__search-input map-view__filter-input`}
        />
      </div>
      {query.trim() && normalizeFilterText(query) !== normalizeFilterText(selectedValue) ? (
        <div className="city-selector__list map-view__city-selector-list" role="listbox" aria-label="Список городов">
          {isLoading ? <div className="city-selector__empty">Ищем города...</div> : null}
          {!isLoading && hasError ? <div className="city-selector__empty">Не удалось загрузить список городов.</div> : null}
          {!isLoading && !hasError && suggestions.length === 0 ? <div className="city-selector__empty">Ничего не найдено.</div> : null}
          {!isLoading && !hasError && suggestions.map((city) => (
            <button
              key={city.id}
              type="button"
              className={city.name === selectedValue ? "city-selector__option city-selector__option--active" : "city-selector__option"}
              onClick={() => {
                setSelectedValue(city.name);
                setQuery(city.name);
                onSelectCity(city.name);
              }}
            >
              <span className="city-selector__option-label">{city.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderRadiusSection = (
    title: string,
    address: string,
    setAddress: (value: string) => void,
    selectedAddressLabel: string,
    setSelectedAddressLabel: (value: string) => void,
    setSelectedAddressPoint: (value: { lat: number; lon: number } | null) => void,
    suggestions: AddressSuggestion[],
    isLoading: boolean,
    from: string,
    setFrom: (value: string) => void,
    to: string,
    setTo: (value: string) => void,
    reset: () => void,
  ) => (
    <div className="map-view__filter-block">
      <div className="map-view__filter-block-head">
        <h3 className="map-view__filter-title">{title}</h3>
        <button type="button" className="map-view__filter-reset-link" onClick={reset}>Сбросить</button>
      </div>
      <div className="city-selector__search map-view__city-search-shell">
        <span className="city-selector__search-icon" aria-hidden="true" />
        <Input
          value={address}
          onChange={(event) => {
            const nextValue = event.target.value;
            setAddress(nextValue);
            if (nextValue !== selectedAddressLabel) {
              setSelectedAddressLabel("");
              setSelectedAddressPoint(null);
            }
          }}
          placeholder="Улица и номер дома"
          clearable
          className={`input--${themeVariant} input--sm city-selector__search-input map-view__filter-input`}
        />
      </div>
      {address.trim() && normalizeFilterText(address) !== normalizeFilterText(selectedAddressLabel) ? (
        <div className="city-selector__list map-view__city-selector-list" role="listbox" aria-label="Список адресов">
          {isLoading ? (
            <div className="city-selector__empty">Загружаем адреса...</div>
          ) : suggestions.length > 0 ? (
            suggestions.map((item) => (
              <button
                key={item.id}
                type="button"
                className="city-selector__option map-view__address-option"
                onClick={() => {
                  setSelectedAddressLabel(item.fullAddress);
                  setSelectedAddressPoint(item.point ? { lat: item.point.lat, lon: item.point.lon } : null);
                  setAddress(item.fullAddress);
                }}
              >
                <span className="city-selector__option-label map-view__address-option-title">{item.fullAddress}</span>
                {item.subtitle ? <span className="map-view__address-option-subtitle">{item.subtitle}</span> : null}
              </button>
            ))
          ) : (
            <div className="city-selector__empty">Ничего не найдено.</div>
          )}
        </div>
      ) : null}
      <div className="map-view__filter-range-grid">
        <Input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="от" className={`input--${themeVariant} input--sm map-view__filter-input`} />
        <Input value={to} onChange={(event) => setTo(event.target.value)} placeholder="до" className={`input--${themeVariant} input--sm map-view__filter-input`} />
      </div>
    </div>
  );

  const renderDisplaySection = (label: string, checked: boolean, onChange: (checked: boolean) => void) => (
    <div className="map-view__filter-block">
      <h3 className="map-view__filter-title">Отображение</h3>
      <label className="map-view__filter-checkbox-row">
        <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} variant={themeVariant} />
        <span>{label}</span>
      </label>
    </div>
  );

  const renderTagSection = (
    title: string,
    query: string,
    setQuery: (value: string) => void,
    selected: string[],
    setSelected: (value: string[]) => void,
    options: string[],
    isLoading: boolean,
    groups: FilterGroup[],
    reset: () => void,
    popular?: string[],
  ) => (
    <div className="map-view__filter-block">
      <div className="map-view__filter-block-head">
        <h3 className="map-view__filter-title">{title}</h3>
        <button type="button" className="map-view__filter-reset-link" onClick={reset}>Сбросить</button>
      </div>
      <div className="city-selector__search map-view__city-search-shell">
        <span className="city-selector__search-icon" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск навыка"
          clearable
          className={`input--${themeVariant} input--sm city-selector__search-input map-view__filter-input`}
        />
      </div>
      {query.trim() ? (
        <div className="city-selector__list map-view__city-selector-list" role="listbox" aria-label={title}>
          {isLoading ? <div className="city-selector__empty">Загружаем список...</div> : null}
          {!isLoading && options.length === 0 ? <div className="city-selector__empty">Ничего не найдено.</div> : null}
          {!isLoading && options.map((item) => (
            <button
              key={item}
              type="button"
              className="city-selector__option"
              onClick={() => {
                toggleSelection(item, selected, setSelected);
                setQuery("");
              }}
            >
              <span className="city-selector__option-label">{item}</span>
            </button>
          ))}
        </div>
      ) : null}
      {selected.length > 0 ? (
        <div className="map-view__filter-chip-list">
          {selected.map((item) => (
            <button
              key={item}
              type="button"
              className={`badge badge--${badgeThemeVariant} map-view__filter-chip map-view__filter-chip--active`}
              onClick={() => toggleSelection(item, selected, setSelected)}
            >
              <span className="badge__label">
                <span>{item}</span>
                <span className="map-view__filter-chip-remove" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {popular?.length ? (
        <div className="map-view__filter-subsection">
          <p className="map-view__filter-subtitle">Популярные</p>
          <div className="map-view__filter-chip-list">
            {popular.map((item) => (
              <button
                key={item}
                type="button"
                className={
                  selected.includes(item)
                    ? `badge badge--${badgeThemeVariant} map-view__filter-chip map-view__filter-chip--active`
                    : `badge badge--${badgeThemeVariant} map-view__filter-chip`
                }
                onClick={() => toggleSelection(item, selected, setSelected)}
              >
                <span className="badge__label">{item}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="map-view__filter-groups">
        {filterGroups(groups, query).map((group) => (
          <div key={group.id} className="map-view__filter-subsection">
            <p className="map-view__filter-subtitle">{group.title}</p>
            <div className="map-view__filter-chip-list">
              {group.items.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={
                    selected.includes(item)
                      ? `badge badge--${badgeThemeVariant} map-view__filter-chip map-view__filter-chip--active`
                      : `badge badge--${badgeThemeVariant} map-view__filter-chip`
                  }
                  onClick={() => toggleSelection(item, selected, setSelected)}
                >
                  <span className="badge__label">{item}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderCheckboxSection = (
    title: string,
    options: string[],
    selected: string[],
    setSelected: (value: string[]) => void,
    singleColumn = false,
  ) => (
    <div className="map-view__filter-block">
      <div className="map-view__filter-block-head">
        <h3 className="map-view__filter-title">{title}</h3>
        <button type="button" className="map-view__filter-reset-link" onClick={() => setSelected([])}>Сбросить</button>
      </div>
      <div className={singleColumn ? "map-view__filter-checkbox-grid map-view__filter-checkbox-grid--single" : "map-view__filter-checkbox-grid"}>
        {options.map((option) => (
          <label key={option} className="map-view__filter-checkbox-row">
            <Checkbox
              checked={selected.includes(option)}
              onChange={() => toggleSelection(option, selected, setSelected)}
              variant={themeVariant}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const renderAmountSection = (
    title: string,
    from: string,
    setFrom: (value: string) => void,
    to: string,
    setTo: (value: string) => void,
    reset: () => void,
    options?: string[],
    selected?: string[],
    setSelected?: (value: string[]) => void,
  ) => (
    <div className="map-view__filter-block">
      <div className="map-view__filter-block-head">
        <h3 className="map-view__filter-title">{title}</h3>
        <button type="button" className="map-view__filter-reset-link" onClick={reset}>Сбросить</button>
      </div>
      {options && selected && setSelected ? (
        <div className="map-view__filter-checkbox-grid map-view__filter-checkbox-grid--single">
          {options.map((option) => (
            <label key={option} className="map-view__filter-checkbox-row">
              <Checkbox
                checked={selected.includes(option)}
                onChange={() => toggleSelection(option, selected, setSelected)}
                variant={themeVariant}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="map-view__filter-range-grid">
        <Input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="от" className={`input--${themeVariant} input--sm map-view__filter-input`} />
        <Input value={to} onChange={(event) => setTo(event.target.value)} placeholder="до" className={`input--${themeVariant} input--sm map-view__filter-input`} />
      </div>
    </div>
  );

  const renderOrganizerSection = (
    title: string,
    query: string,
    setQuery: (value: string) => void,
    items: string[],
    reset: () => void,
  ) => (
    <div className="map-view__filter-block">
      <div className="map-view__filter-block-head">
        <h3 className="map-view__filter-title">{title}</h3>
        <button type="button" className="map-view__filter-reset-link" onClick={reset}>Сбросить</button>
      </div>
      <div className="city-selector__search map-view__city-search-shell">
        <span className="city-selector__search-icon" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск организатора"
          clearable
          className={`input--${themeVariant} input--sm city-selector__search-input map-view__filter-input`}
        />
      </div>
      {query.trim() ? (
        <div className="city-selector__list map-view__city-selector-list" role="listbox" aria-label={title}>
          {filterSuggestions(items, query).length === 0 ? <div className="city-selector__empty">Ничего не найдено.</div> : null}
          {filterSuggestions(items, query).map((item) => (
            <button
              key={item}
              type="button"
              className="city-selector__option"
              onClick={() => setQuery(item)}
            >
              <span className="city-selector__option-label">{item}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderDateSection = (title: string, value: string, onChange: (value: string) => void, reset: () => void) => (
    <div className="map-view__filter-block">
      <div className="map-view__filter-block-head">
        <h3 className="map-view__filter-title">{title}</h3>
        <button type="button" className="map-view__filter-reset-link" onClick={reset}>Сбросить</button>
      </div>
      <DateInput value={value} onChange={onChange} variant={themeVariant} className="map-view__filter-date" />
    </div>
  );

  const renderFilterFooter = (onReset: () => void) => (
    <div className="map-view__filter-footer">
      <Button type="button" variant={outlineThemeVariant} size="sm" fullWidth onClick={onReset}>
        Сбросить фильтры
      </Button>
    </div>
  );

  return (
    <section
      className={isTransitioning ? "map-view map-view--transitioning" : "map-view"}
      aria-label="Карта вакансий"
    >
      <div className="map-view__filters">
        <button
          type="button"
          className={
            isFiltersVisible
              ? "map-view__filter-card map-view__filter-card--compact map-view__filter-toggle"
              : "map-view__filter-card map-view__filter-card--compact map-view__filter-toggle map-view__filter-toggle--collapsed"
          }
          onClick={() => setIsFiltersVisible((current) => !current)}
        >
          <span
            className={
              isFiltersVisible
                ? "map-view__filter-toggle-content"
                : "map-view__filter-toggle-content map-view__filter-toggle-content--collapsed"
            }
          >
            <span className="map-view__filter-toggle-label">Скрыть фильтры</span>
            <span
              className={
                isFiltersVisible
                  ? "map-view__filter-toggle-icon"
                  : "map-view__filter-toggle-icon map-view__filter-toggle-icon--collapsed"
              }
              aria-hidden="true"
            />
          </span>
          <span
            className={
              isFiltersVisible
                ? "map-view__filter-icon map-view__filter-icon--hidden"
                : "map-view__filter-icon"
            }
            aria-hidden="true"
          />
        </button>

        <div
          className={
            isFiltersVisible
              ? "map-view__filter-stack"
              : "map-view__filter-stack map-view__filter-stack--hidden"
          }
          aria-hidden={!isFiltersVisible}
        >
          <div className="map-view__filter-group">
            <div className="map-view__filter-group-menu">
              <button
                type="button"
                className="map-view__filter-group-trigger"
                onClick={() => setIsOpportunitiesOpen((current) => !current)}
              >
                <span className="map-view__filter-accordion-title">
                  Вакансии и стажировки
                </span>
                <span
                  className={
                    isOpportunitiesOpen
                      ? "map-view__filter-category-icon"
                      : "map-view__filter-category-icon map-view__filter-category-icon--collapsed"
                  }
                  aria-hidden="true"
                />
              </button>
              <button type="button" className="map-view__filter-reset-link" onClick={resetVacancyFilters}>Сбросить</button>
            </div>
            <div
              className={
                isOpportunitiesOpen
                  ? "map-view__filter-group-panel"
                  : "map-view__filter-group-panel map-view__filter-group-panel--hidden"
              }
              aria-hidden={!isOpportunitiesOpen}
            >
              {renderCitySection(vacancyCityQuery, setVacancyCityQuery, selectedVacancyCity, setSelectedVacancyCity, vacancyCitySuggestions, isVacancyCityLoading, hasVacancyCityError, () => {
                setSelectedVacancyCity("");
                setVacancyCityQuery("");
              })}
              {renderRadiusSection(
                "Радиус поиска, км",
                vacancyAddress,
                setVacancyAddress,
                selectedVacancyAddressLabel,
                setSelectedVacancyAddressLabel,
                setSelectedVacancyAddressPoint,
                vacancyAddressSuggestions,
                isVacancyAddressLoading,
                vacancyRadiusFrom,
                setVacancyRadiusFrom,
                vacancyRadiusTo,
                setVacancyRadiusTo,
                () => {
                  setSelectedVacancyAddressLabel("");
                  setSelectedVacancyAddressPoint(null);
                  setVacancyAddress("");
                  setVacancyRadiusFrom("");
                  setVacancyRadiusTo("");
                },
              )}
              {renderDisplaySection("Не отображать на карте вакансии и стажировки", hideEventsOnMap, setHideEventsOnMap)}
              {renderTagSection(
                "Навыки (Стек)",
                vacancySkillQuery,
                setVacancySkillQuery,
                selectedVacancySkills,
                setSelectedVacancySkills,
                filteredVacancySkillOptions,
                tagCatalogQuery.isLoading,
                vacancySkillGroups,
                () => {
                  setVacancySkillQuery("");
                  setSelectedVacancySkills([]);
                },
                popularVacancySkills,
              )}
              {renderCheckboxSection("Уровень", vacancyLevels, selectedVacancyLevels, setSelectedVacancyLevels)}
              {renderCheckboxSection("Формат", formatOptions, selectedVacancyFormats, setSelectedVacancyFormats)}
              {renderCheckboxSection("Занятость", employmentOptions, selectedVacancyEmployment, setSelectedVacancyEmployment)}
              {renderAmountSection(
                "Зарплата",
                vacancySalaryFrom,
                setVacancySalaryFrom,
                vacancySalaryTo,
                setVacancySalaryTo,
                () => {
                  setVacancySalaryFrom("");
                  setVacancySalaryTo("");
                },
              )}
              {renderCheckboxSection("Дата публикации", publicationOptions, selectedPublicationPeriods, setSelectedPublicationPeriods, true)}
              {renderFilterFooter(resetVacancyFilters)}
            </div>
          </div>

          <div className="map-view__filter-group">
            <div className="map-view__filter-group-menu">
              <button
                type="button"
                className="map-view__filter-group-trigger"
                onClick={() => setIsEventsOpen((current) => !current)}
              >
                <span className="map-view__filter-accordion-title">Мероприятия</span>
                <span
                  className={
                    isEventsOpen
                      ? "map-view__filter-category-icon"
                      : "map-view__filter-category-icon map-view__filter-category-icon--collapsed"
                  }
                  aria-hidden="true"
                />
              </button>
              <button type="button" className="map-view__filter-reset-link" onClick={resetEventFilters}>Сбросить</button>
            </div>
            <div
              className={
                isEventsOpen
                  ? "map-view__filter-group-panel"
                  : "map-view__filter-group-panel map-view__filter-group-panel--hidden"
              }
              aria-hidden={!isEventsOpen}
            >
              {renderCitySection(eventCityQuery, setEventCityQuery, selectedEventCity, setSelectedEventCity, eventCitySuggestions, isEventCityLoading, hasEventCityError, () => {
                setSelectedEventCity("");
                setEventCityQuery("");
              })}
              {renderRadiusSection(
                "Радиус поиска, км",
                eventAddress,
                setEventAddress,
                selectedEventAddressLabel,
                setSelectedEventAddressLabel,
                setSelectedEventAddressPoint,
                eventAddressSuggestions,
                isEventAddressLoading,
                eventRadiusFrom,
                setEventRadiusFrom,
                eventRadiusTo,
                setEventRadiusTo,
                () => {
                  setSelectedEventAddressLabel("");
                  setSelectedEventAddressPoint(null);
                  setEventAddress("");
                  setEventRadiusFrom("");
                  setEventRadiusTo("");
                },
              )}
              {renderDisplaySection("Не отображать на карте мероприятия", hideMentorshipOnEventMap, setHideMentorshipOnEventMap)}
              {renderTagSection(
                "Тематика",
                eventThemeQuery,
                setEventThemeQuery,
                selectedEventThemes,
                setSelectedEventThemes,
                filteredEventThemeOptions,
                tagCatalogQuery.isLoading,
                themeGroups,
                () => {
                  setEventThemeQuery("");
                  setSelectedEventThemes([]);
                },
              )}
              {renderOrganizerSection("Организатор", eventOrganizerQuery, setEventOrganizerQuery, registeredCompanyOptions, () => setEventOrganizerQuery(""))}
              {renderCheckboxSection("Тип", eventTypeOptions, selectedEventTypes, setSelectedEventTypes, true)}
              {renderCheckboxSection("Формат", formatOptions, selectedEventFormats, setSelectedEventFormats)}
              {renderAmountSection(
                "Стоимость",
                eventCostFrom,
                setEventCostFrom,
                eventCostTo,
                setEventCostTo,
                () => {
                  setSelectedEventCosts([]);
                  setEventCostFrom("");
                  setEventCostTo("");
                },
                costOptions,
                selectedEventCosts,
                setSelectedEventCosts,
              )}
              {renderDateSection("Дата проведения", eventDate, setEventDate, () => setEventDate(""))}
              {renderFilterFooter(resetEventFilters)}
            </div>
          </div>

          <div className="map-view__filter-group">
            <div className="map-view__filter-group-menu">
              <button
                type="button"
                className="map-view__filter-group-trigger"
                onClick={() => setIsMentorshipOpen((current) => !current)}
              >
                <span className="map-view__filter-accordion-title">Менторские программы</span>
                <span
                  className={
                    isMentorshipOpen
                      ? "map-view__filter-category-icon"
                      : "map-view__filter-category-icon map-view__filter-category-icon--collapsed"
                  }
                  aria-hidden="true"
                />
              </button>
              <button type="button" className="map-view__filter-reset-link" onClick={resetMentorshipFilters}>Сбросить</button>
            </div>
            <div
              className={
                isMentorshipOpen
                  ? "map-view__filter-group-panel"
                  : "map-view__filter-group-panel map-view__filter-group-panel--hidden"
              }
              aria-hidden={!isMentorshipOpen}
            >
              {renderCitySection(mentorCityQuery, setMentorCityQuery, selectedMentorCity, setSelectedMentorCity, mentorCitySuggestions, isMentorCityLoading, hasMentorCityError, () => {
                setSelectedMentorCity("");
                setMentorCityQuery("");
              })}
              {renderRadiusSection(
                "Радиус поиска, км",
                mentorAddress,
                setMentorAddress,
                selectedMentorAddressLabel,
                setSelectedMentorAddressLabel,
                setSelectedMentorAddressPoint,
                mentorAddressSuggestions,
                isMentorAddressLoading,
                mentorRadiusFrom,
                setMentorRadiusFrom,
                mentorRadiusTo,
                setMentorRadiusTo,
                () => {
                  setSelectedMentorAddressLabel("");
                  setSelectedMentorAddressPoint(null);
                  setMentorAddress("");
                  setMentorRadiusFrom("");
                  setMentorRadiusTo("");
                },
              )}
              {renderDisplaySection("Не отображать на карте менторские программы", hideEventsOnMentorMap, setHideEventsOnMentorMap)}
              {renderTagSection(
                "Область экспертизы",
                mentorExpertiseQuery,
                setMentorExpertiseQuery,
                selectedMentorExpertise,
                setSelectedMentorExpertise,
                filteredMentorExpertiseOptions,
                tagCatalogQuery.isLoading,
                mentorExpertiseGroups,
                () => {
                  setMentorExpertiseQuery("");
                  setSelectedMentorExpertise([]);
                },
              )}
              {renderOrganizerSection("Организатор", mentorOrganizerQuery, setMentorOrganizerQuery, registeredCompanyOptions, () => setMentorOrganizerQuery(""))}
              {renderCheckboxSection("Направление менторства", mentorshipDirections, selectedMentorshipDirections, setSelectedMentorshipDirections, true)}
              {renderCheckboxSection("Доступность ментора", mentorAvailabilityOptions, selectedMentorAvailability, setSelectedMentorAvailability, true)}
              {renderCheckboxSection("Опыт ментора", mentorExperienceOptions, selectedMentorExperience, setSelectedMentorExperience, true)}
              {renderAmountSection(
                "Стоимость",
                mentorCostFrom,
                setMentorCostFrom,
                mentorCostTo,
                setMentorCostTo,
                () => {
                  setMentorCostFrom("");
                  setMentorCostTo("");
                },
              )}
              {renderCheckboxSection("Формат", formatOptions, selectedMentorFormats, setSelectedMentorFormats)}
              {renderDateSection("Дата проведения", mentorDate, setMentorDate, () => setMentorDate(""))}
              {renderFilterFooter(resetMentorshipFilters)}
            </div>
          </div>
        </div>
      </div>

      {selectedOpportunity ? (
        <div className="map-view__details">
          <div className="map-view__details-content">
            <div className="map-view__details-header">
              <div className="map-view__details-title-group">
                <h3 className="map-view__details-title" title={selectedOpportunity.title}>
                  {selectedOpportunity.title}
                </h3>
                <p className="map-view__details-kind">
                  {getOpportunityKindLabel(selectedOpportunity.kind)}
                </p>
              </div>
              <button
                type="button"
                className="map-view__details-close"
                aria-label="Закрыть карточку"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onCloseDetails}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 512 512"
                  className="map-view__details-close-icon"
                >
                  <path d="M256 297.195L50.023 503.172C44.1379 509.057 37.272 512 29.4253 512C21.5785 512 14.7126 509.057 8.82759 503.172C2.94253 497.287 0 490.421 0 482.575C0 474.728 2.94253 467.862 8.82759 461.977L214.805 256L8.82759 50.023C2.94253 44.1379 0 37.272 0 29.4253C0 21.5785 2.94253 14.7126 8.82759 8.82759C14.7126 2.94253 21.5785 0 29.4253 0C37.272 0 44.1379 2.94253 50.023 8.82759L256 214.805L461.977 8.82759C467.862 2.94253 474.728 0 482.575 0C490.421 0 497.287 2.94253 503.172 8.82759C509.057 14.7126 512 21.5785 512 29.4253C512 37.272 509.057 44.1379 503.172 50.023L297.195 256L503.172 461.977C509.057 467.862 512 474.728 512 482.575C512 490.421 509.057 497.287 503.172 503.172C497.287 509.057 490.421 512 482.575 512C474.728 512 467.862 509.057 461.977 503.172L256 297.195Z" />
                </svg>
              </button>
            </div>

            <div className="map-view__details-group">
              <div className="map-view__details-company-row">
                <p className="map-view__details-company">{selectedOpportunity.companyName}</p>
                {selectedOpportunity.companyVerified ? (
                  <span className="map-view__details-verified-icon" aria-hidden="true">
                    <img
                      src={verifiedIcon}
                      alt=""
                      aria-hidden="true"
                      className="map-view__details-verified-icon-image"
                    />
                  </span>
                ) : null}
              </div>
            </div>

            <div className="map-view__details-group">
              <p className="map-view__details-price">{selectedOpportunity.salaryLabel}</p>
              <p className="map-view__details-meta">{selectedOpportunity.locationLabel}</p>
            </div>

            <div className="map-view__details-group map-view__details-group--meta">
              <div className="map-view__details-tags">
                {selectedOpportunity.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="map-view__details-tag">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="map-view__details-secondary-group">
                <p className="map-view__details-secondary">
                  Уровень: {selectedOpportunity.levelLabel}
                </p>
                <p className="map-view__details-secondary">
                  Занятость: {selectedOpportunity.employmentLabel}
                </p>
              </div>
            </div>

            <div className="map-view__details-actions">
              <Button
                type="button"
                variant={roleName !== "employer" && isSelectedOpportunityApplied ? "danger-outline" : "secondary"}
                size="sm"
                className="map-view__details-apply"
                onClick={() => onApply?.(selectedOpportunity.id)}
              >
                {roleName !== "employer" && isSelectedOpportunityApplied ? "Отозвать отклик" : "Откликнуться"}
              </Button>
              <button
                type="button"
                className="map-view__details-favorite"
                aria-label={
                  isSelectedOpportunityFavorite ? "Убрать из избранного" : "Добавить в избранное"
                }
                title={
                  isSelectedOpportunityFavorite ? "Убрать из избранного" : "Добавить в избранное"
                }
                aria-pressed={isSelectedOpportunityFavorite}
                onClick={() => onToggleFavorite(selectedOpportunity.id)}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 512 489"
                  className="map-view__details-favorite-icon"
                >
                  <path
                    d={
                      isSelectedOpportunityFavorite
                        ? "M256 403.578L118.839 486.44C115.369 488.299 111.837 489.146 108.243 488.979C104.644 488.813 101.378 487.697 98.4453 485.633C95.5124 483.564 93.3127 480.844 91.8463 477.474C90.3798 474.103 90.1838 470.352 91.2581 466.218L127.331 310.17L6.65522 204.796C3.38928 202.066 1.35345 198.935 0.54771 195.403C-0.258031 191.866 -0.174773 188.413 0.797488 185.042C1.76975 181.672 3.6713 178.872 6.50214 176.641C9.33298 174.405 12.8138 173.123 16.9445 172.795L176.602 158.717L238.709 11.1026C240.444 7.50653 242.891 4.75706 246.049 2.85423C249.213 0.951398 252.53 0 256 0C259.47 0 262.787 0.951398 265.951 2.85423C269.109 4.75706 271.556 7.50653 273.291 11.1026L335.398 158.717L495.055 172.795C499.186 173.123 502.667 174.405 505.498 176.641C508.329 178.872 510.23 181.672 511.203 185.042C512.175 188.413 512.258 191.866 511.452 195.403C510.647 198.935 508.611 202.066 505.345 204.796L384.669 310.17L421.048 466.218C421.918 470.352 421.62 474.103 420.154 477.474C418.687 480.844 416.488 483.564 413.555 485.633C410.622 487.697 407.356 488.813 403.757 488.979C400.163 489.146 396.631 488.299 393.161 486.44L256 403.578Z"
                        : "M136.315 432.854L256 360.78L375.685 433.66L344.011 297.269L449.314 205.788L310.42 193.508L256 65.1881L201.58 192.702L62.6865 204.982L167.989 296.777L136.315 432.854ZM256 403.578L118.839 486.44C115.369 488.299 111.837 489.146 108.243 488.979C104.644 488.813 101.378 487.697 98.4453 485.633C95.5124 483.564 93.3127 480.844 91.8463 477.474C90.3798 474.103 90.1838 470.352 91.2581 466.218L127.331 310.17L6.65522 204.796C3.38928 202.066 1.35345 198.935 0.54771 195.403C-0.258031 191.866 -0.174773 188.413 0.797488 185.042C1.76975 181.672 3.6713 178.872 6.50214 176.641C9.33298 174.405 12.8138 173.123 16.9445 172.795L176.602 158.717L238.709 11.1026C240.444 7.50653 242.891 4.75706 246.049 2.85423C249.213 0.951398 252.53 0 256 0C259.47 0 262.787 0.951398 265.951 2.85423C269.109 4.75706 271.556 7.50653 273.291 11.1026L335.398 158.717L495.055 172.795C499.186 173.123 502.667 174.405 505.498 176.641C508.329 178.872 510.23 181.672 511.203 185.042C512.175 188.413 512.258 191.866 511.452 195.403C510.647 198.935 508.611 202.066 505.345 204.796L384.669 310.17L421.048 466.218C421.918 470.352 421.62 474.103 420.154 477.474C418.687 480.844 416.488 483.564 413.555 485.633C410.622 487.697 407.356 488.813 403.757 488.979C400.163 489.146 396.631 488.299 393.161 486.44L256 403.578Z"
                    }
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="map-view__expand-button"
        aria-label={isExpanded ? "Свернуть карту" : "Развернуть карту"}
        onClick={onToggleExpand}
      >
        <span
          className={
            isExpanded
              ? "map-view__expand-icon map-view__expand-icon--narrow"
              : "map-view__expand-icon map-view__expand-icon--expand"
          }
          aria-hidden="true"
        />
      </button>

      <div className="map-view__zoom-controls">
        <button
          type="button"
          className="map-view__zoom-button"
          aria-label="Приблизить карту"
          onClick={handleZoomIn}
        >
          <span className="map-view__zoom-icon map-view__zoom-icon--plus" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="map-view__zoom-button"
          aria-label="Отдалить карту"
          onClick={handleZoomOut}
        >
          <span className="map-view__zoom-icon map-view__zoom-icon--minus" aria-hidden="true" />
        </button>
      </div>

      <div
        className={
          isFormatBarExpanded
            ? "map-view__format-bar"
            : "map-view__format-bar map-view__format-bar--collapsed"
        }
      >
        <button
          type="button"
          className={
            isFormatBarExpanded
              ? "map-view__format-arrow map-view__format-arrow--expanded"
              : "map-view__format-arrow"
          }
          aria-label={isFormatBarExpanded ? "Скрыть форматы" : "Показать форматы"}
          aria-expanded={isFormatBarExpanded}
          onClick={() => setIsFormatBarExpanded((current) => !current)}
        />
        <div
          className={
            isFormatBarExpanded
              ? "map-view__format-content"
              : "map-view__format-content map-view__format-content--collapsed"
          }
          aria-hidden={!isFormatBarExpanded}
        >
          {formatLabels.map((item) => (
            <button
              key={item.value}
              type="button"
              className={
                selectedFormat.includes(item.value)
                  ? `map-view__format-chip map-view__format-chip--${item.value} map-view__format-chip--active`
                  : `map-view__format-chip map-view__format-chip--${item.value}`
              }
              onClick={() => setSelectedFormat((current) => toggleFormatSelection(current, item.value))}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={isMapVisible ? "map-view__map map-view__map--visible" : "map-view__map"}
      >
        <div
          ref={mapContainerRef}
          className={isMapVisible ? "map-view__canvas map-view__canvas--visible" : "map-view__canvas"}
        />
        {mapError ? (
          <div className="map-view__state">
            <div className="map-view__state-card">
              <h3 className="map-view__state-title">2GIS ещё не подключён</h3>
              <p className="map-view__state-text">{mapError}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
