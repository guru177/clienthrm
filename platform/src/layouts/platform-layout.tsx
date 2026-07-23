import { useEffect, useState } from 'react';
import { Menu, Search, X } from 'lucide-react';
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
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        setDrawerOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!drawerOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setDrawerOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [drawerOpen]);

    if (loading) return <PlatformLoader />;
    if (!admin) return <Navigate to="/login" replace />;

    return (
        <div className="flex h-dvh max-h-dvh overflow-hidden bg-background">
            <div className="hidden md:flex">
                <PlatformSidebar />
            </div>

            {drawerOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/40"
                        aria-label="Close navigation"
                        onClick={() => setDrawerOpen(false)}
                    />
                    <div className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] shadow-2xl">
                        <PlatformSidebar
                            className="w-full"
                            onNavigate={() => setDrawerOpen(false)}
                        />
                        <button
                            type="button"
                            className="absolute right-2 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-white/60"
                            aria-label="Close menu"
                            onClick={() => setDrawerOpen(false)}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header className="header-gradient sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/60 px-4 shadow-sm backdrop-blur-md md:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/70 bg-white/60 text-[#001f3f] hover:bg-white md:hidden"
                            aria-label="Open navigation"
                            aria-expanded={drawerOpen}
                            onClick={() => setDrawerOpen(true)}
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#001f3f]">{meta.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            const evt = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
                            document.dispatchEvent(evt);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/70 bg-white/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <Search className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Search…</span>
                        <kbd className="hidden rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase sm:inline">
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
