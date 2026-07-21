import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Bell,
    BellOff,
    Check,
    CheckCheck,
    Clock,
    Send,
    X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { OrgNotificationBanner } from '@/components/org-notification-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { apiGet, apiPost } from '@/lib/api';
import { formatRelativeTime } from '@/lib/datetime';
import { audienceSummary, severityConfig } from '@/lib/org-notifications-ui';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export interface OrgNotification {
    id: number;
    title: string;
    body: string;
    severity: string;
    audience: string;
    target_id: number | null;
    target_name: string | null;
    image_url: string | null;
    created_by: number | null;
    created_by_name: string | null;
    created_at: string | null;
    read_at: string | null;
    is_read: boolean;
}

export function OrgNotificationsButton() {
    const { user, hasPermission } = useAuth();
    const isMobile = useIsMobile();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<OrgNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const canSend = hasPermission('manage-settings');

    const loadCount = useCallback(() => {
        if (!user) {
            setUnreadCount(0);
            return;
        }
        apiGet<{ count: number }>('/admin/org-notifications/unread-count')
            .then((countRes) => {
                setUnreadCount(countRes.data?.count ?? 0);
            })
            .catch(() => setUnreadCount(0));
    }, [user]);

    const loadInbox = useCallback(() => {
        if (!user) {
            setItems([]);
            setUnreadCount(0);
            return;
        }
        setLoading(true);
        Promise.all([
            apiGet<OrgNotification[]>('/admin/org-notifications'),
            apiGet<{ count: number }>('/admin/org-notifications/unread-count'),
        ])
            .then(([inbox, countRes]) => {
                setItems(Array.isArray(inbox.data) ? inbox.data : []);
                setUnreadCount(countRes.data?.count ?? 0);
            })
            .catch(() => {
                setItems([]);
                setUnreadCount(0);
            })
            .finally(() => setLoading(false));
    }, [user]);

    useEffect(() => {
        loadCount();
        const interval = setInterval(loadCount, 60_000);
        window.addEventListener('focus', loadCount);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', loadCount);
        };
    }, [loadCount]);

    useEffect(() => {
        if (open) {
            loadInbox();
        }
    }, [open, loadInbox]);

    useEffect(() => {
        if (!open || !isMobile) return;
        const prev = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.documentElement.style.overflow = prev;
        };
    }, [open, isMobile]);

    useEffect(() => {
        if (!open || isMobile) return;
        function onDocClick(e: MouseEvent) {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpen(false);
        }
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [open, isMobile]);

    async function markRead(id: number) {
        try {
            await apiPost(`/admin/org-notifications/${id}/read`);
            loadInbox();
        } catch {
            /* ignore */
        }
    }

    async function markAllRead() {
        const unread = items.filter((n) => !n.is_read);
        await Promise.all(unread.map((n) => apiPost(`/admin/org-notifications/${n.id}/read`).catch(() => null)));
        loadInbox();
    }

    async function dismiss(id: number) {
        try {
            await apiPost(`/admin/org-notifications/${id}/dismiss`);
            setItems((prev) => prev.filter((n) => n.id !== id));
            setUnreadCount((c) => Math.max(0, c - (items.find((n) => n.id === id)?.is_read ? 0 : 1)));
        } catch {
            /* ignore */
        }
    }

    if (!user) return null;

    const panelContent = (
        <>
            {/* Header */}
            <div className="bg-gradient-to-r from-[#092244] to-[#071b3a] px-4 py-3.5 text-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                            <Bell className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold leading-none">Notifications</h2>
                            <p className="mt-1 text-[11px] text-blue-100/70">
                                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="rounded-md p-1.5 text-blue-100/80 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden border-b border-border bg-muted/30 px-3 py-2">
                {canSend ? (
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" asChild>
                        <Link to="/admin/notifications" onClick={() => setOpen(false)}>
                            <Send className="h-3.5 w-3.5" />
                            Send notification
                        </Link>
                    </Button>
                ) : (
                    <span className="px-1 text-xs text-muted-foreground">Company updates</span>
                )}
                {unreadCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                        onClick={markAllRead}
                    >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                    </Button>
                )}
            </div>

            {/* List */}
            <div
                className={cn(
                    'overflow-x-hidden overflow-y-auto',
                    isMobile ? 'min-h-0 flex-1' : 'max-h-[min(28rem,65vh)]',
                )}
            >
                {loading && items.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center px-6 py-12 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <BellOff className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="mt-3 text-sm font-medium">No notifications</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Updates from your admin will appear here
                        </p>
                    </div>
                ) : (
                    <ul className="min-w-0">
                        {items.map((n) => {
                            const cfg = severityConfig(n.severity);
                            const Icon = cfg.icon;
                            return (
                                <li
                                    key={n.id}
                                    className={cn(
                                        'min-w-0 overflow-hidden border-b border-border last:border-b-0',
                                        !n.is_read && 'bg-primary/[0.03]',
                                    )}
                                >
                                    {n.image_url?.trim() && (
                                        <div className="px-4 pt-3">
                                            <OrgNotificationBanner
                                                imageUrl={n.image_url}
                                                className="rounded-lg"
                                                imgClassName="max-h-32"
                                            />
                                        </div>
                                    )}
                                    <div className="flex gap-3 px-4 py-3.5">
                                        <div className="relative shrink-0">
                                            <div className={cn('flex h-9 w-9 items-center justify-center rounded-full', cfg.badge)}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            {!n.is_read && (
                                                <span className={cn('absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background', cfg.dot)} />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <Badge variant="outline" className={cn('h-5 text-[10px] uppercase', cfg.badge)}>
                                                            {cfg.label}
                                                        </Badge>
                                                        {!n.is_read && (
                                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                                                                New
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-1.5 break-words font-medium leading-snug text-foreground">{n.title}</p>
                                                </div>
                                                <div className="flex shrink-0 gap-0.5">
                                                    {!n.is_read && (
                                                        <button
                                                            type="button"
                                                            title="Mark as read"
                                                            onClick={() => markRead(n.id)}
                                                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                                        >
                                                            <Check className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        title="Dismiss"
                                                        onClick={() => dismiss(n.id)}
                                                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                                {n.body}
                                            </p>
                                            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 break-words text-[11px] text-muted-foreground">
                                                <span className="inline-flex shrink-0 items-center gap-1">
                                                    <Clock className="h-3 w-3 shrink-0" />
                                                    {formatRelativeTime(n.created_at)}
                                                </span>
                                                <span className="hidden shrink-0 sm:inline">·</span>
                                                <span className="min-w-0 truncate">{n.created_by_name ?? 'Admin'}</span>
                                                <span className="hidden shrink-0 sm:inline">·</span>
                                                <span className="min-w-0 truncate">{audienceSummary(n)}</span>
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </>
    );

    return (
        <div className="relative" ref={triggerRef}>
            <button
                type="button"
                onClick={() => {
                    setOpen((v) => !v);
                }}
                className={cn(
                    'relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors',
                    'hover:bg-secondary hover:text-foreground',
                    open && 'bg-secondary text-foreground',
                )}
                aria-label="Notifications"
                title="Notifications"
            >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] animate-pulse items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-background">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && !isMobile && (
                <div
                    ref={panelRef}
                    className="absolute right-0 top-full z-50 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
                >
                    {panelContent}
                </div>
            )}

            {open && isMobile && typeof document !== 'undefined' && createPortal(
                <>
                    <button
                        type="button"
                        className="fixed inset-0 z-[60] bg-black/40"
                        onClick={() => setOpen(false)}
                        aria-label="Close notifications"
                    />
                    <div
                        ref={panelRef}
                        className="fixed inset-x-3 top-[calc(3.75rem+env(safe-area-inset-top))] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[61] flex max-w-none flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
                    >
                        {panelContent}
                    </div>
                </>,
                document.body,
            )}
        </div>
    );
}
