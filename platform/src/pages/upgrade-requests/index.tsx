import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { platformGet, platformPost } from '@/lib/platform-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';

interface UpgradeRequest {
    id: number;
    organization_id: number;
    organization_name: string;
    requested_plan: string;
    current_plan: string;
    status: string;
    note: string | null;
    requested_by_email: string | null;
    review_note: string | null;
    created_at: string | null;
}

export default function PlatformUpgradeRequests() {
    const { hasRole } = usePlatformAuth();
    const canReview = hasRole('admin');
    const [items, setItems] = useState<UpgradeRequest[]>([]);
    const [status, setStatus] = useState('pending');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<number | null>(null);

    function load() {
        platformGet<UpgradeRequest[]>(`/upgrade-requests?status=${status}`)
            .then((res) => setItems(res.data))
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Failed to load'),
            );
    }

    useEffect(() => {
        load();
    }, [status]);

    async function approve(id: number) {
        const note = prompt('Approval note (optional):') ?? '';
        setBusy(id);
        try {
            await platformPost(`/upgrade-requests/${id}/approve`, { review_note: note || null });
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
        } finally {
            setBusy(null);
        }
    }

    async function reject(id: number) {
        const note = prompt('Rejection reason (optional):') ?? '';
        setBusy(id);
        try {
            await platformPost(`/upgrade-requests/${id}/reject`, { review_note: note || null });
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
                <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Upgrade requests</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Tenant-submitted plan change queue — approve to switch plan and create an invoice.
                </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
                {['pending', 'approved', 'rejected'].map((s) => (
                    <Button
                        key={s}
                        size="sm"
                        variant={status === s ? 'default' : 'outline'}
                        onClick={() => setStatus(s)}
                    >
                        {s}
                    </Button>
                ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-secondary/50">
                        <tr className="text-left text-xs uppercase text-muted-foreground">
                            <th className="px-3 py-2">Org</th>
                            <th className="px-3 py-2">Change</th>
                            <th className="px-3 py-2">Requested by</th>
                            <th className="px-3 py-2">Note</th>
                            <th className="px-3 py-2">When</th>
                            {canReview && status === 'pending' && (
                                <th className="px-3 py-2 text-right">Actions</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((r) => (
                            <tr key={r.id} className="border-t border-border/60">
                                <td className="px-3 py-2">
                                    <Link
                                        to={`/tenants/${r.organization_id}`}
                                        className="font-medium text-[#001f3f] hover:underline"
                                    >
                                        {r.organization_name}
                                    </Link>
                                </td>
                                <td className="px-3 py-2 capitalize">
                                    {r.current_plan} → {r.requested_plan}
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                    {r.requested_by_email ?? '—'}
                                </td>
                                <td className="px-3 py-2 text-xs">{r.note ?? '—'}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                    {r.created_at?.slice(0, 16) ?? '—'}
                                </td>
                                {canReview && status === 'pending' && (
                                    <td className="px-3 py-2 text-right">
                                        <div className="inline-flex gap-1">
                                            <Button
                                                size="sm"
                                                disabled={busy === r.id}
                                                onClick={() => approve(r.id)}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={busy === r.id}
                                                onClick={() => reject(r.id)}
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr>
                                <td
                                    colSpan={canReview && status === 'pending' ? 6 : 5}
                                    className="px-3 py-8 text-center text-muted-foreground"
                                >
                                    No {status} requests.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
