const CITY_COOKIE_NAME = "tramplin.selected_city";
const ADDRESS_QUERY_COOKIE_NAME = "tramplin.last_address_query";
const CITY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function readSelectedCityCookie() {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${CITY_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeSelectedCityCookie(city: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${CITY_COOKIE_NAME}=${encodeURIComponent(city)}; path=/; max-age=${CITY_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function removeSelectedCityCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${CITY_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

export function readLastAddressQueryCookie() {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${ADDRESS_QUERY_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeLastAddressQueryCookie(query: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${ADDRESS_QUERY_COOKIE_NAME}=${encodeURIComponent(query)}; path=/; max-age=${CITY_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function removeLastAddressQueryCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${ADDRESS_QUERY_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
