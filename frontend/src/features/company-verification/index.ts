import { apiClient } from "../../shared/api/client";
import { useAuthStore } from "../auth";

export type EmployerOnboardingPayload = {
  employer_type: "company" | "sole_proprietor";
  company_name: string;
  inn: string;
  corporate_email: string;
  website?: string;
  phone?: string;
  social_link?: string;
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

export type EmployerVerificationDraftDocument = {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_url?: string | null;
};

export type EmployerVerificationDraftResponse = {
  data?: {
    verification_request_id?: string | null;
    website?: string | null;
    phone?: string | null;
    social_link?: string | null;
    documents?: EmployerVerificationDraftDocument[];
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

function dispatchEmployerDocumentUploadProgress(file: File, progress: number) {
  window.dispatchEvent(
    new CustomEvent("tramplin:employer-document-upload-progress", {
      detail: {
        fileKey: `${file.name}:${file.size}:${file.lastModified}`,
        progress,
      },
    }),
  );
}

export async function upsertEmployerProfile(payload: EmployerOnboardingPayload) {
  const response = await apiClient.put("/companies/profile", payload, {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}

export async function uploadEmployerVerificationDocuments(
  files: File[],
  verificationRequestId?: string,
) {
  let nextVerificationRequestId = verificationRequestId;

  for (const file of files) {
    let latestProgress = 1;
    const formData = new FormData();
    formData.append("files", file);
    if (nextVerificationRequestId) {
      formData.append("verification_request_id", nextVerificationRequestId);
    }

    dispatchEmployerDocumentUploadProgress(file, latestProgress);

    const response = await apiClient.post("/companies/verification-documents", formData, {
      headers: getAuthorizedHeaders(),
      onUploadProgress: (event) => {
        latestProgress = event.total
          ? Math.min(Math.max(Math.round((event.loaded / event.total) * 100), 1), 95)
          : latestProgress;
        dispatchEmployerDocumentUploadProgress(file, latestProgress);
      },
    });

    dispatchEmployerDocumentUploadProgress(file, 100);
    nextVerificationRequestId = response.data?.data?.verification_request_id ?? nextVerificationRequestId;
  }
}

export async function verifyEmployerInn(
  payload: EmployerInnVerificationPayload,
): Promise<EmployerInnVerificationResponse> {
  const response = await apiClient.post("/companies/verify-inn", payload, {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}

export async function getEmployerVerificationDraft() {
  const response = await apiClient.get<EmployerVerificationDraftResponse>("/companies/verification-draft", {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}

export async function deleteEmployerVerificationDocument(documentId: string) {
  const response = await apiClient.delete(`/companies/verification-documents/${documentId}`, {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}
