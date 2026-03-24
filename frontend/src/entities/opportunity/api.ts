import { apiClient } from "../../shared/api/client";
import type { Opportunity } from "./index";

type OpportunityApiItem = {
  id: string;
  title: string;
  company_name: string;
  company_verified: boolean;
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
};

type OpportunityFeedResponse = {
  data?: {
    items?: OpportunityApiItem[];
  };
};

export async function listOpportunitiesRequest(): Promise<Opportunity[]> {
  const response = await apiClient.get<OpportunityFeedResponse>("/opportunities");
  const items = response.data?.data?.items ?? [];

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    companyName: item.company_name,
    companyVerified: item.company_verified,
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
  }));
}
