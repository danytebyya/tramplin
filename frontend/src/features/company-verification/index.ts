import { apiClient } from "../../shared/api/client";
import { useAuthStore } from "../auth";

export type EmployerOnboardingPayload = {
  employer_type: "company" | "sole_proprietor";
  company_name: string;
  inn: string;
  corporate_email: string;
  website?: string;
};

export type EmployerInnVerificationPayload = {
  employer_type?: "company" | "sole_proprietor";
  inn: string;
};

export type EmployerInnVerificationResponse = {
  data?: {
    verification?: {
      employer_type?: "company" | "sole_proprietor";
      inn?: string;
      full_name?: string;
      name?: string;
      ogrn?: string | null;
      address?: string | null;
      type?: string | null;
      status?: string | null;
      subject_type?: string | null;
      status_label?: string | null;
      registration_date?: string | null;
      director_name?: string | null;
    };
  };
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

export async function uploadEmployerVerificationDocuments(files: File[]) {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await apiClient.post("/companies/verification-documents", formData, {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}

export async function verifyEmployerInn(
  payload: EmployerInnVerificationPayload,
): Promise<EmployerInnVerificationResponse> {
  const response = await apiClient.post("/companies/verify-inn", payload, {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}
