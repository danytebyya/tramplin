import { AxiosProgressEvent } from "axios";

import { apiClient } from "../../shared/api/client";
import { useAuthStore } from "../auth";

export type EmployerOnboardingPayload = {
  employer_type: "company" | "sole_proprietor";
  company_name: string;
  inn: string;
  corporate_email?: string;
  website?: string;
  phone?: string;
  social_link?: string;
  max_link?: string;
  rutube_link?: string;
  short_description?: string;
  office_addresses?: string[];
  activity_areas?: string[];
  organization_size?: string;
  foundation_year?: number;
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

export type EmployerStaffMember = {
  id: string;
  user_id: string;
  email: string;
  role: "owner" | "recruiter" | "manager" | "viewer";
  permission_keys?: string[];
  permissions: string[];
  invited_at: string;
  is_current_user: boolean;
  is_primary: boolean;
};

export type EmployerStaffListResponse = {
  data?: {
    items?: EmployerStaffMember[];
  };
};

export type EmployerStaffInvitation = {
  id: string;
  email?: string | null;
  role: "owner" | "recruiter" | "manager" | "viewer";
  permissions?: string[];
  status: string;
  invited_at: string;
  expires_at: string;
  invitation_url?: string | null;
  email_sent: boolean;
};

export type EmployerStaffInvitationListResponse = {
  data?: {
    items?: EmployerStaffInvitation[];
  };
};

export type EmployerStaffInvitationAcceptResponse = {
  data?: EmployerStaffMember;
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

export async function uploadEmployerAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<{ data?: { avatar_url?: string | null } }>("/companies/avatar", formData, {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}

export async function uploadEmployerVerificationDocuments(payload: {
  files: File[];
  verificationRequestId?: string;
  deletedDocumentIds?: string[];
  phone?: string;
  socialLink?: string;
}) {
  const formData = new FormData();

  payload.files.forEach((file) => {
    formData.append("files", file);
    dispatchEmployerDocumentUploadProgress(file, 1);
  });

  if (payload.verificationRequestId) {
    formData.append("verification_request_id", payload.verificationRequestId);
  }

  payload.deletedDocumentIds?.forEach((documentId) => {
    formData.append("deleted_document_ids", documentId);
  });

  if (payload.phone) {
    formData.append("phone", payload.phone);
  }

  if (payload.socialLink) {
    formData.append("social_link", payload.socialLink);
  }

  const handleProgress = (event: AxiosProgressEvent) => {
    const progress = event.total
      ? Math.min(Math.max(Math.round((event.loaded / event.total) * 100), 1), 95)
      : 1;

    payload.files.forEach((file) => {
      dispatchEmployerDocumentUploadProgress(file, progress);
    });
  };

  const response = await apiClient.post("/companies/verification-documents", formData, {
    headers: getAuthorizedHeaders(),
    onUploadProgress: handleProgress,
  });

  payload.files.forEach((file) => {
    dispatchEmployerDocumentUploadProgress(file, 100);
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

export async function listEmployerStaff() {
  const response = await apiClient.get<EmployerStaffListResponse>("/companies/staff", {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}

export async function listEmployerStaffInvitations() {
  const response = await apiClient.get<EmployerStaffInvitationListResponse>("/companies/staff/invitations", {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}

export async function createEmployerStaffInvitation(payload: {
  email?: string;
  role?: "owner" | "recruiter" | "manager" | "viewer";
  permissions?: string[];
}) {
  const response = await apiClient.post<{ data?: EmployerStaffInvitation }>(
    "/companies/staff/invitations",
    payload,
    {
      headers: getAuthorizedHeaders(),
    },
  );
  return response.data;
}

export async function deleteEmployerStaffInvitation(invitationId: string) {
  const response = await apiClient.delete(`/companies/staff/invitations/${invitationId}`, {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}

export async function acceptEmployerStaffInvitation(token: string) {
  const response = await apiClient.post<EmployerStaffInvitationAcceptResponse>(
    "/companies/staff/invitations/accept",
    { token },
    {
      headers: getAuthorizedHeaders(),
    },
  );
  return response.data;
}

export async function deleteEmployerStaffMembership(membershipId: string) {
  const response = await apiClient.delete(`/companies/staff/memberships/${membershipId}`, {
    headers: getAuthorizedHeaders(),
  });
  return response.data;
}
