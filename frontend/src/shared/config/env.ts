export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL ?? "",
  appBaseUrl: import.meta.env.VITE_APP_BASE_URL ?? import.meta.env.VITE_SITE_URL ?? "",
  map2gisKey: import.meta.env.VITE_2GIS_MAP_KEY ?? "",
};

export function getAppOrigin() {
  const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
  const resolvedUrl = new URL(env.appBaseUrl || fallbackOrigin || "http://localhost");
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
  const baseUrl = env.wsBaseUrl || env.apiBaseUrl;
  const resolvedUrl = new URL(
    baseUrl,
    typeof window !== "undefined" ? window.location.origin : undefined,
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
