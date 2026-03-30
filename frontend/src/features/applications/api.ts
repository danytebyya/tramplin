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

export type BackendApplicationStatus =
  | "submitted"
  | "under_review"
  | "shortlisted"
  | "interview"
  | "offer"
  | "accepted"
  | "rejected"
  | "reserved"
  | "withdrawn"
  | "canceled";

export type EmployerApplicationUiStatus = "new" | "accepted" | "reserve" | "rejected";

export type ApplicationApplicant = {
  user_id: string;
  public_id?: string | null;
  display_name: string;
  subtitle: string;
  is_online: boolean;
  city: string;
  salary_label: string;
  format_label: string;
  employment_label: string;
  tags: string[];
};

export type ApplicationOpportunity = {
  id: string;
  title: string;
  kind: "vacancy" | "internship" | "event" | "mentorship";
  published_at?: string | null;
};

export type ApplicationDetails = {
  id: string;
  opportunity_id: string;
  applicant_user_id: string;
  status: BackendApplicationStatus;
  submitted_at: string;
  status_changed_at: string;
  employer_comment?: string | null;
  interview_date?: string | null;
  interview_start_time?: string | null;
  interview_end_time?: string | null;
  interview_format?: string | null;
  meeting_link?: string | null;
  contact_email?: string | null;
  checklist?: string | null;
  applicant?: ApplicationApplicant | null;
  opportunity?: ApplicationOpportunity | null;
};

type MyApplicationsResponse = {
  data?: {
    items?: ApplicationDetails[];
  };
};

type EmployerApplicationsResponse = {
  data?: {
    items?: ApplicationDetails[];
  };
};

export async function submitOpportunityApplicationRequest(opportunityId: string) {
  const response = await apiClient.post<SubmitApplicationResponse>("/applications", {
    opportunity_id: opportunityId,
  });
  return response.data;
}

export async function withdrawOpportunityApplicationRequest(opportunityId: string) {
  const response = await apiClient.delete<SubmitApplicationResponse>(`/applications/${opportunityId}`);
  return response.data;
}

export async function listMyAppliedOpportunityIdsRequest() {
  const response = await apiClient.get<MyApplicationIdsResponse>("/applications/mine/opportunity-ids");
  return response.data;
}

export async function listMyApplicationsRequest() {
  const response = await apiClient.get<MyApplicationsResponse>("/applications/mine");
  return response.data;
}

export async function listEmployerApplicationsRequest() {
  const response = await apiClient.get<EmployerApplicationsResponse>("/applications/employer");
  return response.data;
}

export async function updateEmployerApplicationStatusRequest(
  applicationId: string,
  payload: {
    status: EmployerApplicationUiStatus;
    employer_comment?: string | null;
    interview_date?: string | null;
    interview_start_time?: string | null;
    interview_end_time?: string | null;
    interview_format?: string | null;
    meeting_link?: string | null;
    contact_email?: string | null;
    checklist?: string | null;
  },
) {
  const response = await apiClient.patch<{ data?: ApplicationDetails }>(
    `/applications/${applicationId}/status`,
    payload,
  );
  return response.data;
}
