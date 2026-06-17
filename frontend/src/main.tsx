import './app.css';

import { StrictMode, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isElectronApp } from '@/lib/is-electron';
import { BreadcrumbProvider, useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import { Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useAdminPresence } from '@/hooks/use-admin-presence';
import { useChatNotifications } from '@/hooks/use-chat-notifications';
import { ChatNotificationProvider } from '@/contexts/ChatNotificationContext';
import { Toaster } from 'react-hot-toast';
import { PermissionRoute } from '@/components/permission-route';
import { initializeTheme } from '@/hooks/use-appearance';
import { defaultAdminRoute } from '@/lib/default-route';

function DefaultAdminRedirect() {
    const { loading, hasPermission } = useAuth();
    if (loading) return <PageLoader />;
    return <Navigate to={defaultAdminRoute(hasPermission)} replace />;
}

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
const Signup = lazy(() => import('@/pages/auth/signup'));
const ImpersonateCallback = lazy(() => import('@/pages/auth/impersonate'));
const Dashboard = lazy(() => import('@/pages/admin/dashboard'));
const UsersIndex = lazy(() => import('@/pages/admin/users/index'));
const UsersView = lazy(() => import('@/pages/admin/users/view'));
const UsersEdit = lazy(() => import('@/pages/admin/users/edit'));
const DepartmentsIndex = lazy(() => import('@/pages/admin/departments/index'));
const DesignationsIndex = lazy(() => import('@/pages/admin/designations/index'));
const CentersIndex = lazy(() => import('@/pages/admin/centers/index'));
const JobApplicationsIndex = lazy(() => import('@/pages/admin/careers/applications'));
const AttendanceIndex = lazy(() => import('@/pages/admin/attendance/index'));
const ShiftsIndex = lazy(() => import('@/pages/admin/shifts/index'));
const ShiftRoster = lazy(() => import('@/pages/admin/shifts/roster'));
const DailyShiftSchedule = lazy(() => import('@/pages/admin/shifts/daily-schedule'));
const BiometricIndex = lazy(() => import('@/pages/admin/biometric/index'));
const LeaveRequestsIndex = lazy(() => import('@/pages/admin/leave-requests/index'));
const LeaveRequestsManage = lazy(() => import('@/pages/admin/leave-requests/manage'));
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
const MyPayslips = lazy(() => import('@/pages/admin/my-payslips'));
const AppSettings = lazy(() => import('@/pages/admin/settings/app-settings'));
const LeaveTypesSettings = lazy(() => import('@/pages/admin/settings/leave-types'));
const SettingsProfile = lazy(() => import('@/pages/admin/settings/profile'));
const SettingsPassword = lazy(() => import('@/pages/admin/settings/password'));
const SettingsAppearance = lazy(() => import('@/pages/admin/settings/appearance'));
const CareersIndex = lazy(() => import('@/pages/admin/careers/index'));
const EmployeePayslipsRoute = lazy(() => import('@/pages/admin/salaries/payslips-route'));
const Unauthorized = lazy(() => import('@/pages/unauthorized'));
const NotFound = lazy(() => import('@/pages/not-found'));
const OnboardingIndex = lazy(() => import('@/pages/onboarding/index'));
const ReportsIndex = lazy(() => import('@/pages/admin/reports/index'));
const TeamChat = lazy(() => import('@/pages/admin/chat/index'));
const SubscriptionPage = lazy(() => import('@/pages/admin/subscription/index'));
const SupportPage = lazy(() => import('@/pages/admin/support/index'));
const NotificationsAdminPage = lazy(() => import('@/pages/admin/notifications/index'));

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
    const { user, loading, hasPermission } = useAuth();
    if (loading) return <PageLoader />;
    if (user) {
        return <Navigate to={defaultAdminRoute(hasPermission)} replace />;
    }
    return <>{children}</>;
}

// ── Admin Layout Route ──
function AdminLayoutContent() {
    const { breadcrumbs } = useBreadcrumbs();
    useChatNotifications();

    return (
        <AppLayoutTemplate breadcrumbs={breadcrumbs}>
            <Suspense fallback={<PageLoader />}>
                <Outlet />
            </Suspense>
        </AppLayoutTemplate>
    );
}

function AdminLayout() {
    const { user } = useAuth();
    useAdminPresence(!!user?.is_super_admin);

    return (
        <ProtectedRoute>
            <ChatNotificationProvider>
                <AdminLayoutContent />
            </ChatNotificationProvider>
        </ProtectedRoute>
    );
}

// ── App ──
function App() {
    return (
        <Routes>
            {/* Public routes */}
            <Route path="/login" element={<GuestRoute><Suspense fallback={<PageLoader />}><Login /></Suspense></GuestRoute>} />
            <Route path="/signup" element={<GuestRoute><Suspense fallback={<PageLoader />}><Signup /></Suspense></GuestRoute>} />
            <Route path="/auth/impersonate" element={<Suspense fallback={<PageLoader />}><ImpersonateCallback /></Suspense>} />
            <Route path="/careers" element={<Navigate to="/login" replace />} />

            {/* Dashboard */}
            <Route element={<AdminLayout />}>
                <Route path="/admin/dashboard" element={<PermissionRoute permission="view-dashboard" module="dashboard"><Dashboard /></PermissionRoute>} />

            {/* Users & Roles */}
            <Route path="/admin/users" element={<PermissionRoute permission="view-users" module="users"><UsersIndex /></PermissionRoute>} />
            <Route path="/admin/users/:id" element={<PermissionRoute permission="view-users" module="users"><UsersView /></PermissionRoute>} />
            <Route path="/admin/users/:id/edit" element={<PermissionRoute permission="edit-users" module="users"><UsersEdit /></PermissionRoute>} />
            <Route path="/admin/roles/:id/edit" element={<PermissionRoute permission="edit-roles" module="users"><RolesEdit /></PermissionRoute>} />

            {/* Organization */}
            <Route path="/admin/departments" element={<PermissionRoute permission="view-departments" module="departments"><DepartmentsIndex /></PermissionRoute>} />
            <Route path="/admin/designations" element={<PermissionRoute permission="view-designations" module="designations"><DesignationsIndex /></PermissionRoute>} />
            <Route path="/admin/centers" element={<PermissionRoute permission="manage-settings" module="centers"><CentersIndex /></PermissionRoute>} />

            {/* Careers & Applications */}
            <Route path="/admin/careers" element={<PermissionRoute permission="view-jobs" module="careers"><CareersIndex /></PermissionRoute>} />
            <Route path="/admin/job-applications" element={<PermissionRoute permission="view-jobs" module="job_applications"><JobApplicationsIndex /></PermissionRoute>} />

            {/* Attendance & Leave */}
            <Route path="/admin/attendance" element={<PermissionRoute permission="view-attendance" module="attendance"><AttendanceIndex /></PermissionRoute>} />
            <Route path="/admin/my-payslips" element={<PermissionRoute permission="view-my-payslips" module="my_payslips"><MyPayslips /></PermissionRoute>} />
            <Route path="/admin/reports" element={<PermissionRoute permission="view-reports" module="reports"><ReportsIndex /></PermissionRoute>} />
            <Route path="/admin/shifts">
                <Route index element={<PermissionRoute permission="view-attendance" module="shifts"><ShiftsIndex /></PermissionRoute>} />
                <Route path="roster" element={<PermissionRoute permission="view-attendance" module="shifts"><ShiftRoster /></PermissionRoute>} />
                <Route path="daily" element={<PermissionRoute permission="view-attendance" module="shifts"><DailyShiftSchedule /></PermissionRoute>} />
            </Route>
            <Route path="/admin/biometric" element={<PermissionRoute permission="view-attendance" module="biometric"><BiometricIndex /></PermissionRoute>} />
            <Route path="/admin/leave-requests" element={<PermissionRoute permission="view-leave-requests" module="leave"><LeaveRequestsIndex /></PermissionRoute>} />
            <Route path="/admin/leave-requests/manage" element={<PermissionRoute permissions={['manage-leave-requests', 'approve-leave-requests', 'reject-leave-requests']} module="leave_manage"><LeaveRequestsManage /></PermissionRoute>} />
            <Route path="/admin/holidays" element={<PermissionRoute permission="view-holidays" module="holidays"><HolidaysIndex /></PermissionRoute>} />

            {/* Salaries & Payroll */}
            <Route path="/admin/salaries/components" element={<PermissionRoute permission="view-payroll" module="payroll"><SalaryComponents /></PermissionRoute>} />
            <Route path="/admin/salaries/employees" element={<PermissionRoute permission="view-payroll" module="payroll"><SalaryEmployees /></PermissionRoute>} />
            <Route path="/admin/salaries/employees/:id/payslips" element={<PermissionRoute permission="view-payroll" module="payroll"><EmployeePayslipsRoute /></PermissionRoute>} />
            <Route path="/admin/payroll" element={<PermissionRoute permission="view-payroll" module="payroll"><PayrollIndex /></PermissionRoute>} />

            {/* Workflows */}
            <Route path="/admin/workflows" element={<PermissionRoute permission="view-workflows" module="workflows"><WorkflowsIndex /></PermissionRoute>} />
            <Route path="/admin/workflows/create" element={<PermissionRoute permission="create-workflows" module="workflows"><WorkflowsCreate /></PermissionRoute>} />
            <Route path="/admin/workflows/:id" element={<PermissionRoute permission="view-workflows" module="workflows"><WorkflowsView /></PermissionRoute>} />
            <Route path="/admin/workflows/:id/edit" element={<PermissionRoute permission="edit-workflows" module="workflows"><WorkflowsEdit /></PermissionRoute>} />

            {/* Tasks */}
            <Route path="/admin/tasks" element={<PermissionRoute permission="view-tasks" module="tasks"><TasksIndex /></PermissionRoute>} />
            <Route path="/admin/tasks/create" element={<PermissionRoute permission="create-tasks" module="tasks"><TasksCreate /></PermissionRoute>} />
            <Route path="/admin/tasks/:id" element={<PermissionRoute permission="view-tasks" module="tasks"><TasksView /></PermissionRoute>} />
            <Route path="/admin/tasks/:id/edit" element={<PermissionRoute permission="edit-tasks" module="tasks"><TasksEdit /></PermissionRoute>} />


            {/* Projects */}
            <Route path="/admin/projects" element={<PermissionRoute permission="view-projects" module="projects"><ProjectsIndex /></PermissionRoute>} />
            <Route path="/admin/projects/create" element={<PermissionRoute permission="create-projects" module="projects"><ProjectsCreate /></PermissionRoute>} />
            <Route path="/admin/projects/:id" element={<PermissionRoute permission="view-projects" module="projects"><ProjectsView /></PermissionRoute>} />
            <Route path="/admin/projects/:id/edit" element={<PermissionRoute permission="edit-projects" module="projects"><ProjectsEdit /></PermissionRoute>} />

            {/* Team Chat */}
            <Route path="/admin/chat" element={<PermissionRoute permission="view-chat" module="chat"><TeamChat /></PermissionRoute>} />
            <Route path="/admin/chat/:spaceId" element={<PermissionRoute permission="view-chat" module="chat"><TeamChat /></PermissionRoute>} />

            {/* Billing & support */}
            <Route path="/admin/subscription" element={<PermissionRoute permission="manage-subscription" module="subscription"><SubscriptionPage /></PermissionRoute>} />
            <Route path="/admin/notifications" element={<PermissionRoute permission="manage-org-notifications" module="notifications"><NotificationsAdminPage /></PermissionRoute>} />
            <Route path="/admin/support" element={<PermissionRoute permission="view-support" module="support"><SupportPage /></PermissionRoute>} />

            {/* Settings */}
            <Route path="/admin/settings/app" element={<PermissionRoute permission="manage-settings" module="settings"><AppSettings /></PermissionRoute>} />
            <Route path="/admin/settings/leave-types" element={<PermissionRoute permission="manage-settings" module="settings"><LeaveTypesSettings /></PermissionRoute>} />
            <Route path="/admin/settings/profile" element={<SettingsProfile />} />
            <Route path="/admin/settings/password" element={<SettingsPassword />} />
            <Route path="/admin/settings/appearance" element={<SettingsAppearance />} />

            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Onboarding */}
            <Route path="/onboarding" element={<OnboardingIndex />} />
            </Route>

            {/* Default redirect */}
            <Route path="/" element={<DefaultAdminRedirect />} />
            <Route path="/admin" element={<DefaultAdminRedirect />} />

            {/* Catch-all */}
            <Route path="*" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><NotFound /></Suspense></ProtectedRoute>} />
        </Routes>
    );
}

// ── Mount ──
const root = document.getElementById('root')!;
const AppRouter = isElectronApp() ? HashRouter : BrowserRouter;
initializeTheme();
createRoot(root).render(
    <StrictMode>
        <AppRouter>
            <AuthProvider>
                <BreadcrumbProvider>
                <ErrorBoundary>
                    <App />
                </ErrorBoundary>
                <Toaster position="top-right" />
                            </BreadcrumbProvider>
</AuthProvider>
        </AppRouter>
    </StrictMode>,
);
