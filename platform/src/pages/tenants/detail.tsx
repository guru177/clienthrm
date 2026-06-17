import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    LogIn,
    RefreshCw,
    Trash2,
    Download,
} from 'lucide-react';
import {
    platformGet,
    platformPost,
    platformDelete,
    platformPatch,
    getPlatformToken,
} from '@/lib/platform-api';
import { defaultAdminRoute, redirectToTenantImpersonation } from '@/lib/app-urls';
import type { OrganizationDetail } from '@/components/organizations-panel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { usePlatformAuth } from '@/contexts/PlatformAuthContext';

interface Overview {
    id: number;
    name: string;
    slug: string;
    users: { total: number; active: number; on_leave: number; suspended: number };
    devices: { total: number; active: number };
}

export default function PlatformTenantDetail() {
    const { id } = useParams<{ id: string }>();
    const orgId = Number(id);
    const [overview, setOverview] = useState<Overview | null>(null);
    const [detail, setDetail] = useState<OrganizationDetail | null>(null);
    const [error, setError] = useState('');

    function reload() {
        if (!Number.isFinite(orgId)) return;
        Promise.all([
            platformGet<Overview>(`/organizations/${orgId}/overview`),
            platformGet<OrganizationDetail>(`/organizations/${orgId}`),
        ])
            .then(([o, d]) => {
                setOverview(o.data);
                setDetail(d.data);
            })
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Failed to load overview'),
            );
    }

    useEffect(() => {
        reload();
    }, [orgId]);

    if (!Number.isFinite(orgId)) {
        return <p className="text-sm text-muted-foreground">Invalid organization id.</p>;
    }

    return (
        <div className="space-y-6">
            <div>
                <Link
                    to="/users"
                    className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-3 w-3" /> All organizations
                </Link>
                <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">
                    {overview ? overview.name : `Organization #${orgId}`}
                </h1>
                {overview && (
                    <p className="text-sm text-muted-foreground">slug: {overview.slug}</p>
                )}
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>

            {overview && <OverviewKpis overview={overview} />}

            {overview && detail && (
                <OverviewPanel
                    overview={overview}
                    detail={detail}
                    orgId={orgId}
                    onChanged={reload}
                />
            )}
        </div>
    );
}

function OverviewKpis({ overview }: { overview: Overview }) {
    const cards = [
        { label: 'Users', value: overview.users.total, sub: `${overview.users.active} active` },
        { label: 'On leave', value: overview.users.on_leave, sub: 'today' },
        { label: 'Suspended', value: overview.users.suspended, sub: 'users' },
        { label: 'Devices', value: overview.devices.total, sub: `${overview.devices.active} active` },
    ];
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
                <div
                    key={c.label}
                    className="rounded-xl border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur-md"
                >
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        {c.label}
                    </p>
                    <p className="font-mono text-2xl font-bold text-[#001f3f]">{c.value}</p>
                    <p className="text-xs text-muted-foreground">{c.sub}</p>
                </div>
            ))}
        </div>
    );
}

function OverviewPanel({
    overview,
    detail,
    orgId,
    onChanged,
}: {
    overview: Overview;
    detail: OrganizationDetail;
    orgId: number;
    onChanged: () => void;
}) {
    const navigate = useNavigate();
    const { hasRole } = usePlatformAuth();
    const canAdmin = hasRole('admin');
    const canSupport = hasRole('support');
    const [plans, setPlans] = useState<{ slug: string; name: string }[]>([]);
    const [plan, setPlan] = useState(detail.plan);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        platformGet<{ slug: string; name: string }[]>('/plans')
            .then((res) => setPlans(res.data))
            .catch(() => {});
    }, []);

    useEffect(() => {
        setPlan(detail.plan);
    }, [detail.plan]);

    async function impersonate() {
        setBusy('impersonate');
        setError('');
        try {
            const res = await platformPost<{
                token: string;
                refresh_token?: string;
                permissions?: string[];
                user?: { permissions?: string[] };
            }>(`/organizations/${orgId}/impersonate`, {});
            const perms = res.data.permissions ?? res.data.user?.permissions ?? [];
            const has = (slug: string) => perms.includes('*') || perms.includes(slug);
            redirectToTenantImpersonation({
                token: res.data.token,
                refreshToken: res.data.refresh_token,
                orgSlug: detail.slug,
                orgName: detail.name,
                next: defaultAdminRoute(has),
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Impersonation failed');
        } finally {
            setBusy('');
        }
    }

    async function toggleStatus() {
        const next = detail.status === 'active' ? 'suspended' : 'active';
        if (!confirm(`${next === 'suspended' ? 'Suspend' : 'Activate'} ${detail.name}?`)) return;
        setBusy('status');
        try {
            await platformPatch(`/organizations/${orgId}`, { status: next });
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
        } finally {
            setBusy('');
        }
    }

    async function extendTrial(days: number) {
        setBusy(`extend-${days}`);
        try {
            await platformPatch(`/organizations/${orgId}`, { extend_days: days });
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
        } finally {
            setBusy('');
        }
    }

    async function renewSubscription() {
        setBusy('renew');
        try {
            await platformPatch(`/organizations/${orgId}`, { renew_subscription: true });
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
        } finally {
            setBusy('');
        }
    }

    async function changePlan() {
        if (plan === detail.plan) return;
        setBusy('plan');
        try {
            await platformPatch(`/organizations/${orgId}`, { plan });
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
        } finally {
            setBusy('');
        }
    }

    async function deleteOrg() {
        if (!confirm(`Delete ${detail.name}? This cannot be undone.`)) return;
        setBusy('delete');
        try {
            await platformDelete(`/organizations/${orgId}`);
            navigate('/users');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
            setBusy('');
        }
    }

    async function exportOrg() {
        setBusy('export');
        setError('');
        try {
            const token = getPlatformToken();
            const res = await fetch(`/api/platform/organizations/${orgId}/export`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Export failed');
            const blob = new Blob([JSON.stringify(json.data, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${detail.slug}-export.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed');
        } finally {
            setBusy('');
        }
    }

    return (
        <div className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border border-white/80 bg-white/80 p-5 text-sm shadow-sm">
                    <h2 className="font-semibold text-[#001f3f]">Subscription</h2>
                    <dl className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Plan</dt>
                            <dd className="font-medium capitalize">{detail.plan}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Status</dt>
                            <dd className="capitalize">{detail.status}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Expires</dt>
                            <dd>{detail.plan_expires_at?.slice(0, 10) ?? 'No expiry'}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Admin</dt>
                            <dd>{detail.admin_email ?? '—'}</dd>
                        </div>
                    </dl>
                </section>

                <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-sm">
                    <h2 className="font-semibold text-[#001f3f]">Quick actions</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {canSupport && (
                            <Button size="sm" disabled={!!busy} onClick={impersonate}>
                                <LogIn className="mr-1 h-3.5 w-3.5" />
                                {busy === 'impersonate' ? 'Opening…' : 'Impersonate'}
                            </Button>
                        )}
                        {canAdmin && (
                            <Button size="sm" variant="outline" disabled={!!busy} onClick={toggleStatus}>
                                {detail.status === 'active' ? 'Suspend org' : 'Activate org'}
                            </Button>
                        )}
                        {canAdmin && (
                            <Button size="sm" variant="outline" disabled={!!busy} onClick={renewSubscription}>
                                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                                Renew period
                            </Button>
                        )}
                    </div>

                    {canAdmin && (
                        <div className="mt-4 space-y-3">
                            <div>
                                <Label className="text-xs">Extend trial / subscription</Label>
                                <div className="mt-1 flex flex-wrap gap-2">
                                    {[7, 14, 30].map((d) => (
                                        <Button
                                            key={d}
                                            size="sm"
                                            variant="outline"
                                            disabled={!!busy}
                                            onClick={() => extendTrial(d)}
                                        >
                                            +{d} days
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <Label className="text-xs">Change plan</Label>
                                    <select
                                        value={plan}
                                        onChange={(e) => setPlan(e.target.value)}
                                        className="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
                                    >
                                        {plans.map((p) => (
                                            <option key={p.slug} value={p.slug}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <Button size="sm" disabled={!!busy || plan === detail.plan} onClick={changePlan}>
                                    Apply
                                </Button>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={!!busy}
                                onClick={exportOrg}
                            >
                                <Download className="mr-1 h-3.5 w-3.5" />
                                Export JSON
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:bg-red-50"
                                disabled={!!busy}
                                onClick={deleteOrg}
                            >
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                Delete organization
                            </Button>
                        </div>
                    )}
                </section>
            </div>

            <p className="text-sm text-muted-foreground">
                {overview.name} has {overview.users.total} users and {overview.devices.total}{' '}
                biometric devices registered.
            </p>
        </div>
    );
}
