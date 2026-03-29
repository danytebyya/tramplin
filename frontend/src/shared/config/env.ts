export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1",
  map2gisKey: import.meta.env.VITE_2GIS_MAP_KEY ?? "",
};

export function getWebSocketOrigin() {
  const apiUrl = new URL(env.apiBaseUrl);
  const shouldUseSecureSocket =
    apiUrl.protocol === "https:" ||
    (typeof window !== "undefined" && window.location.protocol === "https:");

  apiUrl.protocol = shouldUseSecureSocket ? "wss:" : "ws:";
  apiUrl.pathname = "";
  apiUrl.search = "";
  apiUrl.hash = "";

  return apiUrl.toString().replace(/\/$/, "");
}
