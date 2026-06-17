import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Building2,
    CheckCircle2,
    Clock,
    ExternalLink,
    Inbox,
    Mail,
    MessageSquare,
    RefreshCw,
    RotateCcw,
    Search,
    Send,
    User,
    XCircle,
} from 'lucide-react';
import { platformGet, platformPatch } from '@/lib/platform-api';
import { formatDateTimeLocal, formatRelativeTime } from '@/lib/datetime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';

interface Ticket {
    id: number;
    organization_id: number;
    organization_name: string;
    user_name: string | null;
    user_email: string | null;
    subject: string;
    body: string;
    status: string;
    priority: string;
    replies_json: string | null;
    created_at: string | null;
    updated_at: string | null;
}

interface TicketReply {
    from: string;
    email?: string;
    body: string;
    at?: string;
}

interface StatusCounts {
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    total: number;
}

interface ThreadMessage {
    id: string;
    kind: 'customer' | 'support';
    author: string;
    email?: string;
    body: string;
    at: string | null;
}

const STATUS_TABS = [
    { key: 'open', label: 'Needs attention' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' },
] as const;

const PRIORITY_OPTIONS = ['all', 'urgent', 'high', 'normal', 'low'] as const;

const STATUS_STYLE: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800 ring-blue-200',
    in_progress: 'bg-amber-100 text-amber-800 ring-amber-200',
    resolved: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const PRIORITY_STYLE: Record<string, string> = {
    urgent: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    normal: 'bg-slate-100 text-slate-700',
    low: 'bg-slate-50 text-slate-500',
};

function parseReplies(raw: string | null): TicketReply[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function buildThread(ticket: Ticket): ThreadMessage[] {
    const thread: ThreadMessage[] = [
        {
            id: 'initial',
            kind: 'customer',
            author: ticket.user_name || 'Tenant admin',
            email: ticket.user_email ?? undefined,
            body: ticket.body,
            at: ticket.created_at,
        },
    ];
    parseReplies(ticket.replies_json).forEach((reply, idx) => {
        thread.push({
            id: `reply-${idx}`,
            kind: reply.from === 'platform' ? 'support' : 'customer',
            author: reply.from === 'platform' ? 'Platform support' : ticket.user_name || 'Tenant',
            email: reply.email,
            body: reply.body,
            at: reply.at ?? null,
        });
    });
    return thread;
}

function snippet(text: string, max = 72): string {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

export default function PlatformSupportInbox() {
    const { hasRole, admin } = usePlatformAuth();
    const canReply = hasRole('support');

    const [items, setItems] = useState<Ticket[]>([]);
    const [counts, setCounts] = useState<StatusCounts | null>(null);
    const [status, setStatus] = useState<string>('open');
    const [priority, setPriority] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [reply, setReply] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const selected = useMemo(
        () => items.find((t) => t.id === selectedId) ?? null,
        [items, selectedId],
    );

    const thread = useMemo(() => (selected ? buildThread(selected) : []), [selected]);

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (priority !== 'all') params.set('priority', priority);
        if (search.trim()) params.set('q', search.trim());
        const qs = params.toString();

        Promise.all([
            platformGet<Ticket[]>(`/support/tickets${qs ? `?${qs}` : ''}`),
            platformGet<StatusCounts>('/support/tickets/stats'),
        ])
            .then(([listRes, statsRes]) => {
                setItems(listRes.data);
                setCounts(statsRes.data);
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Failed to load tickets');
            })
            .finally(() => setLoading(false));
    }, [status, priority, search]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (items.length === 0) {
            setSelectedId(null);
            return;
        }
        if (selectedId == null || !items.some((t) => t.id === selectedId)) {
            setSelectedId(items[0].id);
        }
    }, [items, selectedId]);

    async function patchTicket(
        patch: { reply?: string; status?: string; priority?: string },
        opts?: { clearReply?: boolean },
    ) {
        if (!selected) return;
        if (patch.reply !== undefined && !patch.reply.trim()) {
            setError('Enter a message before sending.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await platformPatch(`/support/tickets/${selected.id}`, patch);
            if (opts?.clearReply !== false) setReply('');
            const params = new URLSearchParams();
            if (status) params.set('status', status);
            if (priority !== 'all') params.set('priority', priority);
            if (search.trim()) params.set('q', search.trim());
            const qs = params.toString();
            const [listRes, statsRes] = await Promise.all([
                platformGet<Ticket[]>(`/support/tickets${qs ? `?${qs}` : ''}`),
                platformGet<StatusCounts>('/support/tickets/stats'),
            ]);
            setItems(listRes.data);
            setCounts(statsRes.data);
            setSelectedId(selected.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Action failed');
        } finally {
            setBusy(false);
        }
    }

    function handleSearchSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSearch(searchInput);
    }

    return (
        <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-4">
            {/* Header */}
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <Inbox className="h-6 w-6 text-[#071b3a]" />
                        <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">
                            Support cases
                        </h1>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage tenant support requests — reply, resolve, and track case history.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    {counts && (
                        <span className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-muted-foreground">
                            {counts.total} total cases
                        </span>
                    )}
                </div>
            </div>

            {error && (
                <div className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Toolbar */}
            <div className="shrink-0 space-y-3 rounded-xl border border-border bg-white p-3 shadow-sm">
                <div className="flex flex-wrap gap-1">
                    {STATUS_TABS.map((tab) => {
                        const count = counts?.[tab.key as keyof StatusCounts] ?? 0;
                        const active = status === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setStatus(tab.key)}
                                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                    active
                                        ? 'bg-[#071b3a] text-white shadow-sm'
                                        : 'text-muted-foreground hover:bg-secondary/80'
                                }`}
                            >
                                {tab.label}
                                <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                        active ? 'bg-white/20 text-white' : 'bg-secondary text-muted-foreground'
                                    }`}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                    <form onSubmit={handleSearchSubmit} className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search by case subject, tenant, or email…"
                            className="pl-9"
                        />
                    </form>
                    <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        className="h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#071b3a]/20"
                    >
                        {PRIORITY_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                                {p === 'all' ? 'All priorities' : p.charAt(0).toUpperCase() + p.slice(1)}
                            </option>
                        ))}
                    </select>
                    {(search || searchInput) && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setSearch('');
                                setSearchInput('');
                            }}
                        >
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            {/* Split pane */}
            <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                {/* Case list */}
                <div className="flex w-full max-w-md shrink-0 flex-col border-r border-border bg-slate-50/50">
                    <div className="border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {loading ? 'Loading…' : `${items.length} case${items.length === 1 ? '' : 's'}`}
                    </div>
                    <ul className="flex-1 overflow-y-auto">
                        {items.map((t) => {
                            const active = selectedId === t.id;
                            const replyCount = parseReplies(t.replies_json).length;
                            return (
                                <li key={t.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(t.id)}
                                        className={`w-full border-b border-border/60 px-4 py-3 text-left transition-colors ${
                                            active
                                                ? 'border-l-4 border-l-[#071b3a] bg-white shadow-sm'
                                                : 'border-l-4 border-l-transparent hover:bg-white/80'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="line-clamp-1 font-semibold text-[#001f3f]">
                                                {t.subject}
                                            </p>
                                            <span
                                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.normal}`}
                                            >
                                                {t.priority}
                                            </span>
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                            {snippet(t.body)}
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                            <span className="font-mono font-medium text-[#071b3a]">
                                                #{t.id}
                                            </span>
                                            <span>{t.organization_name}</span>
                                            <span>·</span>
                                            <span>{formatRelativeTime(t.updated_at ?? t.created_at)}</span>
                                            {replyCount > 0 && (
                                                <>
                                                    <span>·</span>
                                                    <span className="inline-flex items-center gap-0.5">
                                                        <MessageSquare className="h-3 w-3" />
                                                        {replyCount}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                        {!loading && items.length === 0 && (
                            <li className="flex flex-col items-center justify-center px-6 py-16 text-center">
                                <Inbox className="mb-3 h-10 w-10 text-muted-foreground/40" />
                                <p className="font-medium text-muted-foreground">No cases in this view</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Try another status tab or clear your search filters.
                                </p>
                            </li>
                        )}
                    </ul>
                </div>

                {/* Case detail */}
                <div className="flex min-w-0 flex-1 flex-col">
                    {!selected ? (
                        <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                            <MessageSquare className="mb-3 h-12 w-12 opacity-30" />
                            <p>Select a case to view the conversation</p>
                        </div>
                    ) : (
                        <>
                            {/* Case header */}
                            <div className="shrink-0 border-b border-border bg-gradient-to-r from-slate-50 to-white px-3 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs font-semibold text-muted-foreground">
                                                Case #{selected.id}
                                            </span>
                                            <span
                                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLE[selected.status] ?? STATUS_STYLE.open}`}
                                            >
                                                {selected.status.replace('_', ' ')}
                                            </span>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${PRIORITY_STYLE[selected.priority] ?? PRIORITY_STYLE.normal}`}
                                            >
                                                {selected.priority} priority
                                            </span>
                                        </div>
                                        <h2 className="mt-1 text-lg font-bold text-[#001f3f]">
                                            {selected.subject}
                                        </h2>
                                    </div>
                                    {canReply && (
                                        <div className="flex flex-wrap gap-2">
                                            {selected.status !== 'open' && selected.status !== 'in_progress' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() => patchTicket({ status: 'open' }, { clearReply: false })}
                                                >
                                                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                                    Reopen
                                                </Button>
                                            )}
                                            {selected.status !== 'closed' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() => patchTicket({ status: 'closed' }, { clearReply: false })}
                                                >
                                                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                                    Close
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-white px-3 py-2">
                                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                Tenant
                                            </p>
                                            <Link
                                                to={`/tenants/${selected.organization_id}`}
                                                className="inline-flex items-center gap-1 text-sm font-medium text-[#071b3a] hover:underline"
                                            >
                                                {selected.organization_name}
                                                <ExternalLink className="h-3 w-3" />
                                            </Link>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-white px-3 py-2">
                                        <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                Requester
                                            </p>
                                            <p className="truncate text-sm font-medium">
                                                {selected.user_name || 'Tenant admin'}
                                            </p>
                                            {selected.user_email && (
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {selected.user_email}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-white px-3 py-2">
                                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                        <div>
                                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                Timeline
                                            </p>
                                            <p className="text-xs">
                                                Opened {formatDateTimeLocal(selected.created_at)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Updated {formatRelativeTime(selected.updated_at)} ({formatDateTimeLocal(selected.updated_at)})
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Conversation */}
                            <div className="flex-1 overflow-y-auto bg-slate-50/30 px-2 py-3">
                                <div className="space-y-3">
                                    {thread.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={`flex w-full ${msg.kind === 'support' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[92%] rounded-2xl border px-4 py-3 shadow-sm ${
                                                    msg.kind === 'support'
                                                        ? 'border-[#071b3a]/15 bg-[#071b3a] text-white'
                                                        : 'border-border bg-white'
                                                }`}
                                            >
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p
                                                        className={`text-xs font-semibold ${msg.kind === 'support' ? 'text-blue-100' : 'text-[#001f3f]'}`}
                                                    >
                                                        {msg.author}
                                                    </p>
                                                    {msg.email && (
                                                        <span
                                                            className={`inline-flex items-center gap-1 text-[10px] ${msg.kind === 'support' ? 'text-blue-200/80' : 'text-muted-foreground'}`}
                                                        >
                                                            <Mail className="h-3 w-3" />
                                                            {msg.email}
                                                        </span>
                                                    )}
                                                </div>
                                                <p
                                                    className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed ${msg.kind === 'support' ? 'text-white' : 'text-foreground'}`}
                                                >
                                                    {msg.body}
                                                </p>
                                                <p
                                                    className={`mt-2 text-[10px] ${msg.kind === 'support' ? 'text-blue-200/70' : 'text-muted-foreground'}`}
                                                >
                                                    {formatDateTimeLocal(msg.at)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Composer */}
                            {canReply ? (
                                <div className="shrink-0 border-t border-border bg-white px-2 py-3">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-[#001f3f]">
                                                Reply to customer
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Responding as {admin?.email ?? 'platform support'}
                                            </p>
                                        </div>
                                        <textarea
                                            value={reply}
                                            onChange={(e) => setReply(e.target.value)}
                                            rows={4}
                                            disabled={busy}
                                            className="w-full resize-none rounded-xl border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#071b3a]/20 disabled:opacity-60"
                                            placeholder="Type your response. The tenant will see this in their Support page…"
                                        />
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                disabled={busy || !reply.trim()}
                                                onClick={() => patchTicket({ reply: reply.trim() })}
                                            >
                                                <Send className="mr-1.5 h-4 w-4" />
                                                {busy ? 'Sending…' : 'Send reply'}
                                            </Button>
                                            {selected.status !== 'resolved' && (
                                                <Button
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        patchTicket({
                                                            reply: reply.trim() || undefined,
                                                            status: 'resolved',
                                                        })
                                                    }
                                                >
                                                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                                                    Resolve case
                                                </Button>
                                            )}
                                            {selected.status === 'open' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        patchTicket({ status: 'in_progress' }, { clearReply: false })
                                                    }
                                                >
                                                    Mark in progress
                                                </Button>
                                            )}
                                            <select
                                                value={selected.priority}
                                                disabled={busy}
                                                onChange={(e) =>
                                                    patchTicket(
                                                        { priority: e.target.value },
                                                        { clearReply: false },
                                                    )
                                                }
                                                className="ml-auto h-9 rounded-lg border border-border bg-white px-2 text-xs outline-none"
                                            >
                                                {PRIORITY_OPTIONS.filter((p) => p !== 'all').map((p) => (
                                                    <option key={p} value={p}>
                                                        {p.charAt(0).toUpperCase() + p.slice(1)} priority
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="shrink-0 border-t border-border bg-amber-50 px-5 py-3 text-sm text-amber-800">
                                    You have read-only access. Contact an owner to get the support role for replying.
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
