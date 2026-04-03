import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Location as RouterLocation } from "react-router-dom";
import { ReactElement } from "react";

import { isCompanyInviteReturnTo, meRequest, persistCompanyInviteReturnTo, readCompanyInviteReturnTo, useAuthStore } from "../../features/auth";
import { AuthPage } from "../../pages/auth";
import { ApplicationsPage } from "../../pages/applications";
import { ContentModerationPage } from "../../pages/content-moderation";
import { CuratorDashboardPage } from "../../pages/curator-dashboard";
import { CuratorManagementPage } from "../../pages/curator-management";
import { EmployerDashboardPage } from "../../pages/employer-dashboard";
import { EmployerChatPage } from "../../pages/employer-chat";
import { EmployerOnboardingPage } from "../../pages/employer-onboarding";
import { EmployerResponsesPage } from "../../pages/employer-responses";
import { EmployerVerificationPage } from "../../pages/employer-verification";
import { FavoritesPage } from "../../pages/favorites";
import { LoginPage } from "../../pages/login";
import { LegalDocumentPage } from "../../pages/legal/index";
import { HomePage } from "../../pages/home";
import { OpportunityManagementPage } from "../../pages/opportunity-management";
import { OpportunityDetailsPage } from "../../pages/opportunity-details";
import { NetworkingPage } from "../../pages/networking";
import { PasswordRecoveryPage } from "../../pages/password-recovery";
import { PublicProfilePage } from "../../pages/public-profile";
import { SettingsPage } from "../../pages/settings";
import { SeekerDashboardPage } from "../../pages/seeker-dashboard";
import { UiKitPage } from "../../pages/ui-kit";

function useEmployerProfileAccess() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const role = useAuthStore((state) => state.role);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const shouldCheckEmployerProfile = isHydrated && isAuthenticated && role === "employer";
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    enabled: shouldCheckEmployerProfile,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    accessToken,
    refreshToken,
    role,
    isHydrated,
    isAuthenticated,
    shouldCheckEmployerProfile,
    isEmployerProfilePending: shouldCheckEmployerProfile && currentUserQuery.isPending,
    hasEmployerProfile: Boolean(currentUserQuery.data?.data?.user?.employer_profile),
    employerVerificationStatus:
      currentUserQuery.data?.data?.user?.employer_profile?.verification_status ?? null,
    baseUserRole: currentUserQuery.data?.data?.user?.role ?? null,
    requiresEmployerOnboarding:
      role === "employer" &&
      currentUserQuery.data?.data?.user?.role === "employer" &&
      (!currentUserQuery.data?.data?.user?.employer_profile ||
        currentUserQuery.data?.data?.user?.employer_profile?.verification_status === "unverified"),
  };
}

function ProtectedRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const {
    accessToken,
    refreshToken,
    isHydrated,
    shouldCheckEmployerProfile,
    isEmployerProfilePending,
    requiresEmployerOnboarding,
  } = useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (!accessToken && !refreshToken) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    const searchParams = new URLSearchParams(location.search);
    const isCompanyInviteFlow = searchParams.get("mode") === "accept-company-invite" && searchParams.get("invite_token");

    if (isCompanyInviteFlow) {
      persistCompanyInviteReturnTo(returnTo);
      return <Navigate to={`/register?returnTo=${encodeURIComponent(returnTo)}`} replace />;
    }

    return <Navigate to="/" replace />;
  }

  if (shouldCheckEmployerProfile) {
    if (isEmployerProfilePending) {
      return null;
    }

    if (requiresEmployerOnboarding) {
      return <Navigate to="/onboarding/employer" replace />;
    }
  }

  return children;
}

function GuestOnlyRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  if (!isHydrated) {
    return null;
  }

  const persistedCompanyInviteReturnTo = readCompanyInviteReturnTo();
  const currentReturnTo = `${location.pathname}${location.search}${location.hash}`;
  if (isCompanyInviteReturnTo(currentReturnTo)) {
    persistCompanyInviteReturnTo(currentReturnTo);
  }

  if (accessToken || refreshToken) {
    return <Navigate to={persistedCompanyInviteReturnTo || "/"} replace />;
  }

  return children;
}

function HomeRoute() {
  const { isHydrated, shouldCheckEmployerProfile, isEmployerProfilePending, requiresEmployerOnboarding } =
    useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (shouldCheckEmployerProfile) {
    if (isEmployerProfilePending) {
      return null;
    }

    if (requiresEmployerOnboarding) {
      return <Navigate to="/onboarding/employer" replace />;
    }
  }

  return <HomePage />;
}

function EmployerOnboardingRoute() {
  const location = useLocation();
  const {
    role,
    isHydrated,
    isAuthenticated,
    isEmployerProfilePending,
    hasEmployerProfile,
    employerVerificationStatus,
  } = useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (role !== "employer") {
    return <Navigate to="/" replace />;
  }

  if (isEmployerProfilePending) {
    return null;
  }

  if (employerVerificationStatus === "changes_requested") {
    const searchParams = new URLSearchParams(location.search);
    const hasNotificationAccess = Boolean((location.state as { allowChangesRequestedAccess?: boolean } | null)?.allowChangesRequestedAccess);
    if (searchParams.get("mode") !== "changes-requested" || !hasNotificationAccess) {
      return <Navigate to="/" replace />;
    }
  }

  if (
    hasEmployerProfile &&
    employerVerificationStatus !== "changes_requested" &&
    employerVerificationStatus !== "unverified"
  ) {
    return <Navigate to="/" replace />;
  }

  return <EmployerOnboardingPage />;
}

function EmployerRestrictedPublicRoute({ children }: { children: ReactElement }) {
  const { isHydrated, shouldCheckEmployerProfile, isEmployerProfilePending, requiresEmployerOnboarding } =
    useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (shouldCheckEmployerProfile) {
    if (isEmployerProfilePending) {
      return null;
    }

    if (requiresEmployerOnboarding) {
      return <Navigate to="/onboarding/employer" replace />;
    }
  }

  return children;
}

function FallbackRoute() {
  const { isHydrated, shouldCheckEmployerProfile, isEmployerProfilePending, requiresEmployerOnboarding, isAuthenticated } =
    useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (shouldCheckEmployerProfile) {
    if (isEmployerProfilePending) {
      return null;
    }

    if (requiresEmployerOnboarding) {
      return <Navigate to="/onboarding/employer" replace />;
    }
  }

  return <Navigate to="/" replace />;
}

export function AppRouter() {
  const location = useLocation();
  const backgroundLocation = (location.state as { backgroundLocation?: RouterLocation } | null)?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation ?? location}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/confidential" element={<LegalDocumentPage documentType="confidential" />} />
        <Route path="/rules" element={<LegalDocumentPage documentType="rules" />} />
        <Route path="/privacy" element={<Navigate to="/confidential" replace />} />
        <Route path="/terms" element={<Navigate to="/rules" replace />} />
        <Route
          path="/register"
          element={
            <GuestOnlyRoute>
              <AuthPage />
            </GuestOnlyRoute>
          }
        />
        <Route
          path="/ui-kit"
          element={
            <EmployerRestrictedPublicRoute>
              <UiKitPage />
            </EmployerRestrictedPublicRoute>
          }
        />
        <Route
          path="/login"
          element={
            <GuestOnlyRoute>
              <LoginPage />
            </GuestOnlyRoute>
          }
        />
        <Route path="/password-recovery" element={<PasswordRecoveryPage />} />
        <Route
          path="/onboarding/employer"
          element={
            <EmployerOnboardingRoute />
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employer/opportunities"
          element={
            <ProtectedRoute>
              <OpportunityManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employer/chat"
          element={
            <ProtectedRoute>
              <EmployerChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employer/responses"
          element={
            <ProtectedRoute>
              <EmployerResponsesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/moderation/employers"
          element={
            <ProtectedRoute>
              <EmployerVerificationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/moderation/curators"
          element={
            <ProtectedRoute>
              <CuratorManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/moderation/content"
          element={
            <ProtectedRoute>
              <ContentModerationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/applicant"
          element={
            <ProtectedRoute>
              <SeekerDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications"
          element={
            <ProtectedRoute>
              <ApplicationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/favorites"
          element={
            <ProtectedRoute>
              <FavoritesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/opportunities/:opportunityId"
          element={
            <EmployerRestrictedPublicRoute>
              <OpportunityDetailsPage />
            </EmployerRestrictedPublicRoute>
          }
        />
        <Route
          path="/profiles/:publicId"
          element={
            <EmployerRestrictedPublicRoute>
              <PublicProfilePage />
            </EmployerRestrictedPublicRoute>
          }
        />
        <Route
          path="/networking"
          element={
            <ProtectedRoute>
              <NetworkingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/employer"
          element={
            <ProtectedRoute>
              <EmployerDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/curator"
          element={
            <ProtectedRoute>
              <CuratorDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<FallbackRoute />} />
      </Routes>

      {backgroundLocation ? (
        <Routes>
          <Route
            path="/opportunities/:opportunityId"
            element={
              <EmployerRestrictedPublicRoute>
                <OpportunityDetailsPage />
              </EmployerRestrictedPublicRoute>
            }
          />
        </Routes>
      ) : null}
    </>
  );
}
