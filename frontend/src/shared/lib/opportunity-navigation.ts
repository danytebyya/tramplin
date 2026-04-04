export type OpportunityCategoryFilter = "all" | "vacancy" | "internship" | "event" | "mentorship";

export const OPPORTUNITY_EXPLORER_PATH = "/opportunities";

export const opportunityCategoryLinks: Array<{ value: OpportunityCategoryFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "vacancy", label: "Вакансии" },
  { value: "internship", label: "Стажировки" },
  { value: "event", label: "Мероприятия" },
  { value: "mentorship", label: "Менторские программы" },
];

export function buildOpportunityExplorerRoute(category: OpportunityCategoryFilter = "all") {
  return {
    pathname: OPPORTUNITY_EXPLORER_PATH,
    search: category === "all" ? "" : `?category=${category}`,
  };
}

export function resolveOpportunityCategoryFilter(search: string): OpportunityCategoryFilter {
  const category = new URLSearchParams(search).get("category");

  if (
    category === "vacancy" ||
    category === "internship" ||
    category === "event" ||
    category === "mentorship"
  ) {
    return category;
  }

  return "all";
}
