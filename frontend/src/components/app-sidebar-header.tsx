import { Link, useLocation } from 'react-router-dom';
import AppearanceToggleDropdown from '@/components/appearance-dropdown';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { AnnouncementsHeaderButton } from '@/components/announcements-banner';
import { OrgNotificationsButton } from '@/components/org-notifications-panel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useInitials } from '@/hooks/use-initials';
import { useStorageSrc } from '@/hooks/use-storage-src';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';

export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    const location = useLocation();
    const { user } = useAuth();
    const getInitials = useInitials();
    const photoSrc = useStorageSrc(user?.photo || user?.avatar);
    const isViewportLocked = location.pathname === '/admin/support';
    const profileActive = location.pathname.startsWith('/admin/settings/');

    return (
        <header
            className={cn(
                'flex min-h-16 h-auto shrink-0 items-center justify-between gap-2 border-b border-white/60 bg-gradient-to-r from-[#e8f2fd]/80 via-[#d0e4f8]/80 to-[#e8f2fd]/80 bg-[length:200%_200%] animate-gradient-slow backdrop-blur-md px-4 py-2 shadow-sm transition-[width,height] dark:border-white/10 dark:from-[#0d1e33]/80 dark:via-[#0a1828]/80 dark:to-[#0d1e33]/80 md:px-4',
                isViewportLocked ? 'relative z-10 w-full min-w-0' : 'sticky top-0 z-10 w-full min-w-0',
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <SidebarTrigger className="-ml-1 shrink-0" />
                <div className="min-w-0 flex-1 truncate">
                    <Breadcrumbs breadcrumbs={breadcrumbs} />
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <AnnouncementsHeaderButton />
                <OrgNotificationsButton />
                <AppearanceToggleDropdown />
                {user && (
                    <Link
                        to="/admin/settings/profile"
                        data-testid="mobile-profile-header"
                        aria-label="My profile"
                        title="My profile"
                        className={cn(
                            'ml-0.5 flex h-10 w-10 items-center justify-center rounded-full ring-offset-background transition-shadow md:hidden',
                            profileActive
                                ? 'ring-2 ring-primary ring-offset-2'
                                : 'hover:ring-2 hover:ring-primary/40 hover:ring-offset-2',
                        )}
                    >
                        <Avatar className="h-9 w-9 overflow-hidden rounded-full border border-white/80 shadow-sm">
                            <AvatarImage src={photoSrc || undefined} alt={user.name} />
                            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                                {getInitials(user.name)}
                            </AvatarFallback>
                        </Avatar>
                    </Link>
                )}
            </div>
        </header>
    );
}
