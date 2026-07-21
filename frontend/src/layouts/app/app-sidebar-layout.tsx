import { type PropsWithChildren, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { AnnouncementsProvider } from '@/components/announcements-banner';
import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { DesktopUpdateBanner } from '@/components/desktop-update-banner';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { InstallPwaBanner } from '@/components/install-pwa-banner';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import SubscriptionExpiryBanner from '@/components/subscription-expiry-banner';
import { useSidebar } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { getOfflinePunchCount } from '@/lib/offline-punch-queue';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem } from '@/types';

function SidebarMobileAutoClose() {
    const { pathname } = useLocation();
    const { isMobile, setOpenMobile } = useSidebar();

    useEffect(() => {
        if (isMobile) {
            setOpenMobile(false);
        }
    }, [pathname, isMobile, setOpenMobile]);

    return null;
}

export default function AppSidebarLayout({
    children,
    breadcrumbs = [],
}: PropsWithChildren<{ breadcrumbs?: BreadcrumbItem[] }>) {
    const location = useLocation();
    const { plan } = useAuth();
    const isMobile = useIsMobile();
    const isViewportLocked =
        location.pathname === '/admin/support' || location.pathname === '/admin/live-locations';
    const [pendingPunches, setPendingPunches] = useState(0);

    useEffect(() => {
        if (!isViewportLocked) return;
        const prev = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.documentElement.style.overflow = prev;
        };
    }, [isViewportLocked]);

    useEffect(() => {
        const refresh = () => setPendingPunches(getOfflinePunchCount());
        refresh();
        window.addEventListener('online', refresh);
        window.addEventListener('hrm-offline-punch-changed', refresh);
        return () => {
            window.removeEventListener('online', refresh);
            window.removeEventListener('hrm-offline-punch-changed', refresh);
        };
    }, []);

    return (
        <AnnouncementsProvider>
        <AppShell
            variant="sidebar"
            className={cn(
                isViewportLocked && 'h-svh max-h-svh !min-h-0 overflow-hidden',
            )}
        >
            <SidebarMobileAutoClose />
            <AppSidebar />
            <AppContent
                variant="sidebar"
                className={cn(
                    'min-w-0 max-w-full',
                    isViewportLocked &&
                        'flex !min-h-0 h-svh max-h-svh flex-col overflow-y-hidden',
                )}
            >
                <ImpersonationBanner />
                <SubscriptionExpiryBanner plan={plan} />
                <DesktopUpdateBanner />
                <AppSidebarHeader breadcrumbs={breadcrumbs} />
                <div
                    className={cn(
                        'page-frame min-w-0 w-full max-w-full',
                        isViewportLocked
                            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                            : 'p-4 md:p-6',
                        isMobile && !isViewportLocked && 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]',
                    )}
                >
                    {children}
                </div>
                {!isViewportLocked && (
                    <>
                        <InstallPwaBanner />
                        <MobileBottomNav pendingPunches={pendingPunches} />
                    </>
                )}
            </AppContent>
        </AppShell>
        </AnnouncementsProvider>
    );
}
