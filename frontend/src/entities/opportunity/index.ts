export type OpportunityFormat = "office" | "hybrid" | "remote";
export type OpportunityKind = "vacancy" | "internship" | "event" | "mentorship";
export type OpportunityBusinessStatus = "draft" | "scheduled" | "active" | "closed" | "archived";
export type OpportunityModerationStatus = "pending_review" | "approved" | "rejected" | "hidden" | "blocked";

export type Opportunity = {
  id: string;
  employerId: string;
  title: string;
  companyName: string;
  companyVerified: boolean;
  companyRating: number | null;
  companyReviewsCount: number;
  contactEmail?: string | null;
  companyWebsite?: string | null;
  companyPhone?: string | null;
  salaryLabel: string;
  locationLabel: string;
  format: OpportunityFormat;
  kind: OpportunityKind;
  levelLabel: string;
  employmentLabel: string;
  description: string;
  tags: string[];
  latitude: number;
  longitude: number;
  accent: "cyan" | "amber" | "blue" | "slate";
  businessStatus: OpportunityBusinessStatus;
  moderationStatus: OpportunityModerationStatus;
  city?: string;
  address?: string;
  publishedAt?: string | null;
  activeUntil?: string | null;
  plannedPublishAt?: string | null;
  eventType?: string | null;
  mentorshipDirection?: string | null;
  mentorExperience?: string | null;
};

export const opportunityViewOptions = [
  { label: "Карта", value: "map" },
  { label: "Список", value: "list" },
] as const;
