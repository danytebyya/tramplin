export function cn(...classNames: Array<string | undefined | false | null>): string {
  return classNames.filter(Boolean).join(" ");
}

export { resolveAvatarIcon, resolveAvatarUrl } from "./avatar";
export { prepareAvatarFile } from "./avatar-file";
export { abbreviateLegalEntityName } from "./legal-entity";
export {
  buildOpportunitySearchText,
  expandOpportunitySearchAliases,
  matchesOpportunitySearch,
  normalizeOpportunitySearchText,
} from "./opportunity-search";
export {
  buildOpportunityExplorerRoute,
  opportunityCategoryLinks,
  OPPORTUNITY_EXPLORER_PATH,
  resolveOpportunityCategoryFilter,
} from "./opportunity-navigation";
export type { OpportunityCategoryFilter } from "./opportunity-navigation";
export { formatPresenceStatus } from "./presence";
export {
  canViewerAccessApplicantProfile,
  canViewerSeeApplicantResume,
  DEFAULT_APPLICANT_PRIVACY_SETTINGS,
  getApplicantPrivacySettings,
  saveApplicantPrivacySettings,
  subscribeApplicantPrivacy,
} from "./applicant-privacy";
export {
  createApplicantChatRequest,
  getApplicantChatRequest,
  subscribeApplicantChatRequests,
  updateApplicantChatRequestStatus,
} from "./chat-requests";
