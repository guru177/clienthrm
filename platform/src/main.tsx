import './app.css';

import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PlatformAuthProvider } from '@/contexts/PlatformAuthContext';

const PlatformLayout = lazy(() => import('@/layouts/platform-layout'));
const PlatformLogin = lazy(() => import('@/pages/login'));
const PlatformDashboard = lazy(() => import('@/pages/dashboard/index'));
const PlatformUsers = lazy(() => import('@/pages/users/index'));
const PlatformSubscriptionPlans = lazy(() => import('@/pages/subscription-plans/index'));
const PlatformIpTracking = lazy(() => import('@/pages/ip-tracking/index'));
const PlatformReleases = lazy(() => import('@/pages/releases/index'));
const PlatformAuditLog = lazy(() => import('@/pages/audit-log/index'));
const PlatformTeam = lazy(() => import('@/pages/platform-team/index'));
const PlatformAccount = lazy(() => import('@/pages/account/index'));
const PlatformAnnouncements = lazy(() => import('@/pages/announcements/index'));
const PlatformTenantDetail = lazy(() => import('@/pages/tenants/detail'));
const PlatformSystemHealth = lazy(() => import('@/pages/system-health/index'));
const PlatformRevenue = lazy(() => import('@/pages/revenue/index'));
const PlatformUpgradeRequests = lazy(() => import('@/pages/upgrade-requests/index'));
const PlatformSupport = lazy(() => import('@/pages/support/index'));

function PageLoader() {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
    );
}

function App() {
    return (
        <Routes>
            <Route
                path="/login"
                element={
                    <Suspense fallback={<PageLoader />}>
                        <PlatformLogin />
                    </Suspense>
                }
            />
            <Route
                path="/"
                element={
                    <Suspense fallback={<PageLoader />}>
                        <PlatformLayout />
                    </Suspense>
                }
            >
                <Route
                    index
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformDashboard />
                        </Suspense>
                    }
                />
                <Route
                    path="users"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformUsers />
                        </Suspense>
                    }
                />
                <Route
                    path="subscription-plans"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformSubscriptionPlans />
                        </Suspense>
                    }
                />
                <Route
                    path="ip-tracking"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformIpTracking />
                        </Suspense>
                    }
                />
                <Route
                    path="announcements"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformAnnouncements />
                        </Suspense>
                    }
                />
                <Route
                    path="releases"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformReleases />
                        </Suspense>
                    }
                />
                <Route
                    path="audit-log"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformAuditLog />
                        </Suspense>
                    }
                />
                <Route
                    path="platform-team"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformTeam />
                        </Suspense>
                    }
                />
                <Route
                    path="account"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformAccount />
                        </Suspense>
                    }
                />
                <Route
                    path="tenants/:id"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformTenantDetail />
                        </Suspense>
                    }
                />
                <Route
                    path="system-health"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformSystemHealth />
                        </Suspense>
                    }
                />
                <Route
                    path="revenue"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformRevenue />
                        </Suspense>
                    }
                />
                <Route
                    path="upgrade-requests"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformUpgradeRequests />
                        </Suspense>
                    }
                />
                <Route
                    path="support"
                    element={
                        <Suspense fallback={<PageLoader />}>
                            <PlatformSupport />
                        </Suspense>
                    }
                />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <PlatformAuthProvider>
                <App />
            </PlatformAuthProvider>
        </BrowserRouter>
    </StrictMode>,
);
