export function cn(...classNames: Array<string | undefined | false | null>): string {
  return classNames.filter(Boolean).join(" ");
}

export { resolveAvatarIcon } from "./avatar";
export { abbreviateLegalEntityName } from "./legal-entity";
export { formatPresenceStatus } from "./presence";
