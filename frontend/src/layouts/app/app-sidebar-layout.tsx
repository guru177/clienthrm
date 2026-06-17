import { type PropsWithChildren, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { AnnouncementsProvider } from '@/components/announcements-banner';
import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import SubscriptionExpiryBanner from '@/components/subscription-expiry-banner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';

export default function AppSidebarLayout({
    children,
    breadcrumbs = [],
}: PropsWithChildren<{ breadcrumbs?: BreadcrumbItem[] }>) {
    const location = useLocation();
    const { plan } = useAuth();
    const isViewportLocked = location.pathname === '/admin/support';

    useEffect(() => {
        if (!isViewportLocked) return;
        const prev = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.documentElement.style.overflow = prev;
        };
    }, [isViewportLocked]);

    return (
        <AnnouncementsProvider>
        <AppShell
            variant="sidebar"
            className={cn(
                isViewportLocked && 'h-svh max-h-svh !min-h-0 overflow-hidden',
            )}
        >
            <AppSidebar />
            <AppContent
                variant="sidebar"
                className={cn(
                    'overflow-x-hidden',
                    isViewportLocked &&
                        'flex !min-h-0 h-svh max-h-svh flex-col overflow-y-hidden',
                )}
            >
                <ImpersonationBanner />
                <SubscriptionExpiryBanner plan={plan} />
                <AppSidebarHeader breadcrumbs={breadcrumbs} />
                <div
                    className={cn(
                        isViewportLocked
                            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                            : 'p-4 md:p-6',
                    )}
                >
                    {children}
                </div>
            </AppContent>
        </AppShell>
        </AnnouncementsProvider>
    );
}
