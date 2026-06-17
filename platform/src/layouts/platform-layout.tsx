import { Search } from 'lucide-react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';
import PlatformSidebar from '@/components/platform-sidebar';
import { CommandPalette } from '@/components/command-palette';
import { platformNavMeta } from '@/lib/platform-nav';

function PlatformLoader() {
    return (
        <div className="flex h-dvh items-center justify-center bg-background">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
}

export default function PlatformLayout() {
    const { admin, loading } = usePlatformAuth();
    const location = useLocation();
    const meta = platformNavMeta(location.pathname);

    if (loading) return <PlatformLoader />;
    if (!admin) return <Navigate to="/login" replace />;

    return (
        <div className="flex h-dvh max-h-dvh overflow-hidden bg-background">
            <PlatformSidebar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header className="header-gradient sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/60 px-6 shadow-sm backdrop-blur-md">
                    <div>
                        <p className="text-sm font-semibold text-[#001f3f]">Platform Console</p>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            const evt = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
                            document.dispatchEvent(evt);
                        }}
                        className="hidden items-center gap-2 rounded-lg border border-white/70 bg-white/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
                    >
                        <Search className="h-3.5 w-3.5" />
                        Search…
                        <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase">
                            Ctrl K
                        </kbd>
                    </button>
                </header>
                <main className="min-h-0 w-full flex-1 overflow-y-auto bg-[#f4f8fc] p-4 md:p-5">
                    <Outlet />
                </main>
            </div>
            <CommandPalette />
        </div>
    );
}
