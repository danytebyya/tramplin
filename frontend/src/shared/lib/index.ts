export function cn(...classNames: Array<string | undefined | false | null>): string {
  return classNames.filter(Boolean).join(" ");
}

export { resolveAvatarIcon, resolveAvatarUrl } from "./avatar";
export { abbreviateLegalEntityName } from "./legal-entity";
export {
  buildOpportunitySearchText,
  expandOpportunitySearchAliases,
  matchesOpportunitySearch,
  normalizeOpportunitySearchText,
} from "./opportunity-search";
export { formatPresenceStatus } from "./presence";
