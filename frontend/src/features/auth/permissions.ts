import { AuthRole } from "./session";

export type EmployerPermissionKey =
  | "view_responses"
  | "manage_opportunities"
  | "manage_company_profile"
  | "manage_staff"
  | "access_chat";

type AccessTokenPayload = {
  active_role?: AuthRole;
  active_membership_id?: string;
  active_permissions?: string[];
};

export type EmployerAccessState = {
  isEmployer: boolean;
  isStaffContext: boolean;
  hasFullAccess: boolean;
  permissionKeys: EmployerPermissionKey[];
  canReviewResponses: boolean;
  canManageOpportunities: boolean;
  canManageCompanyProfile: boolean;
  canManageStaff: boolean;
  canAccessChat: boolean;
};

export function readAccessTokenPayload(token: string | null) {
  if (!token || typeof window === "undefined") {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decodedPayload = window.atob(normalizedPayload);
    return JSON.parse(decodedPayload) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function getEmployerAccessState(role: AuthRole | null, accessToken: string | null): EmployerAccessState {
  const payload = readAccessTokenPayload(accessToken);
  const permissionKeys = (payload?.active_permissions ?? []).filter((permission): permission is EmployerPermissionKey =>
    [
      "view_responses",
      "manage_opportunities",
      "manage_company_profile",
      "manage_staff",
      "access_chat",
    ].includes(permission),
  );
  const isEmployer = role === "employer";
  const isStaffContext = isEmployer && Boolean(payload?.active_membership_id);
  const hasFullAccess = isEmployer && (!isStaffContext || permissionKeys.length === 0);

  const hasPermission = (permission: EmployerPermissionKey) => hasFullAccess || permissionKeys.includes(permission);

  return {
    isEmployer,
    isStaffContext,
    hasFullAccess,
    permissionKeys,
    canReviewResponses: isEmployer && hasPermission("view_responses"),
    canManageOpportunities: isEmployer && hasPermission("manage_opportunities"),
    canManageCompanyProfile: isEmployer && hasPermission("manage_company_profile"),
    canManageStaff: isEmployer && hasPermission("manage_staff"),
    canAccessChat: isEmployer && hasPermission("access_chat"),
  };
}

export function resolveEmployerFallbackRoute(access: EmployerAccessState) {
  if (access.canManageCompanyProfile) {
    return "/dashboard/employer";
  }

  if (access.canManageOpportunities) {
    return "/employer/opportunities";
  }

  if (access.canAccessChat) {
    return "/employer/chat";
  }

  return "/settings";
}
