import { Link, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import PlatformLogo from '@/components/platform-logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { platformNavItems } from '@/lib/platform-nav';

function isNavActive(pathname: string, href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
}

type PlatformSidebarProps = {
    onNavigate?: () => void;
    className?: string;
};

export default function PlatformSidebar({ onNavigate, className }: PlatformSidebarProps) {
    const { admin, logout } = usePlatformAuth();
    const location = useLocation();

    return (
        <aside
            className={cn(
                'sidebar-gradient flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border text-sidebar-foreground',
                className,
            )}
        >
            <div className="border-b border-sidebar-border p-4">
                <PlatformLogo />
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Platform">
                {platformNavItems.map((item) => {
                    const active = isNavActive(location.pathname, item.href);
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            to={item.href}
                            onClick={onNavigate}
                            className={cn(
                                'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                                active
                                    ? 'bg-gradient-to-r from-[#071b3a] to-[#0d4a8a] text-white shadow-[0_4px_14px_rgba(3,107,211,0.35)]'
                                    : 'hover:bg-white/50',
                            )}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.title}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t border-sidebar-border p-4">
                <div className="rounded-xl border border-white/60 bg-white/50 p-3 shadow-sm">
                    <p className="truncate text-sm font-medium text-[#001f3f]">{admin?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{admin?.email}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={logout}
                    >
                        <LogOut className="h-4 w-4" />
                        Sign out
                    </Button>
                </div>
            </div>
        </aside>
    );
}
