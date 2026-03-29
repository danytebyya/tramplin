import { apiClient } from "../../shared/api/client";
import { listWorkflowOpportunities, toPublicOpportunity } from "../../features/opportunity-workflow";
import type { Opportunity } from "./index";

type OpportunityApiItem = {
  id: string;
  employer_id: string;
  title: string;
  company_name: string;
  company_verified: boolean;
  company_rating: number | null;
  company_reviews_count: number;
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
      title: item.title,
      companyName: item.company_name,
      companyVerified: item.company_verified,
      companyRating: item.company_rating,
      companyReviewsCount: item.company_reviews_count,
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
