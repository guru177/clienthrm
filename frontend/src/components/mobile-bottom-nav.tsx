import { ChevronRight, KeyRound, MoreHorizontal, Settings, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { useInitials } from '@/hooks/use-initials';
import { useIsMobile } from '@/hooks/use-mobile';
import { useStorageSrc } from '@/hooks/use-storage-src';
import {
    filterNav,
    flattenNavLinks,
    mainNavItems,
    resolveMobileTabs,
} from '@/lib/admin-nav';
import { cn } from '@/lib/utils';

type PendingBadgeProps = {
    pendingPunches?: number;
};

export function MobileBottomNav({ pendingPunches = 0 }: PendingBadgeProps) {
    const isMobile = useIsMobile();
    const location = useLocation();
    const { user, permissions, planModules } = useAuth();
    const getInitials = useInitials();
    const photoSrc = useStorageSrc(user?.photo || user?.avatar);
    const [moreOpen, setMoreOpen] = useState(false);

    const { tabs, tabHrefs } = useMemo(
        () => resolveMobileTabs(permissions, planModules),
        [permissions, planModules],
    );

    const moreLinks = useMemo(() => {
        const filtered = filterNav(mainNavItems, permissions, planModules);
        return flattenNavLinks(filtered).filter((link) => !tabHrefs.has(link.href));
    }, [permissions, planModules, tabHrefs]);

    if (!isMobile || tabs.length === 0) return null;

    const isActive = (href: string) =>
        location.pathname === href || location.pathname.startsWith(`${href}/`);

    return (
        <>
            <nav
                data-testid="mobile-bottom-nav"
                className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = isActive(tab.href);
                        const showBadge =
                            tab.id === 'clock' && pendingPunches > 0;
                        return (
                            <li key={tab.id} className="flex-1">
                                <Link
                                    to={tab.href}
                                    data-testid={`mobile-tab-${tab.id}`}
                                    className={cn(
                                        'relative flex h-full min-h-11 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium',
                                        active
                                            ? 'text-primary'
                                            : 'text-muted-foreground',
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    <span className="truncate">{tab.title}</span>
                                    {showBadge && (
                                        <span className="absolute top-1 right-[calc(50%-18px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                                            {pendingPunches}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                    <li className="flex-1">
                        <button
                            type="button"
                            data-testid="mobile-tab-more"
                            onClick={() => setMoreOpen(true)}
                            className={cn(
                                'flex h-full min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium',
                                moreOpen
                                    ? 'text-primary'
                                    : 'text-muted-foreground',
                            )}
                        >
                            <MoreHorizontal className="h-5 w-5" />
                            <span>More</span>
                        </button>
                    </li>
                </ul>
            </nav>

            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetContent
                    side="bottom"
                    className="max-h-[80vh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
                >
                    <SheetHeader>
                        <SheetTitle>More</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4 grid gap-3">
                        {user && (
                            <Link
                                to="/admin/settings/profile"
                                data-testid="mobile-more-profile"
                                onClick={() => setMoreOpen(false)}
                                className={cn(
                                    'flex min-h-14 items-center gap-3 rounded-xl border bg-primary/5 px-3 py-3',
                                    isActive('/admin/settings/profile') && 'border-primary/40 bg-primary/10',
                                )}
                            >
                                <Avatar className="h-12 w-12 shrink-0 overflow-hidden rounded-full border">
                                    <AvatarImage src={photoSrc || undefined} alt={user.name} />
                                    <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                                        {getInitials(user.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold">{user.name}</p>
                                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                                    <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-primary">
                                        <UserRound className="h-3.5 w-3.5" />
                                        View & edit my profile
                                    </p>
                                </div>
                                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                            </Link>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <Link
                                to="/admin/settings/profile"
                                onClick={() => setMoreOpen(false)}
                                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                            >
                                <Settings className="h-4 w-4 shrink-0" />
                                Profile
                            </Link>
                            <Link
                                to="/admin/settings/password"
                                onClick={() => setMoreOpen(false)}
                                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                            >
                                <KeyRound className="h-4 w-4 shrink-0" />
                                Password
                            </Link>
                        </div>

                        <div className="grid gap-1 border-t pt-2">
                            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Menu
                            </p>
                            {moreLinks.map((link) => {
                                const Icon = link.icon;
                                return (
                                    <Link
                                        key={link.href}
                                        to={link.href}
                                        onClick={() => setMoreOpen(false)}
                                        className={cn(
                                            'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm',
                                            isActive(link.href)
                                                ? 'bg-primary/10 text-primary'
                                                : 'hover:bg-muted',
                                        )}
                                    >
                                        {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                                        <span>{link.title}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
