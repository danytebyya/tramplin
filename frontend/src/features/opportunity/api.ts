import { apiClient } from "../../shared/api/client";

export type OpportunityTagCatalogItem = {
  id: string;
  slug: string;
  name: string;
  tagType: string;
};

export type OpportunityTagCatalogCategory = {
  id: string;
  slug: string;
  name: string;
  tagType: string;
  items: OpportunityTagCatalogItem[];
};

type OpportunityTagCatalogApiItem = {
  id: string;
  slug: string;
  name: string;
  tag_type: string;
};

type OpportunityTagCatalogApiCategory = {
  id: string;
  slug: string;
  name: string;
  tag_type: string;
  items: OpportunityTagCatalogApiItem[];
};

type OpportunityTagCatalogResponse = {
  data?: {
    items?: OpportunityTagCatalogApiCategory[];
  };
};

export type EmployerOpportunityItem = {
  id: string;
  title: string;
  companyName: string;
  authorEmail: string | null;
  opportunityType: "vacancy" | "internship" | "event" | "mentorship";
  kind: "vacancy" | "internship" | "event" | "mentorship";
  salaryLabel: string;
  address: string;
  city: string;
  locationLabel: string;
  tags: string[];
  levelLabel: string;
  employmentLabel: string;
  format: "offline" | "hybrid" | "online";
  formatLabel: string;
  description: string;
  status: "active" | "planned" | "removed" | "rejected" | "pending_review" | "changes_requested";
  moderationComment: string | null;
  submittedAt: string;
  publishedAt: string | null;
  activeUntil: string | null;
  plannedPublishAt: string | null;
  latitude: number;
  longitude: number;
  responsesCount: number;
  eventType: string | null;
  mentorshipDirection: string | null;
  mentorExperience: string | null;
};

export type EmployerOpportunityUpsertPayload = {
  title: string;
  description: string;
  opportunity_type: EmployerOpportunityItem["opportunityType"];
  city: string;
  address: string;
  salary_label: string;
  tags: string[];
  format: EmployerOpportunityItem["format"];
  level_label?: string | null;
  employment_label?: string | null;
  event_type?: string | null;
  mentorship_direction?: string | null;
  mentor_experience?: string | null;
  planned_publish_at?: string | null;
  latitude: number;
  longitude: number;
};

type EmployerOpportunityApiItem = {
  id: string;
  title: string;
  company_name: string;
  author_email: string | null;
  opportunity_type: EmployerOpportunityItem["opportunityType"];
  kind: EmployerOpportunityItem["kind"];
  salary_label: string;
  address: string;
  city: string;
  location_label: string;
  tags: string[];
  level_label: string;
  employment_label: string;
  format: EmployerOpportunityItem["format"];
  format_label: string;
  description: string;
  status: EmployerOpportunityItem["status"];
  moderation_comment: string | null;
  submitted_at: string;
  published_at: string | null;
  active_until: string | null;
  planned_publish_at: string | null;
  latitude: number;
  longitude: number;
  responses_count: number;
  event_type: string | null;
  mentorship_direction: string | null;
  mentor_experience: string | null;
};

type EmployerOpportunityListResponse = {
  data?: {
    items?: EmployerOpportunityApiItem[];
  };
};

type EmployerOpportunityResponse = {
  data?: EmployerOpportunityApiItem;
};

export async function listOpportunityTagCatalogRequest(): Promise<OpportunityTagCatalogCategory[]> {
  const response = await apiClient.get<OpportunityTagCatalogResponse>("/tags/catalog");
  const items = response.data?.data?.items ?? [];

  return items.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    tagType: category.tag_type,
    items: category.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      tagType: item.tag_type,
    })),
  }));
}

function mapEmployerOpportunityItem(item: EmployerOpportunityApiItem): EmployerOpportunityItem {
  return {
    id: item.id,
    title: item.title,
    companyName: item.company_name,
    authorEmail: item.author_email,
    opportunityType: item.opportunity_type,
    kind: item.kind,
    salaryLabel: item.salary_label,
    address: item.address,
    city: item.city,
    locationLabel: item.location_label,
    tags: item.tags,
    levelLabel: item.level_label,
    employmentLabel: item.employment_label,
    format: item.format,
    formatLabel: item.format_label,
    description: item.description,
    status: item.status,
    moderationComment: item.moderation_comment,
    submittedAt: item.submitted_at,
    publishedAt: item.published_at,
    activeUntil: item.active_until,
    plannedPublishAt: item.planned_publish_at,
    latitude: item.latitude,
    longitude: item.longitude,
    responsesCount: item.responses_count,
    eventType: item.event_type,
    mentorshipDirection: item.mentorship_direction,
    mentorExperience: item.mentor_experience,
  };
}

export async function listEmployerOpportunitiesRequest(): Promise<EmployerOpportunityItem[]> {
  const response = await apiClient.get<EmployerOpportunityListResponse>("/opportunities/mine");
  return (response.data?.data?.items ?? []).map(mapEmployerOpportunityItem);
}

export async function createEmployerOpportunityRequest(
  payload: EmployerOpportunityUpsertPayload,
): Promise<EmployerOpportunityItem> {
  const response = await apiClient.post<EmployerOpportunityResponse>("/opportunities", payload);
  if (!response.data?.data) {
    throw new Error("Не удалось создать возможность");
  }
  return mapEmployerOpportunityItem(response.data.data);
}

export async function updateEmployerOpportunityRequest(
  opportunityId: string,
  payload: EmployerOpportunityUpsertPayload,
): Promise<EmployerOpportunityItem> {
  const response = await apiClient.put<EmployerOpportunityResponse>(`/opportunities/${opportunityId}`, payload);
  if (!response.data?.data) {
    throw new Error("Не удалось обновить возможность");
  }
  return mapEmployerOpportunityItem(response.data.data);
}

export async function deleteEmployerOpportunityRequest(opportunityId: string) {
  const response = await apiClient.delete<{ data?: { id?: string } }>(`/opportunities/${opportunityId}`);
  return response.data;
}
