import { QueryClient } from "@tanstack/react-query";

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function clearAuthenticatedQueryState() {
  appQueryClient.removeQueries({ queryKey: ["auth"] });
  appQueryClient.removeQueries({ queryKey: ["users", "me"] });
  appQueryClient.removeQueries({ queryKey: ["notifications"] });
  appQueryClient.removeQueries({ queryKey: ["companies", "staff"] });
  appQueryClient.removeQueries({ queryKey: ["moderation", "settings"] });
}
