import { env } from "../../shared/config/env";

export type CitySuggestion = {
  id: string;
  name: string;
  subtitle?: string;
  point?: {
    lon: number;
    lat: number;
  };
};

export type AddressSuggestion = {
  id: string;
  name: string;
  subtitle?: string;
  fullAddress: string;
  point?: {
    lon: number;
    lat: number;
  };
};

export type UniversitySuggestion = {
  id: string;
  name: string;
  subtitle?: string;
};

export type ReverseGeocodedAddress = {
  fullAddress: string;
  point?: {
    lon: number;
    lat: number;
  };
};

type TwoGisSuggestItem = {
  id?: string;
  address_name?: string;
  full_name?: string;
  full_address_name?: string;
  name?: string;
  subtype?: string;
  point?: {
    lon?: number;
    lat?: number;
  };
};

type TwoGisSuggestResponse = {
  result?: {
    items?: TwoGisSuggestItem[];
  };
};

type HeadHunterUniversityItem = {
  id?: string;
  text?: string;
  acronym?: string | null;
  synonyms?: string | null;
  area?: {
    id?: string;
    name?: string;
  };
};

type HeadHunterUniversitySuggestResponse = {
  items?: HeadHunterUniversityItem[];
};

export const popularCities: CitySuggestion[] = [
  { id: "moscow", name: "Москва", point: { lon: 37.6176, lat: 55.7558 } },
  { id: "saint-petersburg", name: "Санкт-Петербург", point: { lon: 30.3159, lat: 59.9391 } },
  { id: "kazan", name: "Казань", point: { lon: 49.1221, lat: 55.7887 } },
  { id: "novosibirsk", name: "Новосибирск", point: { lon: 82.9204, lat: 55.0302 } },
  { id: "cheboksary", name: "Чебоксары", point: { lon: 47.2512, lat: 56.1287 } },
];

const addressSubtypeLabels: Record<string, string | null> = {
  place: null,
  street: "Улица",
  building: "Здание",
  house: "Дом",
  housing: "Корпус",
  entrance: "Подъезд",
  district: "Район",
  microdistrict: "Микрорайон",
  residential_area: "Жилой район",
  settlement: "Населенный пункт",
  village: "Деревня",
  city: "Город",
  region: "Регион",
  station: "Станция",
  metro: "Метро",
};

const allowedAddressSubtypes = new Set([
  "street",
  "building",
  "house",
  "housing",
  "district",
  "microdistrict",
  "residential_area",
]);

function isAddressLikeSuggestion(item: TwoGisSuggestItem, cityName?: string) {
  const normalizedSubtype = item.subtype?.trim().toLowerCase();
  const fullAddress = item.full_address_name?.trim() || item.full_name?.trim() || item.name?.trim() || "";
  const normalizedFullAddress = fullAddress.toLowerCase();
  const normalizedCityName = cityName?.trim().toLowerCase();

  if (normalizedCityName && normalizedFullAddress === normalizedCityName) {
    return false;
  }

  if (!normalizedSubtype) {
    return Boolean(fullAddress) && /[\d,/.-]/.test(fullAddress);
  }

  return allowedAddressSubtypes.has(normalizedSubtype);
}

function normalizeAddressSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function matchesAddressQuery(item: TwoGisSuggestItem, query: string) {
  const normalizedQuery = normalizeAddressSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const candidates = [
    item.name,
    item.address_name,
    item.full_name,
    item.full_address_name,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeAddressSearchText(value));

  return candidates.some((candidate) => candidate.includes(normalizedQuery));
}

function buildAddressQueryVariants(query: string, cityName?: string) {
  const normalizedQuery = query.trim();
  const normalizedCityName = cityName?.trim();

  if (!normalizedQuery) {
    return [];
  }

  const variants = [
    normalizedCityName ? `${normalizedCityName}, ${normalizedQuery}` : normalizedQuery,
    normalizedCityName ? `${normalizedCityName}, улица ${normalizedQuery}` : `улица ${normalizedQuery}`,
    normalizedCityName ? `${normalizedCityName}, ул ${normalizedQuery}` : `ул ${normalizedQuery}`,
    normalizedQuery,
    `улица ${normalizedQuery}`,
    `ул ${normalizedQuery}`,
  ].filter(Boolean);

  return Array.from(new Set(variants));
}

function resolveAddressSubtitle(subtype?: string) {
  const trimmedSubtype = subtype?.trim();
  const normalizedSubtype = trimmedSubtype?.toLowerCase();

  if (!normalizedSubtype) {
    return undefined;
  }

  if (normalizedSubtype in addressSubtypeLabels) {
    return addressSubtypeLabels[normalizedSubtype] ?? undefined;
  }

  return trimmedSubtype;
}

function resolveCityDisplayName(item: TwoGisSuggestItem) {
  const explicitName = item.name?.trim();

  if (explicitName) {
    return explicitName;
  }

  const fallbackName = item.full_name ?? item.full_address_name;

  if (!fallbackName) {
    return null;
  }

  const parts = fallbackName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts[parts.length - 1] ?? fallbackName;
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
}

function matchesPreferredCity(city: string | undefined, cityName?: string) {
  const normalizedCityName = cityName?.trim();

  if (!normalizedCityName || !city) {
    return false;
  }

  return normalizeSearchText(city).includes(normalizeSearchText(normalizedCityName));
}

function formatUniversityDisplayName(value: string) {
  return value
    .trim()
    .replace(/^Филиал\s+/iu, "")
    .replace(/^Представительство\s+/iu, "")
    .replace(/\s*,\s*[^,]+$/u, "")
    .replace(/\s+им\.\s*([А-ЯЁ])\.?\s*([А-ЯЁ])\.?/gu, " им. $1. $2.")
    .replace(/\s+/g, " ")
    .trim();
}

function isIgnoredUniversityBranch(text: string) {
  const normalizedText = normalizeSearchText(text);

  return normalizedText.startsWith("филиал ") || normalizedText.startsWith("представительство ");
}

export async function getUniversitySuggestions(
  query: string,
  cityName?: string,
): Promise<UniversitySuggestion[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const searchParams = new URLSearchParams({
    text: normalizedQuery,
    locale: "RU",
  });

  const response = await fetch(`https://api.hh.ru/suggests/educational_institutions?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to load university suggestions");
  }

  const data = (await response.json()) as HeadHunterUniversitySuggestResponse;
  const items = data.items ?? [];

  const suggestions = items
    .filter((item) => Boolean(item.text?.trim()))
    .filter((item) => !isIgnoredUniversityBranch(item.text ?? ""))
    .map((item, index): UniversitySuggestion | null => {
      const name = item.text ? formatUniversityDisplayName(item.text) : "";

      if (!name) {
        return null;
      }

      const subtitleParts = [item.area?.name?.trim(), item.acronym?.trim()].filter(Boolean);
      const suggestionId = item.id ?? `${name}-${index}`;

      return {
        id: suggestionId,
        name,
        subtitle: subtitleParts.length > 0 ? subtitleParts.join(", ") : undefined,
      } satisfies UniversitySuggestion;
    })
    .filter((item): item is UniversitySuggestion => item !== null);

  const deduplicatedSuggestions = Array.from(new Map(suggestions.map((item) => [item.name, item])).values());

  if (!cityName?.trim()) {
    return deduplicatedSuggestions;
  }

  const itemsById = new Map(
    items.map((item, index) => {
      const name = item.text ? formatUniversityDisplayName(item.text) : "";
      return [item.id ?? `${name}-${index}`, item] as const;
    }),
  );

  return deduplicatedSuggestions.sort((left, right) => {
    const leftItem = itemsById.get(left.id);
    const rightItem = itemsById.get(right.id);
    const leftMatchesCity = matchesPreferredCity(leftItem?.area?.name, cityName);
    const rightMatchesCity = matchesPreferredCity(rightItem?.area?.name, cityName);

    if (leftMatchesCity === rightMatchesCity) {
      return 0;
    }

    return leftMatchesCity ? -1 : 1;
  });
}

export async function getCitySuggestions(query: string): Promise<CitySuggestion[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return popularCities;
  }

  if (!env.map2gisKey) {
    return popularCities.filter((city) =>
      city.name.toLowerCase().includes(normalizedQuery.toLowerCase()),
    );
  }

  const searchParams = new URLSearchParams({
    key: env.map2gisKey,
    q: normalizedQuery,
    locale: "ru_RU",
    suggest_type: "city_selector",
    page_size: "8",
    fields: "items.point",
  });

  const response = await fetch(`https://catalog.api.2gis.com/3.0/suggests?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to load city suggestions");
  }

  const data = (await response.json()) as TwoGisSuggestResponse;
  const items = data.result?.items ?? [];

  const suggestions = items
    .map((item, index): CitySuggestion | null => {
      const displayName = resolveCityDisplayName(item);

      if (!displayName) {
        return null;
      }

      return {
        id: item.id ?? `${displayName}-${index}`,
        name: displayName,
        point:
          typeof item.point?.lon === "number" && typeof item.point?.lat === "number"
            ? { lon: item.point.lon, lat: item.point.lat }
            : undefined,
      } satisfies CitySuggestion;
    })
    .filter((item): item is CitySuggestion => item !== null);

  if (suggestions.length > 0) {
    return suggestions;
  }

  return popularCities.filter((city) =>
    city.name.toLowerCase().includes(normalizedQuery.toLowerCase()),
  );
}

export async function getAddressSuggestions(
  query: string,
  cityName?: string,
): Promise<AddressSuggestion[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery || !env.map2gisKey) {
    return [];
  }

  const queryVariants = buildAddressQueryVariants(normalizedQuery, cityName);
  const collectedItems: TwoGisSuggestItem[] = [];
  const seenItemKeys = new Set<string>();

  for (const variant of queryVariants) {
    const searchParams = new URLSearchParams({
      key: env.map2gisKey,
      q: variant,
      locale: "ru_RU",
      page_size: "20",
      fields: "items.point",
    });

    const response = await fetch(`https://catalog.api.2gis.com/3.0/suggests?${searchParams.toString()}`);

    if (!response.ok) {
      throw new Error("Failed to load address suggestions");
    }

    const data = (await response.json()) as TwoGisSuggestResponse;
    const nextItems = data.result?.items ?? [];

    nextItems.forEach((item, index) => {
      const itemKey = item.id ?? item.full_address_name ?? item.full_name ?? item.name ?? `${variant}-${index}`;
      if (seenItemKeys.has(itemKey)) {
        return;
      }

      seenItemKeys.add(itemKey);
      collectedItems.push(item);
    });
  }

  return collectedItems
    .filter((item) => isAddressLikeSuggestion(item, cityName) && matchesAddressQuery(item, normalizedQuery))
    .map((item, index): AddressSuggestion | null => {
      const fullAddress = item.full_address_name?.trim() || item.full_name?.trim() || item.name?.trim();

      if (!fullAddress) {
        return null;
      }

      return {
        id: item.id ?? `${fullAddress}-${index}`,
        name: item.name?.trim() || fullAddress,
        subtitle: resolveAddressSubtitle(item.subtype),
        fullAddress,
        point:
          typeof item.point?.lon === "number" && typeof item.point?.lat === "number"
            ? { lon: item.point.lon, lat: item.point.lat }
            : undefined,
      } satisfies AddressSuggestion;
    })
    .filter((item): item is AddressSuggestion => item !== null);
}

export async function getCityViewportByName(cityName: string) {
  const normalizedCityName = cityName.trim().toLowerCase();

  if (!normalizedCityName) {
    return null;
  }

  const localMatch = popularCities.find((city) => city.name.toLowerCase() === normalizedCityName);
  if (localMatch?.point) {
    return {
      center: [localMatch.point.lon, localMatch.point.lat] as [number, number],
      zoom: 11,
    };
  }

  const suggestions = await getCitySuggestions(cityName);
  const matchedSuggestion =
    suggestions.find((city) => city.name.toLowerCase() === normalizedCityName) ?? suggestions[0];

  if (!matchedSuggestion?.point) {
    return null;
  }

  return {
    center: [matchedSuggestion.point.lon, matchedSuggestion.point.lat] as [number, number],
    zoom: 11,
  };
}

export async function getAddressByPoint(
  point: {
    lon: number;
    lat: number;
  },
  cityName?: string,
): Promise<ReverseGeocodedAddress | null> {
  if (!env.map2gisKey) {
    return null;
  }

  const searchParams = new URLSearchParams({
    key: env.map2gisKey,
    lon: String(point.lon),
    lat: String(point.lat),
    locale: "ru_RU",
    page_size: "1",
    fields: "items.point",
  });

  const response = await fetch(`https://catalog.api.2gis.com/3.0/items/geocode?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to reverse geocode address");
  }

  const data = (await response.json()) as TwoGisSuggestResponse;
  const item = data.result?.items?.[0];
  const normalizedCityName = cityName?.trim().toLowerCase() ?? "";
  const candidates = [
    item?.full_address_name?.trim(),
    item?.address_name?.trim(),
    item?.full_name?.trim(),
    item?.name?.trim(),
  ].filter((value): value is string => Boolean(value));
  const fullAddress =
    candidates.find((value) => value.toLowerCase() !== normalizedCityName) ??
    candidates[0] ??
    "";

  if (!fullAddress) {
    return null;
  }

  return {
    fullAddress,
    point:
      typeof item?.point?.lon === "number" && typeof item?.point?.lat === "number"
        ? { lon: item.point.lon, lat: item.point.lat }
        : point,
  };
}
