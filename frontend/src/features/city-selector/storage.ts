const CITY_COOKIE_NAME = "tramplin.selected_city";
const ADDRESS_QUERY_COOKIE_NAME = "tramplin.last_address_query";
const CITY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MAX_RECENT_ADDRESS_QUERIES = 5;

function readCookieValue(cookieName: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${cookieName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookieValue(cookieName: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; max-age=${CITY_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function normalizeRecentAddressQueries(queries: string[]) {
  const deduplicated = new Set<string>();

  return queries
    .map((query) => query.trim())
    .filter((query) => query.length > 0)
    .filter((query) => {
      if (deduplicated.has(query)) {
        return false;
      }

      deduplicated.add(query);
      return true;
    })
    .slice(0, MAX_RECENT_ADDRESS_QUERIES);
}

export function readSelectedCityCookie() {
  return readCookieValue(CITY_COOKIE_NAME);
}

export function writeSelectedCityCookie(city: string) {
  writeCookieValue(CITY_COOKIE_NAME, city);
}

export function removeSelectedCityCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${CITY_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

export function readLastAddressQueryCookie() {
  return readRecentAddressQueriesCookie()[0] ?? null;
}

export function readRecentAddressQueriesCookie() {
  const cookieValue = readCookieValue(ADDRESS_QUERY_COOKIE_NAME);

  if (!cookieValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(cookieValue) as unknown;

    if (Array.isArray(parsedValue)) {
      return normalizeRecentAddressQueries(parsedValue.filter((item): item is string => typeof item === "string"));
    }
  } catch {
    return normalizeRecentAddressQueries([cookieValue]);
  }

  return normalizeRecentAddressQueries([cookieValue]);
}

export function writeLastAddressQueryCookie(query: string) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return;
  }

  const nextQueries = normalizeRecentAddressQueries([normalizedQuery, ...readRecentAddressQueriesCookie()]);

  writeCookieValue(ADDRESS_QUERY_COOKIE_NAME, JSON.stringify(nextQueries));
}

export function removeLastAddressQueryCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${ADDRESS_QUERY_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
