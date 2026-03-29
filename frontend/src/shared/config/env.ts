export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1",
  wsBaseUrl: import.meta.env.VITE_WS_BASE_URL ?? "",
  map2gisKey: import.meta.env.VITE_2GIS_MAP_KEY ?? "",
};

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
