import { Navigate, Route, Routes } from "react-router-dom";
import { ReactElement } from "react";

import { useAuthStore } from "../../features/auth";
import { AuthPage } from "../../pages/auth";
import { CuratorDashboardPage } from "../../pages/curator-dashboard";
import { EmployerDashboardPage } from "../../pages/employer-dashboard";
import { LoginPage } from "../../pages/login";
import { MapPage } from "../../pages/map";
import { SeekerDashboardPage } from "../../pages/seeker-dashboard";
import { UiKitPage } from "../../pages/ui-kit";

function ProtectedRoute({ children }: { children: ReactElement }) {
  const accessToken = useAuthStore((state) => state.accessToken);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<MapPage />} />
      <Route path="/register" element={<AuthPage />} />
      <Route path="/ui-kit" element={<UiKitPage />} />
      <Route path="/login" element={<LoginPage />} />
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
      <Route path="*" element={<Navigate to="/register" replace />} />
    </Routes>
  );
}
