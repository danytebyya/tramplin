import { env } from "../../shared/config/env";

export type CitySuggestion = {
  id: string;
  name: string;
  subtitle?: string;
};

type TwoGisSuggestItem = {
  id?: string;
  full_name?: string;
  full_address_name?: string;
  name?: string;
  subtype?: string;
};

type TwoGisSuggestResponse = {
  result?: {
    items?: TwoGisSuggestItem[];
  };
};

export const popularCities: CitySuggestion[] = [
  { id: "moscow", name: "Москва" },
  { id: "saint-petersburg", name: "Санкт-Петербург" },
  { id: "kazan", name: "Казань" },
  { id: "novosibirsk", name: "Новосибирск" },
  { id: "cheboksary", name: "Чебоксары" },
];

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
  });

  const response = await fetch(`https://catalog.api.2gis.com/3.0/suggests?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to load city suggestions");
  }

  const data = (await response.json()) as TwoGisSuggestResponse;
  const items = data.result?.items ?? [];

  const suggestions = items
    .map((item, index) => {
      const displayName = item.full_name ?? item.full_address_name ?? item.name;

      if (!displayName) {
        return null;
      }

      return {
        id: item.id ?? `${displayName}-${index}`,
        name: displayName,
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
