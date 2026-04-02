import adminAvatar from "../../assets/icons/admin.png";
import applicantAvatar from "../../assets/icons/applicant.png";
import employerAvatar from "../../assets/icons/employer.png";
import profileAvatar from "../../assets/icons/profile.png";
import { getApiBaseUrl, normalizeUrlForCurrentOrigin } from "../config/env";

function resolveApiOrigin() {
  try {
    return new URL(getApiBaseUrl()).origin;
  } catch {
    return "";
  }
}

export function resolveAvatarUrl(avatarUrl: string | null | undefined) {
  if (!avatarUrl) {
    return null;
  }

  if (
    avatarUrl.startsWith("http://") ||
    avatarUrl.startsWith("https://") ||
    avatarUrl.startsWith("blob:") ||
    avatarUrl.startsWith("data:")
  ) {
    return normalizeUrlForCurrentOrigin(avatarUrl);
  }

  if (avatarUrl.startsWith("/")) {
    const apiOrigin = resolveApiOrigin();
    return normalizeUrlForCurrentOrigin(`${apiOrigin}${avatarUrl}`);
  }

  return normalizeUrlForCurrentOrigin(avatarUrl);
}

export function resolveAvatarIcon(role: string | null | undefined) {
  if (role === "employer") {
    return employerAvatar;
  }

  if (role === "applicant") {
    return applicantAvatar;
  }

  if (role === "admin") {
    return adminAvatar;
  }

  return profileAvatar;
}
