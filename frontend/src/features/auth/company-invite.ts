const COMPANY_INVITE_RETURN_TO_STORAGE_KEY = "tramplin.auth.company-invite-return-to";

export function readCompanyInviteReturnTo() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(COMPANY_INVITE_RETURN_TO_STORAGE_KEY);
}

export function persistCompanyInviteReturnTo(returnTo: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(COMPANY_INVITE_RETURN_TO_STORAGE_KEY, returnTo);
}

export function clearCompanyInviteReturnTo() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(COMPANY_INVITE_RETURN_TO_STORAGE_KEY);
}

export function isCompanyInviteReturnTo(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const [pathname, search = ""] = value.split("?");
  if (pathname !== "/settings") {
    return false;
  }

  const params = new URLSearchParams(search);
  return params.get("mode") === "accept-company-invite" && Boolean(params.get("invite_token"));
}
