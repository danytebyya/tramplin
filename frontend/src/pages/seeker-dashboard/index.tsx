import { LogoutButton } from "../../features/auth";

export function SeekerDashboardPage() {
  return (
    <main className="page-placeholder">
      <LogoutButton className="page-placeholder__logout" variant="primary-outline" />
      <h1 className="page-placeholder__title">Applicant Dashboard</h1>
      <p className="page-placeholder__text">Role-based dashboard skeleton.</p>
    </main>
  );
}
