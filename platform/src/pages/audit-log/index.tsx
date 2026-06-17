import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { platformGet } from '@/lib/platform-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface AuditEntry {
    id: number;
    actor_admin_id: number | null;
    actor_email: string | null;
    action: string;
    target_type: string | null;
    target_id: number | null;
    target_label: string | null;
    organization_id: number | null;
    organization_name: string | null;
    meta_json: string | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string | null;
}

interface AuditResponse {
    items: AuditEntry[];
    total: number;
    limit: number;
    offset: number;
}

const ACTION_GROUPS = ['organization', 'subscription_plan', 'platform_admin', 'platform_announcement', 'platform_release', 'tenant_feature_override', 'platform_org_note'];

function actionTone(action: string): string {
    if (action.endsWith('.delete')) return 'bg-red-100 text-red-700';
    if (action.endsWith('.create')) return 'bg-emerald-100 text-emerald-700';
    if (action.endsWith('.update')) return 'bg-blue-100 text-blue-700';
    if (action.includes('impersonate')) return 'bg-purple-100 text-purple-700';
    if (action.includes('login')) return 'bg-slate-100 text-slate-700';
    if (action.includes('2fa')) return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
}

function formatMeta(raw: string | null) {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return raw;
    }
}

export default function PlatformAuditLog() {
    const [data, setData] = useState<AuditResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [targetTypeFilter, setTargetTypeFilter] = useState('');
    const [offset, setOffset] = useState(0);
    const limit = 100;

    async function load() {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            params.set('limit', String(limit));
            params.set('offset', String(offset));
            if (search.trim()) params.set('q', search.trim());
            if (actionFilter) params.set('action', actionFilter);
            if (targetTypeFilter) params.set('target_type', targetTypeFilter);
            const res = await platformGet<AuditResponse>(`/audit-log?${params.toString()}`);
            setData(res.data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load audit log');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, [offset, actionFilter, targetTypeFilter]);

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        setOffset(0);
        load();
    }

    const total = data?.total ?? 0;
    const start = data ? (data.items.length === 0 ? 0 : offset + 1) : 0;
    const end = data ? offset + data.items.length : 0;

    const distinctActions = useMemo(() => {
        const set = new Set<string>();
        data?.items.forEach((it) => set.add(it.action));
        return Array.from(set).sort();
    }, [data]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Audit log</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Every platform admin action is recorded here. Filter by action, target, or search by email/label.
                </p>
            </div>

            <form
                onSubmit={handleSearch}
                className="grid gap-3 rounded-2xl border border-white/80 bg-white/80 p-4 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md md:grid-cols-[1fr_180px_180px_auto]"
            >
                <div className="space-y-1.5">
                    <Label className="text-xs">Search</Label>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="email, target, or action"
                            className="pl-9"
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Target type</Label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={targetTypeFilter}
                        onChange={(e) => {
                            setOffset(0);
                            setTargetTypeFilter(e.target.value);
                        }}
                    >
                        <option value="">All</option>
                        {ACTION_GROUPS.map((g) => (
                            <option key={g} value={g}>
                                {g}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Action</Label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={actionFilter}
                        onChange={(e) => {
                            setOffset(0);
                            setActionFilter(e.target.value);
                        }}
                    >
                        <option value="">All</option>
                        {distinctActions.map((a) => (
                            <option key={a} value={a}>
                                {a}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-end">
                    <Button type="submit" className="h-10 w-full md:w-auto">
                        Apply
                    </Button>
                </div>
            </form>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm">
                    <span className="text-muted-foreground">
                        {loading ? 'Loading…' : `Showing ${start}–${end} of ${total}`}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={offset === 0 || loading}
                            onClick={() => setOffset(Math.max(0, offset - limit))}
                        >
                            Previous
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={loading || end >= total}
                            onClick={() => setOffset(offset + limit)}
                        >
                            Next
                        </Button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                            <tr>
                                <th className="px-4 py-2.5 font-medium">When</th>
                                <th className="px-4 py-2.5 font-medium">Actor</th>
                                <th className="px-4 py-2.5 font-medium">Action</th>
                                <th className="px-4 py-2.5 font-medium">Target</th>
                                <th className="px-4 py-2.5 font-medium">Org</th>
                                <th className="px-4 py-2.5 font-medium">IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.items.map((item) => (
                                <tr key={item.id} className="border-b border-border/60 last:border-0 align-top">
                                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                                        {item.created_at}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-sm font-medium text-[#001f3f]">
                                            {item.actor_email || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span
                                            className={cn(
                                                'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                                                actionTone(item.action),
                                            )}
                                        >
                                            {item.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="text-sm font-medium text-[#001f3f]">
                                            {item.target_label || (item.target_id ? `#${item.target_id}` : '—')}
                                        </div>
                                        {item.target_type && (
                                            <div className="text-xs text-muted-foreground">{item.target_type}</div>
                                        )}
                                        {item.meta_json && (
                                            <details className="mt-1">
                                                <summary className="cursor-pointer text-xs text-blue-600 hover:underline">
                                                    Meta
                                                </summary>
                                                <pre className="mt-1 max-w-md whitespace-pre-wrap break-all rounded-md bg-secondary/60 p-2 text-[11px] text-muted-foreground">
                                                    {formatMeta(item.meta_json)}
                                                </pre>
                                            </details>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm text-muted-foreground">
                                        {item.organization_name || (item.organization_id ? `#${item.organization_id}` : '—')}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                        {item.ip_address || '—'}
                                    </td>
                                </tr>
                            ))}
                            {!loading && data && data.items.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                        No audit entries match these filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
