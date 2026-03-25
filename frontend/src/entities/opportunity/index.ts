export type OpportunityFormat = "office" | "hybrid" | "remote";
export type OpportunityKind = "vacancy" | "internship" | "event" | "mentorship";

export type Opportunity = {
  id: string;
  title: string;
  companyName: string;
  companyVerified: boolean;
  companyRating: number | null;
  companyReviewsCount: number;
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
};

export const opportunityViewOptions = [
  { label: "Карта", value: "map" },
  { label: "Список", value: "list" },
] as const;
