import './app.css';

import { StrictMode, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BreadcrumbProvider, useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import { Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from 'react-hot-toast';
import { initializeTheme } from '@/hooks/use-appearance';

// ── Error Boundary to capture exact crash details ──
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; errorInfo: ErrorInfo | null }> {
    state: { error: Error | null; errorInfo: ErrorInfo | null } = { error: null, errorInfo: null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.setState({ errorInfo });
        console.error('ErrorBoundary caught:', error, errorInfo);
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 40, fontFamily: 'monospace', background: '#1a1a2e', color: '#e94560', minHeight: '100vh' }}>
                    <h1 style={{ color: '#fff', fontSize: 24 }}>⚠️ React Error</h1>
                    <pre style={{ whiteSpace: 'pre-wrap', marginTop: 16, color: '#e94560', fontSize: 14 }}>
                        {this.state.error.message}
                    </pre>
                    <pre style={{ whiteSpace: 'pre-wrap', marginTop: 16, color: '#aaa', fontSize: 12 }}>
                        {this.state.error.stack}
                    </pre>
                    {this.state.errorInfo && (
                        <pre style={{ whiteSpace: 'pre-wrap', marginTop: 16, color: '#888', fontSize: 11 }}>
                            {this.state.errorInfo.componentStack}
                        </pre>
                    )}
                    <button onClick={() => { this.setState({ error: null, errorInfo: null }); window.location.reload(); }}
                        style={{ marginTop: 20, padding: '10px 20px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ── Lazy-loaded Pages ──
const Login = lazy(() => import('@/pages/auth/login'));
const Dashboard = lazy(() => import('@/pages/admin/dashboard'));
const UsersIndex = lazy(() => import('@/pages/admin/users/index'));
const UsersView = lazy(() => import('@/pages/admin/users/view'));
const UsersEdit = lazy(() => import('@/pages/admin/users/edit'));
const DepartmentsIndex = lazy(() => import('@/pages/admin/departments/index'));
const DesignationsIndex = lazy(() => import('@/pages/admin/designations/index'));
const CentersIndex = lazy(() => import('@/pages/admin/centers/index'));
const JobApplicationsIndex = lazy(() => import('@/pages/admin/careers/applications'));
const AttendanceIndex = lazy(() => import('@/pages/admin/attendance/index'));
const LeaveRequestsManage = lazy(() => import('@/pages/admin/leave-requests/manage'));
const LeaveRequestsIndex = lazy(() => import('@/pages/admin/leave-requests/index'));
const HolidaysIndex = lazy(() => import('@/pages/admin/holidays/index'));
const SalaryComponents = lazy(() => import('@/pages/admin/salaries/components'));
const SalaryEmployees = lazy(() => import('@/pages/admin/salaries/employees'));
const PayrollIndex = lazy(() => import('@/pages/admin/payroll/index'));
const WorkflowsIndex = lazy(() => import('@/pages/admin/workflows/index'));
const WorkflowsView = lazy(() => import('@/pages/admin/workflows/view'));
const WorkflowsEdit = lazy(() => import('@/pages/admin/workflows/edit'));
const WorkflowsCreate = lazy(() => import('@/pages/admin/workflows/create'));
const TasksIndex = lazy(() => import('@/pages/admin/tasks/index'));
const TasksView = lazy(() => import('@/pages/admin/tasks/view'));
const TasksEdit = lazy(() => import('@/pages/admin/tasks/edit'));
const TasksCreate = lazy(() => import('@/pages/admin/tasks/create'));
const ProjectsIndex = lazy(() => import('@/pages/admin/projects/index'));
const ProjectsView = lazy(() => import('@/pages/admin/projects/view'));
const ProjectsEdit = lazy(() => import('@/pages/admin/projects/edit'));
const ProjectsCreate = lazy(() => import('@/pages/admin/projects/create'));
const RolesEdit = lazy(() => import('@/pages/admin/roles/edit'));
const AppSettings = lazy(() => import('@/pages/admin/settings/app-settings'));
const SettingsProfile = lazy(() => import('@/pages/admin/settings/profile'));
const SettingsPassword = lazy(() => import('@/pages/admin/settings/password'));
const SettingsAppearance = lazy(() => import('@/pages/admin/settings/appearance'));
const OnboardingIndex = lazy(() => import('@/pages/onboarding/index'));

// ── Loading Spinner ──
function PageLoader() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
        </div>
    );
}

// ── Auth Guard ──
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <PageLoader />;
    if (!user) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (user) return <Navigate to="/admin/dashboard" replace />;
    return <>{children}</>;
}

// ── Admin Layout Route ──
function AdminLayout() {
    const { breadcrumbs } = useBreadcrumbs();
    return (
        <ProtectedRoute>
            <AppLayoutTemplate breadcrumbs={breadcrumbs}>
                <Suspense fallback={<PageLoader />}>
                    <Outlet />
                </Suspense>
            </AppLayoutTemplate>
        </ProtectedRoute>
    );
}

// ── App ──
function App() {
    return (
        <Routes>
            {/* Public routes */}
            <Route path="/login" element={<GuestRoute><Suspense fallback={<PageLoader />}><Login /></Suspense></GuestRoute>} />

            {/* Dashboard */}
            <Route element={<AdminLayout />}>
                <Route path="/admin/dashboard" element={<Dashboard />} />

            {/* Users & Roles */}
            <Route path="/admin/users" element={<UsersIndex />} />
            <Route path="/admin/users/:id" element={<UsersView />} />
            <Route path="/admin/users/:id/edit" element={<UsersEdit />} />
            <Route path="/admin/roles/:id/edit" element={<RolesEdit />} />

            {/* Organization */}
            <Route path="/admin/departments" element={<DepartmentsIndex />} />
            <Route path="/admin/designations" element={<DesignationsIndex />} />
            <Route path="/admin/centers" element={<CentersIndex />} />

            {/* Applications */}
            <Route path="/admin/job-applications" element={<JobApplicationsIndex />} />

            {/* Attendance & Leave */}
            <Route path="/admin/attendance" element={<AttendanceIndex />} />
            <Route path="/admin/leave-requests" element={<LeaveRequestsIndex />} />
            <Route path="/admin/leave-requests/manage" element={<LeaveRequestsManage />} />
            <Route path="/admin/holidays" element={<HolidaysIndex />} />

            {/* Salaries & Payroll */}
            <Route path="/admin/salaries/components" element={<SalaryComponents />} />
            <Route path="/admin/salaries/employees" element={<SalaryEmployees />} />
            <Route path="/admin/payroll" element={<PayrollIndex />} />

            {/* Workflows */}
            <Route path="/admin/workflows" element={<WorkflowsIndex />} />
            <Route path="/admin/workflows/create" element={<WorkflowsCreate />} />
            <Route path="/admin/workflows/:id" element={<WorkflowsView />} />
            <Route path="/admin/workflows/:id/edit" element={<WorkflowsEdit />} />

            {/* Tasks */}
            <Route path="/admin/tasks" element={<TasksIndex />} />
            <Route path="/admin/tasks/create" element={<TasksCreate />} />
            <Route path="/admin/tasks/:id" element={<TasksView />} />
            <Route path="/admin/tasks/:id/edit" element={<TasksEdit />} />


            {/* Projects */}
            <Route path="/admin/projects" element={<ProjectsIndex />} />
            <Route path="/admin/projects/create" element={<ProjectsCreate />} />
            <Route path="/admin/projects/:id" element={<ProjectsView />} />
            <Route path="/admin/projects/:id/edit" element={<ProjectsEdit />} />

            {/* Settings */}
            <Route path="/admin/settings/app" element={<AppSettings />} />
            <Route path="/admin/settings/profile" element={<SettingsProfile />} />
            <Route path="/admin/settings/password" element={<SettingsPassword />} />
            <Route path="/admin/settings/appearance" element={<SettingsAppearance />} />



            {/* Onboarding */}
            <Route path="/onboarding" element={<OnboardingIndex />} />
            </Route>

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
    );
}

// ── Mount ──
const root = document.getElementById('root')!;
initializeTheme();
createRoot(root).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <BreadcrumbProvider>
                <ErrorBoundary>
                    <App />
                </ErrorBoundary>
                <Toaster position="top-right" />
                            </BreadcrumbProvider>
</AuthProvider>
        </BrowserRouter>
    </StrictMode>,
);
