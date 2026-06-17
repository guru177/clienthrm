import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BookOpen,
    Inbox,
    LifeBuoy,
    MessageSquare,
    Plus,
    RefreshCw,
    Search,
} from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import { apiGet, apiPost } from '@/lib/api';
import { formatDateTimeLocal, formatRelativeTime } from '@/lib/datetime';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface TicketReply {
    from: string;
    email?: string;
    body: string;
    at?: string;
}

interface SupportTicket {
    id: number;
    subject: string;
    body: string;
    status: string;
    priority: string;
    replies_json: string | null;
    created_at: string | null;
    updated_at: string | null;
}

interface KbArticle {
    slug: string;
    title: string;
    body: string;
}

interface ThreadMessage {
    id: string;
    kind: 'customer' | 'support';
    author: string;
    email?: string;
    body: string;
    at: string | null;
}

const breadcrumbs = [{ label: 'Support' }];

const STATUS_TABS = [
    { key: 'all', label: 'All cases' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' },
] as const;

const STATUS_STYLE: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800 ring-blue-200 dark:bg-blue-950 dark:text-blue-200',
    in_progress: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-200',
    resolved: 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300',
};

const PRIORITY_STYLE: Record<string, string> = {
    urgent: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
    normal: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    low: 'bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400',
};

const STATUS_HINT: Record<string, string> = {
    open: 'Your case is in the queue. Our team will respond shortly.',
    in_progress: 'A support agent is actively working on your case.',
    resolved: 'This case was marked resolved. Open a new case if you need more help.',
    closed: 'This case is closed and archived.',
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

function buildThread(ticket: SupportTicket): ThreadMessage[] {
    const thread: ThreadMessage[] = [
        {
            id: 'initial',
            kind: 'customer',
            author: 'You',
            body: ticket.body,
            at: ticket.created_at,
        },
    ];
    parseReplies(ticket.replies_json).forEach((reply, idx) => {
        thread.push({
            id: `reply-${idx}`,
            kind: reply.from === 'platform' ? 'support' : 'customer',
            author: reply.from === 'platform' ? 'Raintech Support' : 'You',
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

type SelectedView = number | 'new' | null;

export default function SupportPage() {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [kbArticles, setKbArticles] = useState<KbArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<SelectedView>(null);
    const [kbPreview, setKbPreview] = useState<KbArticle | null>(null);

    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [priority, setPriority] = useState('normal');

    const counts = useMemo(() => {
        const c = { all: tickets.length, open: 0, in_progress: 0, resolved: 0, closed: 0 };
        for (const t of tickets) {
            if (t.status in c) {
                c[t.status as keyof Omit<typeof c, 'all'>] += 1;
            }
        }
        return c;
    }, [tickets]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return tickets.filter((t) => {
            if (statusFilter !== 'all' && t.status !== statusFilter) return false;
            if (!q) return true;
            return (
                t.subject.toLowerCase().includes(q) ||
                t.body.toLowerCase().includes(q) ||
                String(t.id).includes(q)
            );
        });
    }, [tickets, statusFilter, search]);

    const selectedTicket = useMemo(
        () => (typeof selected === 'number' ? tickets.find((t) => t.id === selected) ?? null : null),
        [tickets, selected],
    );

    const thread = useMemo(
        () => (selectedTicket ? buildThread(selectedTicket) : []),
        [selectedTicket],
    );

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        Promise.all([
            apiGet<SupportTicket[]>('/admin/support/tickets'),
            apiGet<KbArticle[]>('/admin/kb'),
        ])
            .then(([ticketRes, kbRes]) => {
                setTickets(Array.isArray(ticketRes.data) ? ticketRes.data : []);
                setKbArticles(Array.isArray(kbRes.data) ? kbRes.data.slice(0, 5) : []);
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Failed to load support data');
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (selected === 'new') return;
        if (filtered.length === 0) {
            setSelected(null);
            return;
        }
        if (selected == null || (typeof selected === 'number' && !filtered.some((t) => t.id === selected))) {
            setSelected(filtered[0].id);
        }
    }, [filtered, selected]);

    async function createTicket() {
        if (!subject.trim()) {
            showToast({ type: 'warning', message: 'Subject is required.' });
            return;
        }
        if (!body.trim()) {
            showToast({ type: 'warning', message: 'Describe your issue in the message field.' });
            return;
        }
        setSubmitting(true);
        try {
            const res = await apiPost<{ id: number }>('/admin/support/tickets', {
                subject: subject.trim(),
                body: body.trim(),
                priority,
            });
            showToast({ type: 'success', message: 'Case submitted. We will respond soon.' });
            setSubject('');
            setBody('');
            setPriority('normal');
            await load();
            if (res.data?.id) {
                setSelected(res.data.id);
                setStatusFilter('all');
            } else {
                setSelected(null);
            }
        } catch (err) {
            showToast({
                type: 'error',
                message: err instanceof Error ? err.message : 'Failed to submit case',
            });
        } finally {
            setSubmitting(false);
        }
    }

    function handleSearchSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSearch(searchInput);
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            {/* Full-bleed layout — counteract AppSidebarLayout padding */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Header */}
                <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-gradient-to-r from-[#e8f2fd]/90 to-[#d0e4f8]/90 px-3 py-2 dark:from-[#0d1e33]/90 dark:to-[#0a1828]/90 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#071b3a]/15 bg-white/70 dark:border-white/10 dark:bg-white/10">
                            <LifeBuoy className="h-5 w-5 text-[#071b3a] dark:text-blue-300" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-[#001f3f] dark:text-white">Support Center</h1>
                            <p className="text-xs text-muted-foreground">
                                Track cases and get help from the Raintech platform team
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button size="sm" onClick={() => setSelected('new')}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            New case
                        </Button>
                    </div>
                </div>

                {error && (
                    <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Quick help strip */}
                {kbArticles.length > 0 && (
                    <div className="shrink-0 border-b border-border bg-white/80 px-3 py-2 dark:bg-slate-900/80 sm:px-4">
                        <div className="flex items-center gap-2 overflow-x-auto text-xs">
                            <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="shrink-0 font-medium text-muted-foreground">Quick help:</span>
                            {kbArticles.map((a) => (
                                <button
                                    key={a.slug}
                                    type="button"
                                    onClick={() => setKbPreview(a)}
                                    className="shrink-0 rounded-full border border-border px-2.5 py-1 hover:bg-muted/60"
                                >
                                    {a.title}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {kbPreview && (
                    <div className="shrink-0 border-b border-border bg-blue-50/80 px-3 py-3 dark:bg-blue-950/30 sm:px-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Help article
                                </p>
                                <p className="font-semibold text-[#001f3f] dark:text-white">{kbPreview.title}</p>
                                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground line-clamp-3">
                                    {kbPreview.body}
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setKbPreview(null)}>
                                Dismiss
                            </Button>
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div className="shrink-0 space-y-1.5 border-b border-border bg-white px-2 py-1.5 dark:bg-slate-900 sm:px-3">
                    <div className="flex flex-wrap gap-1">
                        {STATUS_TABS.map((tab) => {
                            const count = counts[tab.key as keyof typeof counts] ?? 0;
                            const active = statusFilter === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setStatusFilter(tab.key)}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                                        active
                                            ? 'bg-[#071b3a] text-white'
                                            : 'text-muted-foreground hover:bg-muted/80'
                                    }`}
                                >
                                    {tab.label}
                                    <span
                                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                            active ? 'bg-white/20' : 'bg-muted'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <form onSubmit={handleSearchSubmit} className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search your cases by subject or case ID…"
                            className="h-9 pl-9"
                        />
                    </form>
                </div>

                {/* Split pane */}
                <div className="flex min-h-0 flex-1 overflow-hidden bg-white dark:bg-slate-900">
                    {/* Case list */}
                    <div className="flex w-full max-w-sm shrink-0 flex-col border-r border-border bg-slate-50/60 dark:bg-slate-950/40">
                        <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {loading ? 'Loading…' : `${filtered.length} case${filtered.length === 1 ? '' : 's'}`}
                        </div>
                        <ul className="flex-1 overflow-y-auto">
                            {filtered.map((t) => {
                                const active = selected === t.id;
                                const replyCount = parseReplies(t.replies_json).length;
                                return (
                                    <li key={t.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelected(t.id)}
                                            className={`w-full border-b border-border/60 px-3 py-3 text-left transition-colors ${
                                                active
                                                    ? 'border-l-4 border-l-[#071b3a] bg-white dark:bg-slate-900'
                                                    : 'border-l-4 border-l-transparent hover:bg-white/80 dark:hover:bg-slate-900/60'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="line-clamp-1 font-semibold text-[#001f3f] dark:text-white">
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
                                            <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                                                <span className="font-mono font-medium text-[#071b3a] dark:text-blue-300">
                                                    #{t.id}
                                                </span>
                                                <span
                                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[t.status] ?? ''}`}
                                                >
                                                    {t.status.replace('_', ' ')}
                                                </span>
                                                <span>{formatRelativeTime(t.updated_at ?? t.created_at)}</span>
                                                {replyCount > 0 && (
                                                    <span className="inline-flex items-center gap-0.5">
                                                        <MessageSquare className="h-3 w-3" />
                                                        {replyCount}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                            {!loading && filtered.length === 0 && (
                                <li className="flex flex-col items-center px-4 py-12 text-center">
                                    <Inbox className="mb-2 h-9 w-9 text-muted-foreground/40" />
                                    <p className="text-sm font-medium text-muted-foreground">No cases found</p>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="mt-3"
                                        onClick={() => setSelected('new')}
                                    >
                                        Create your first case
                                    </Button>
                                </li>
                            )}
                        </ul>
                    </div>

                    {/* Detail / new case */}
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        {selected === 'new' ? (
                            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                                <h2 className="text-lg font-bold text-[#001f3f] dark:text-white">Create a new case</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Tell us what you need — billing, access, bugs, or general questions.
                                </p>
                                <div className="mt-5 max-w-2xl space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="case-subject">Subject</Label>
                                        <Input
                                            id="case-subject"
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            placeholder="e.g. Unable to export payroll report"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="case-priority">Priority</Label>
                                        <Select value={priority} onValueChange={setPriority}>
                                            <SelectTrigger id="case-priority">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="low">Low — general question</SelectItem>
                                                <SelectItem value="normal">Normal — needs attention</SelectItem>
                                                <SelectItem value="high">High — blocking work</SelectItem>
                                                <SelectItem value="urgent">Urgent — production down</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="case-body">Describe your issue</Label>
                                        <Textarea
                                            id="case-body"
                                            value={body}
                                            onChange={(e) => setBody(e.target.value)}
                                            rows={6}
                                            placeholder="Include steps to reproduce, error messages, or what outcome you need…"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={createTicket} disabled={submitting}>
                                            {submitting ? 'Submitting…' : 'Submit case'}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => setSelected(filtered[0]?.id ?? null)}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : !selectedTicket ? (
                            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                                <MessageSquare className="mb-3 h-12 w-12 opacity-30" />
                                <p>Select a case or create a new one</p>
                            </div>
                        ) : (
                            <>
                                {/* Case header — compact for viewport fit */}
                                <div className="shrink-0 border-b border-border bg-gradient-to-r from-slate-50 to-white px-3 py-2 dark:from-slate-900 dark:to-slate-900 sm:px-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                                            Case #{selectedTicket.id}
                                        </span>
                                        <span
                                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLE[selectedTicket.status] ?? ''}`}
                                        >
                                            {selectedTicket.status.replace('_', ' ')}
                                        </span>
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${PRIORITY_STYLE[selectedTicket.priority] ?? ''}`}
                                        >
                                            {selectedTicket.priority}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            · Opened {formatRelativeTime(selectedTicket.created_at)} · Updated{' '}
                                            {formatRelativeTime(selectedTicket.updated_at)}
                                        </span>
                                    </div>
                                    <h2 className="mt-1 line-clamp-1 text-base font-bold text-[#001f3f] dark:text-white">
                                        {selectedTicket.subject}
                                    </h2>
                                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                        {STATUS_HINT[selectedTicket.status] ?? 'Case update available.'}
                                    </p>
                                </div>

                                {/* Conversation */}
                                <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 px-2 py-2 pb-4 dark:bg-slate-950/20">
                                    <div className="space-y-3 pb-2">
                                        {thread.map((msg) => (
                                            <div
                                                key={msg.id}
                                                className={`flex w-full ${msg.kind === 'support' ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[92%] rounded-2xl border px-4 py-3 shadow-sm ${
                                                        msg.kind === 'support'
                                                            ? 'border-[#071b3a]/15 bg-[#071b3a] text-white dark:border-blue-900'
                                                            : 'border-border bg-white dark:bg-slate-900'
                                                    }`}
                                                >
                                                    <p
                                                        className={`text-xs font-semibold ${msg.kind === 'support' ? 'text-blue-100' : 'text-[#001f3f] dark:text-white'}`}
                                                    >
                                                        {msg.author}
                                                        {msg.email ? ` · ${msg.email}` : ''}
                                                    </p>
                                                    <p
                                                        className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed ${msg.kind === 'support' ? 'text-white' : ''}`}
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

                                {/* Footer hint */}
                                <div className="shrink-0 border-t border-border bg-muted/30 px-3 py-3 pb-4 text-xs text-muted-foreground sm:px-4">
                                    {selectedTicket.status === 'open' || selectedTicket.status === 'in_progress' ? (
                                        <>
                                            Waiting for a response from Raintech Support. You will see replies
                                            here when an agent responds.
                                        </>
                                    ) : (
                                        <>
                                            This case is {selectedTicket.status.replace('_', ' ')}. Need more
                                            help?{' '}
                                            <button
                                                type="button"
                                                className="font-medium text-[#071b3a] underline dark:text-blue-300"
                                                onClick={() => setSelected('new')}
                                            >
                                                Open a new case
                                            </button>
                                            .
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
