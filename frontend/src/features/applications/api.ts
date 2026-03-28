import { apiClient } from "../../shared/api/client";

type SubmitApplicationResponse = {
  data?: {
    id?: string;
    opportunity_id?: string;
    applicant_user_id?: string;
    status?: string;
    submitted_at?: string;
  };
};

type MyApplicationIdsResponse = {
  data?: {
    opportunity_ids?: string[];
  };
};

export async function submitOpportunityApplicationRequest(opportunityId: string) {
  const response = await apiClient.post<SubmitApplicationResponse>("/applications", {
    opportunity_id: opportunityId,
  });
  return response.data;
}

export async function listMyAppliedOpportunityIdsRequest() {
  const response = await apiClient.get<MyApplicationIdsResponse>("/applications/mine/opportunity-ids");
  return response.data;
}
