import { useLocation } from 'react-router-dom';
import AppearanceToggleDropdown from '@/components/appearance-dropdown';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { AnnouncementsHeaderButton } from '@/components/announcements-banner';
import { OrgNotificationsButton } from '@/components/org-notifications-panel';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';

export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    const location = useLocation();
    const isViewportLocked = location.pathname === '/admin/support';

    return (
        <header
            className={cn(
                'flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/60 bg-gradient-to-r from-[#e8f2fd]/80 via-[#d0e4f8]/80 to-[#e8f2fd]/80 bg-[length:200%_200%] animate-gradient-slow backdrop-blur-md px-6 shadow-sm transition-[width,height] dark:border-white/10 dark:from-[#0d1e33]/80 dark:via-[#0a1828]/80 dark:to-[#0d1e33]/80 md:px-4',
                isViewportLocked ? 'relative z-10 w-full' : 'sticky top-0 z-10 w-full',
            )}
        >
            <div className="flex items-center gap-2">
                <SidebarTrigger className="-ml-1" />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </div>
            <div className="flex items-center gap-1">
                <AnnouncementsHeaderButton />
                <OrgNotificationsButton />
                <AppearanceToggleDropdown />
            </div>
        </header>
    );
}
