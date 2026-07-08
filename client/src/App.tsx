import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./lib/auth";
import AppLayout from "./components/layout/AppLayout";

// Route-level code splitting keeps the initial bundle lean.
const LoginPage = lazy(() => import("./features/auth/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./features/auth/ForgotPasswordPage"));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const LeadsPage = lazy(() => import("./features/leads/LeadsPage"));
const LeadDetailPage = lazy(() => import("./features/leads/LeadDetailPage"));
const PropertiesPage = lazy(() => import("./features/properties/PropertiesPage"));
const SiteVisitsPage = lazy(() => import("./features/site-visits/SiteVisitsPage"));
const PipelinePage = lazy(() => import("./features/pipeline/PipelinePage"));
const CustomersPage = lazy(() => import("./features/customers/CustomersPage"));
const TasksPage = lazy(() => import("./features/tasks/TasksPage"));
const AttendancePage = lazy(() => import("./features/attendance/AttendancePage"));
const TeamPage = lazy(() => import("./features/team/TeamPage"));
const TeamMemberPage = lazy(() => import("./features/team/TeamMemberPage"));
const ReportsPage = lazy(() => import("./features/reports/ReportsPage"));
const IntegrationsPage = lazy(() => import("./features/integrations/IntegrationsPage"));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage"));
const ProfilePage = lazy(() => import("./features/profile/ProfilePage"));
const NotFoundPage = lazy(() => import("./features/shared/NotFoundPage"));

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/leads/:id" element={<LeadDetailPage />} />
          <Route path="/properties" element={<PropertiesPage />} />
          <Route path="/site-visits" element={<SiteVisitsPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team/:id" element={<TeamMemberPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/notifications" element={<Navigate to="/" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
