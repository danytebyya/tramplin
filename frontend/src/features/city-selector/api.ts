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

export const popularCities: CitySuggestion[] = [
  { id: "moscow", name: "Москва", point: { lon: 37.6176, lat: 55.7558 } },
  { id: "saint-petersburg", name: "Санкт-Петербург", point: { lon: 30.3159, lat: 59.9391 } },
  { id: "kazan", name: "Казань", point: { lon: 49.1221, lat: 55.7887 } },
  { id: "novosibirsk", name: "Новосибирск", point: { lon: 82.9204, lat: 55.0302 } },
  { id: "cheboksary", name: "Чебоксары", point: { lon: 47.2512, lat: 56.1287 } },
];

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

  const searchParams = new URLSearchParams({
    key: env.map2gisKey,
    q: cityName?.trim() ? `${cityName.trim()}, ${normalizedQuery}` : normalizedQuery,
    locale: "ru_RU",
    page_size: "6",
    fields: "items.point",
  });

  const response = await fetch(`https://catalog.api.2gis.com/3.0/suggests?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to load address suggestions");
  }

  const data = (await response.json()) as TwoGisSuggestResponse;
  const items = data.result?.items ?? [];

  return items
    .map((item, index): AddressSuggestion | null => {
      const fullAddress = item.full_address_name?.trim() || item.full_name?.trim() || item.name?.trim();

      if (!fullAddress) {
        return null;
      }

      return {
        id: item.id ?? `${fullAddress}-${index}`,
        name: item.name?.trim() || fullAddress,
        subtitle: item.subtype?.trim(),
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
