import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { ReactElement } from "react";

import { meRequest, useAuthStore } from "../../features/auth";
import { AuthPage } from "../../pages/auth";
import { CuratorDashboardPage } from "../../pages/curator-dashboard";
import { EmployerDashboardPage } from "../../pages/employer-dashboard";
import { EmployerOnboardingPage } from "../../pages/employer-onboarding";
import { LoginPage } from "../../pages/login";
import { HomePage } from "../../pages/home";
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
    queryKey: ["auth", "me", "route-guard"],
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
  };
}

function ProtectedRoute({ children }: { children: ReactElement }) {
  const {
    accessToken,
    refreshToken,
    isHydrated,
    shouldCheckEmployerProfile,
    isEmployerProfilePending,
    hasEmployerProfile,
  } = useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (!accessToken && !refreshToken) {
    return <Navigate to="/login" replace />;
  }

  if (shouldCheckEmployerProfile) {
    if (isEmployerProfilePending) {
      return null;
    }

    if (!hasEmployerProfile) {
      return <Navigate to="/onboarding/employer" replace />;
    }
  }

  return children;
}

function GuestOnlyRoute({ children }: { children: ReactElement }) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  if (!isHydrated) {
    return null;
  }

  if (accessToken || refreshToken) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function HomeRoute() {
  const { isHydrated, shouldCheckEmployerProfile, isEmployerProfilePending, hasEmployerProfile } =
    useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (shouldCheckEmployerProfile) {
    if (isEmployerProfilePending) {
      return null;
    }

    if (!hasEmployerProfile) {
      return <Navigate to="/onboarding/employer" replace />;
    }
  }

  return <HomePage />;
}

function EmployerOnboardingRoute() {
  const {
    role,
    isHydrated,
    isAuthenticated,
    isEmployerProfilePending,
    hasEmployerProfile,
  } = useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role !== "employer") {
    return <Navigate to="/" replace />;
  }

  if (isEmployerProfilePending) {
    return null;
  }

  if (hasEmployerProfile) {
    return <Navigate to="/" replace />;
  }

  return <EmployerOnboardingPage />;
}

function EmployerRestrictedPublicRoute({ children }: { children: ReactElement }) {
  const { isHydrated, shouldCheckEmployerProfile, isEmployerProfilePending, hasEmployerProfile } =
    useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (shouldCheckEmployerProfile) {
    if (isEmployerProfilePending) {
      return null;
    }

    if (!hasEmployerProfile) {
      return <Navigate to="/onboarding/employer" replace />;
    }
  }

  return children;
}

function FallbackRoute() {
  const { isHydrated, shouldCheckEmployerProfile, isEmployerProfilePending, hasEmployerProfile, isAuthenticated } =
    useEmployerProfileAccess();

  if (!isHydrated) {
    return null;
  }

  if (shouldCheckEmployerProfile) {
    if (isEmployerProfilePending) {
      return null;
    }

    if (!hasEmployerProfile) {
      return <Navigate to="/onboarding/employer" replace />;
    }
  }

  return <Navigate to={isAuthenticated ? "/" : "/register"} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
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
      <Route
        path="/onboarding/employer"
        element={
          <EmployerOnboardingRoute />
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
  );
}
