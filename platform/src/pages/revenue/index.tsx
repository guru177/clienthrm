import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Clock, TrendingUp, FileText } from 'lucide-react';
import { platformGet, platformPost } from '@/lib/platform-api';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';

interface RevenueSummary {
    mrr_estimate: number;
    paid_total: number;
    pending_count: number;
    pending_total: number;
    invoices_30d: number;
}

interface InvoiceRow {
    id: number;
    organization_id: number;
    organization_name: string;
    plan_slug: string;
    amount: number;
    currency: string;
    status: string;
    period_start: string | null;
    period_end: string | null;
    note: string | null;
    paid_at: string | null;
    created_at: string | null;
}

function formatMoney(n: number): string {
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function PlatformRevenue() {
    const { hasRole } = usePlatformAuth();
    const canMarkPaid = hasRole('admin');
    const [summary, setSummary] = useState<RevenueSummary | null>(null);
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [total, setTotal] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<number | null>(null);

    function load() {
        setLoading(true);
        const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
        Promise.all([
            platformGet<RevenueSummary>('/revenue/summary'),
            platformGet<{ items: InvoiceRow[]; total: number }>(`/invoices${qs}`),
        ])
            .then(([s, inv]) => {
                setSummary(s.data);
                setInvoices(inv.data.items);
                setTotal(inv.data.total);
            })
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Failed to load revenue'),
            )
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        load();
    }, [statusFilter]);

    async function markPaid(id: number) {
        if (!confirm('Mark this invoice as paid?')) return;
        setBusy(id);
        try {
            await platformPost(`/invoices/${id}/mark-paid`, {});
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Revenue</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    MRR estimate, invoice history, and pending collections.
                </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {loading && <p className="text-muted-foreground">Loading…</p>}

            {summary && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        title="MRR (est.)"
                        value={formatMoney(summary.mrr_estimate)}
                        icon={TrendingUp}
                    />
                    <StatCard
                        title="Collected"
                        value={formatMoney(summary.paid_total)}
                        icon={DollarSign}
                    />
                    <StatCard
                        title="Pending"
                        value={`${summary.pending_count} · ${formatMoney(summary.pending_total)}`}
                        icon={Clock}
                    />
                    <StatCard
                        title="Invoices (30d)"
                        value={summary.invoices_30d}
                        icon={FileText}
                    />
                </div>
            )}

            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filter:</span>
                {['', 'pending', 'paid'].map((s) => (
                    <Button
                        key={s || 'all'}
                        size="sm"
                        variant={statusFilter === s ? 'default' : 'outline'}
                        onClick={() => setStatusFilter(s)}
                    >
                        {s || 'All'}
                    </Button>
                ))}
                <span className="ml-auto text-xs text-muted-foreground">{total} invoices</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-secondary/50">
                        <tr className="text-left text-xs uppercase text-muted-foreground">
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Organization</th>
                            <th className="px-3 py-2">Plan</th>
                            <th className="px-3 py-2">Amount</th>
                            <th className="px-3 py-2">Period</th>
                            <th className="px-3 py-2">Status</th>
                            {canMarkPaid && <th className="px-3 py-2 text-right">Action</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.map((inv) => (
                            <tr key={inv.id} className="border-t border-border/60">
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                    {inv.created_at?.slice(0, 10) ?? '—'}
                                </td>
                                <td className="px-3 py-2">
                                    <Link
                                        to={`/tenants/${inv.organization_id}`}
                                        className="font-medium text-[#001f3f] hover:underline"
                                    >
                                        {inv.organization_name}
                                    </Link>
                                </td>
                                <td className="px-3 py-2 capitalize">{inv.plan_slug}</td>
                                <td className="px-3 py-2 font-mono">
                                    {formatMoney(inv.amount)}
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                    {inv.period_start?.slice(0, 10) ?? '—'} →{' '}
                                    {inv.period_end?.slice(0, 10) ?? '—'}
                                </td>
                                <td className="px-3 py-2">
                                    <span
                                        className={
                                            inv.status === 'paid'
                                                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700'
                                                : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700'
                                        }
                                    >
                                        {inv.status}
                                    </span>
                                </td>
                                {canMarkPaid && (
                                    <td className="px-3 py-2 text-right">
                                        {inv.status === 'pending' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={busy === inv.id}
                                                onClick={() => markPaid(inv.id)}
                                            >
                                                Mark paid
                                            </Button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                        {invoices.length === 0 && (
                            <tr>
                                <td
                                    colSpan={canMarkPaid ? 7 : 6}
                                    className="px-3 py-8 text-center text-muted-foreground"
                                >
                                    No invoices yet. Renew a subscription from a tenant detail page
                                    to auto-create one.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
