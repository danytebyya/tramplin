import { apiClient } from "../../shared/api/client";
import { listWorkflowOpportunities, toPublicOpportunity } from "../../features/opportunity-workflow";
import type { Opportunity } from "./index";

type OpportunityApiItem = {
  id: string;
  employer_id: string;
  employer_public_id?: string | null;
  title: string;
  company_name: string;
  company_avatar_url?: string | null;
  company_verified: boolean;
  company_rating: number | null;
  company_reviews_count: number;
  contact_email?: string | null;
  company_website?: string | null;
  company_phone?: string | null;
  salary_label: string;
  location_label: string;
  format: Opportunity["format"];
  kind: Opportunity["kind"];
  level_label: string;
  employment_label: string;
  description: string;
  tags: string[];
  latitude: number;
  longitude: number;
  accent: Opportunity["accent"];
  business_status: Opportunity["businessStatus"];
  moderation_status: Opportunity["moderationStatus"];
  city?: string;
  address?: string;
  published_at?: string | null;
  active_until?: string | null;
  planned_publish_at?: string | null;
  event_type?: string | null;
  mentorship_direction?: string | null;
  mentor_experience?: string | null;
};

type OpportunityFeedResponse = {
  data?: {
    items?: OpportunityApiItem[];
  };
};

type OpportunityRecommendationCandidateApi = {
  user_id: string;
  public_id?: string | null;
  display_name: string;
  subtitle: string;
  is_online?: boolean;
  city: string;
  salary_label: string;
  format_label: string;
  employment_label: string;
  tags: string[];
  recommendations_count?: number;
};

type OpportunityRecommendationCandidatesResponse = {
  data?: {
    items?: OpportunityRecommendationCandidateApi[];
  };
};

export type OpportunityRecommendationCandidate = {
  userId: string;
  publicId: string | null;
  displayName: string;
  subtitle: string;
  isOnline: boolean;
  city: string;
  salaryLabel: string;
  formatLabel: string;
  employmentLabel: string;
  tags: string[];
  recommendationsCount: number;
};

function normalizePublicOpportunityFormat(format: string): Opportunity["format"] {
  if (format === "offline" || format === "office") {
    return "office";
  }

  if (format === "hybrid") {
    return "hybrid";
  }

  return "remote";
}

type PlatformStatsResponse = {
  data?: {
    companies_count?: number;
    applicants_count?: number;
    vacancies_count?: number;
    internships_count?: number;
    events_count?: number;
    mentorships_count?: number;
  };
};

export type PlatformStats = {
  companiesCount: number;
  applicantsCount: number;
  vacanciesCount: number;
  internshipsCount: number;
  eventsCount: number;
  mentorshipsCount: number;
};

function isPublicOpportunity(item: OpportunityApiItem) {
  return item.business_status === "active" && item.moderation_status === "approved";
}

export async function listOpportunitiesRequest(): Promise<Opportunity[]> {
  const response = await apiClient.get<OpportunityFeedResponse>("/opportunities");
  const items = response.data?.data?.items ?? [];
  const workflowItems = listWorkflowOpportunities()
    .map((item) => toPublicOpportunity(item))
    .filter(Boolean) as Opportunity[];

  return [
    ...workflowItems,
    ...items
    .filter(isPublicOpportunity)
    .map((item) => ({
      id: item.id,
      employerId: item.employer_id,
      employerPublicId: item.employer_public_id ?? null,
      title: item.title,
      companyName: item.company_name,
      companyAvatarUrl: item.company_avatar_url ?? null,
      companyVerified: item.company_verified,
      companyRating: item.company_rating,
      companyReviewsCount: item.company_reviews_count,
      contactEmail: item.contact_email ?? null,
      companyWebsite: item.company_website ?? null,
      companyPhone: item.company_phone ?? null,
      salaryLabel: item.salary_label,
      locationLabel: item.location_label,
      format: normalizePublicOpportunityFormat(item.format),
      kind: item.kind,
      levelLabel: item.level_label,
      employmentLabel: item.employment_label,
      description: item.description,
      tags: item.tags,
      latitude: item.latitude,
      longitude: item.longitude,
      accent: item.accent,
      businessStatus: item.business_status,
      moderationStatus: item.moderation_status,
      city: item.city ?? "",
      address: item.address ?? "",
      publishedAt: item.published_at ?? null,
      activeUntil: item.active_until ?? null,
      plannedPublishAt: item.planned_publish_at ?? null,
      eventType: item.event_type ?? null,
      mentorshipDirection: item.mentorship_direction ?? null,
      mentorExperience: item.mentor_experience ?? null,
    })),
  ];
}

export async function listOpportunityRecommendationCandidatesRequest(
  opportunityId: string,
): Promise<OpportunityRecommendationCandidate[]> {
  const response = await apiClient.get<OpportunityRecommendationCandidatesResponse>(
    `/opportunities/${opportunityId}/recommendation-candidates`,
  );
  const items = response.data?.data?.items ?? [];

  return items.map((item) => ({
    userId: item.user_id,
    publicId: item.public_id ?? null,
    displayName: item.display_name,
    subtitle: item.subtitle,
    isOnline: Boolean(item.is_online),
    city: item.city,
    salaryLabel: item.salary_label,
    formatLabel: item.format_label,
    employmentLabel: item.employment_label,
    tags: item.tags,
    recommendationsCount: item.recommendations_count ?? 0,
  }));
}

export async function recommendOpportunityRequest(opportunityId: string, targetUserId: string) {
  const response = await apiClient.post<{ data?: { recommended?: boolean } }>(
    `/opportunities/${opportunityId}/recommend`,
    { target_user_id: targetUserId },
  );
  return response.data;
}

export async function getPlatformStatsRequest(): Promise<PlatformStats> {
  const response = await apiClient.get<PlatformStatsResponse>("/platform/stats");
  const data = response.data?.data;

  return {
    companiesCount: data?.companies_count ?? 0,
    applicantsCount: data?.applicants_count ?? 0,
    vacanciesCount: data?.vacancies_count ?? 0,
    internshipsCount: data?.internships_count ?? 0,
    eventsCount: data?.events_count ?? 0,
    mentorshipsCount: data?.mentorships_count ?? 0,
  };
}
