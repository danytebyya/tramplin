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
};

type OpportunityFeedResponse = {
  data?: {
    items?: OpportunityApiItem[];
  };
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
      format: item.format,
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
    })),
  ];
}
