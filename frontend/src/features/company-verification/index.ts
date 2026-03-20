import { apiClient } from "../../shared/api/client";
import { useAuthStore } from "../auth";

export type EmployerOnboardingPayload = {
  employer_type: "company" | "sole_proprietor";
  company_name: string;
  inn: string;
  corporate_email: string;
  website?: string;
};

function getAuthorizedHeaders() {
  const accessToken = useAuthStore.getState().accessToken;

  return accessToken
    ? {
        Authorization: `Bearer ${accessToken}`,
      }
    : undefined;
}

export async function upsertEmployerProfile(payload: EmployerOnboardingPayload) {
  const response = await apiClient.put("/companies/profile", payload, {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}
