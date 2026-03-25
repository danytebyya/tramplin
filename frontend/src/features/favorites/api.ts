import { apiClient } from "../../shared/api/client";

export type FavoriteOpportunitiesResponse = {
  data?: {
    items?: string[];
  };
};

export async function listFavoriteOpportunitiesRequest() {
  const response = await apiClient.get<FavoriteOpportunitiesResponse>("/favorites/opportunities");
  return response.data;
}

export async function addFavoriteOpportunityRequest(opportunityId: string) {
  const response = await apiClient.post<FavoriteOpportunitiesResponse>(
    `/favorites/opportunities/${opportunityId}`,
  );
  return response.data;
}

export async function removeFavoriteOpportunityRequest(opportunityId: string) {
  const response = await apiClient.delete<FavoriteOpportunitiesResponse>(
    `/favorites/opportunities/${opportunityId}`,
  );
  return response.data;
}
