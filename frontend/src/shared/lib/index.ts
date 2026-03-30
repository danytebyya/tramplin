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
