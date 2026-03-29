import { env } from "../config/env";

const AVATAR_PUBLIC_PREFIX = "/storage/company-avatars";

function resolveApiOrigin() {
  try {
    return new URL(env.apiBaseUrl).origin;
  } catch {
    return "";
  }
}

function buildAvatarStorageUrl(fileName: string) {
  const apiOrigin = resolveApiOrigin();
  return `${apiOrigin}${AVATAR_PUBLIC_PREFIX}/${fileName}`;
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
    return avatarUrl;
  }

  if (avatarUrl.startsWith("/")) {
    const apiOrigin = resolveApiOrigin();
    return `${apiOrigin}${avatarUrl}`;
  }

  return avatarUrl;
}

export function resolveAvatarIcon(role: string | null | undefined) {
  if (role === "employer") {
    return buildAvatarStorageUrl("employer.png");
  }

  if (role === "applicant") {
    return buildAvatarStorageUrl("applicant.png");
  }

  if (role === "admin") {
    return buildAvatarStorageUrl("admin.png");
  }

  return buildAvatarStorageUrl("profile.png");
}
