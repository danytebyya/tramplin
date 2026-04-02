export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL ?? "",
  appBaseUrl: import.meta.env.VITE_APP_BASE_URL ?? import.meta.env.VITE_SITE_URL ?? "",
  map2gisKey: import.meta.env.VITE_2GIS_MAP_KEY ?? "",
};

function getBrowserLocation() {
  return typeof window !== "undefined" ? window.location : null;
}

export function normalizeUrlForCurrentOrigin(pathOrUrl: string) {
  const browserLocation = getBrowserLocation();

  if (!browserLocation) {
    return pathOrUrl;
  }

  try {
    const resolvedUrl = new URL(pathOrUrl, browserLocation.origin);
    const shouldUpgradeToHttps =
      browserLocation.protocol === "https:" &&
      resolvedUrl.protocol === "http:" &&
      resolvedUrl.hostname === browserLocation.hostname &&
      (resolvedUrl.port === "" ||
        resolvedUrl.port === browserLocation.port ||
        resolvedUrl.port === "80");

    if (!shouldUpgradeToHttps) {
      return resolvedUrl.toString();
    }

    resolvedUrl.protocol = "https:";
    if (resolvedUrl.port === "80") {
      resolvedUrl.port = "";
    }

    return resolvedUrl.toString();
  } catch {
    return pathOrUrl;
  }
}

export function getApiBaseUrl() {
  return normalizeUrlForCurrentOrigin(env.apiBaseUrl);
}

export function getAppOrigin() {
  const fallbackOrigin = getBrowserLocation()?.origin;
  const resolvedUrl = new URL(normalizeUrlForCurrentOrigin(env.appBaseUrl || fallbackOrigin || "http://localhost"));
  resolvedUrl.pathname = "";
  resolvedUrl.search = "";
  resolvedUrl.hash = "";
  return resolvedUrl.toString().replace(/\/$/, "");
}

export function resolveAppUrl(pathOrUrl: string) {
  const resolvedUrl = new URL(pathOrUrl, getAppOrigin());
  return resolvedUrl.toString();
}

export function getWebSocketOrigin() {
  const baseUrl = normalizeUrlForCurrentOrigin(env.wsBaseUrl || getApiBaseUrl());
  const resolvedUrl = new URL(
    baseUrl,
    getBrowserLocation()?.origin,
  );

  if (resolvedUrl.protocol === "ws:" || resolvedUrl.protocol === "wss:") {
    resolvedUrl.pathname = "";
    resolvedUrl.search = "";
    resolvedUrl.hash = "";
    return resolvedUrl.toString().replace(/\/$/, "");
  }

  const shouldUseSecureSocket = resolvedUrl.protocol === "https:";

  resolvedUrl.protocol = shouldUseSecureSocket ? "wss:" : "ws:";
  resolvedUrl.pathname = "";
  resolvedUrl.search = "";
  resolvedUrl.hash = "";

  return resolvedUrl.toString().replace(/\/$/, "");
}
