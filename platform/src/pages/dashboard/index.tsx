import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Building2,
    CheckCircle2,
    Users,
    DollarSign,
    Clock,
    AlertTriangle,
    Cpu,
    Activity,
    UserPlus,
} from 'lucide-react';
import { platformGet } from '@/lib/platform-api';
import { StatCard } from '@/components/stat-card';
import { Sparkline, HBarChart } from '@/components/mini-charts';

interface Overview {
    organizations: { total: number; active: number; suspended: number; deleted: number };
    users: { total: number; active_24h: number };
    signups: { today: number; last_7d: number; last_30d: number };
    subscriptions: {
        expiring_7d: number;
        expired: number;
        paid_orgs: number;
        mrr_estimate: number;
    };
    devices: { total: number; active_24h: number; punches_24h: number };
}

interface SignupSeries {
    series: { date: string; count: number }[];
}

interface PlanDistRow {
    slug: string;
    name: string;
    price_label: string;
    active_orgs: number;
    total_orgs: number;
    mrr: number;
}

interface ExpiringRow {
    id: number;
    name: string;
    slug: string;
    plan: string;
    plan_expires_at: string | null;
    status: string;
    user_count: number;
}

interface GeoRow {
    country: string;
    users: number;
    last_seen: string | null;
}

function formatMoney(n: number): string {
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
}

export default function PlatformDashboard() {
    const [overview, setOverview] = useState<Overview | null>(null);
    const [signups, setSignups] = useState<SignupSeries | null>(null);
    const [plans, setPlans] = useState<PlanDistRow[]>([]);
    const [expiring, setExpiring] = useState<ExpiringRow[]>([]);
    const [geo, setGeo] = useState<GeoRow[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            platformGet<Overview>('/analytics/overview'),
            platformGet<SignupSeries>('/analytics/signups?days=30'),
            platformGet<PlanDistRow[]>('/analytics/plan-distribution'),
            platformGet<ExpiringRow[]>('/analytics/expiring?days=30'),
            platformGet<GeoRow[]>('/analytics/geography'),
        ])
            .then(([o, s, p, e, g]) => {
                setOverview(o.data);
                setSignups(s.data);
                setPlans(p.data);
                setExpiring(e.data);
                setGeo(g.data);
            })
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Failed to load dashboard'),
            )
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Dashboard</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Live snapshot across organizations, signups, revenue, and biometric fleet.
                </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {loading && <p className="text-muted-foreground">Loading dashboard...</p>}

            {overview && (
                <>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            title="Organizations"
                            value={overview.organizations.total}
                            icon={Building2}
                        />
                        <StatCard
                            title="Active"
                            value={overview.organizations.active}
                            icon={CheckCircle2}
                        />
                        <StatCard title="Total users" value={overview.users.total} icon={Users} />
                        <StatCard
                            title="Active 24h"
                            value={overview.users.active_24h}
                            icon={Activity}
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            title="MRR (est.)"
                            value={`₹${formatMoney(overview.subscriptions.mrr_estimate)}`}
                            icon={DollarSign}
                        />
                        <StatCard
                            title="Signups (7d)"
                            value={overview.signups.last_7d}
                            icon={UserPlus}
                        />
                        <StatCard
                            title="Expiring (7d)"
                            value={overview.subscriptions.expiring_7d}
                            icon={Clock}
                        />
                        <StatCard
                            title="Devices online"
                            value={`${overview.devices.active_24h}/${overview.devices.total}`}
                            icon={Cpu}
                        />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md lg:col-span-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-semibold text-[#001f3f]">
                                        Daily signups (30d)
                                    </h2>
                                    <p className="text-xs text-muted-foreground">
                                        New organizations onboarded
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-2xl font-bold text-[#001f3f]">
                                        {overview.signups.last_30d}
                                    </p>
                                    <p className="text-xs text-muted-foreground">last 30 days</p>
                                </div>
                            </div>
                            <div className="mt-3 h-32">
                                {signups && (
                                    <Sparkline
                                        data={signups.series.map((s) => ({
                                            label: s.date,
                                            value: s.count,
                                        }))}
                                        height={120}
                                        width={640}
                                    />
                                )}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                            <h2 className="text-sm font-semibold text-[#001f3f]">Plan distribution</h2>
                            <p className="text-xs text-muted-foreground">
                                Active orgs per subscription plan
                            </p>
                            <div className="mt-4">
                                <HBarChart
                                    data={plans.map((p) => ({
                                        label: `${p.name} · ${p.price_label}`,
                                        value: p.active_orgs,
                                    }))}
                                />
                            </div>
                        </section>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-semibold text-[#001f3f]">
                                        Expiring soon (next 30d)
                                    </h2>
                                    <p className="text-xs text-muted-foreground">
                                        Revenue at risk if not renewed
                                    </p>
                                </div>
                                {expiring.length > 0 && (
                                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                        <AlertTriangle className="-mt-0.5 mr-1 inline h-3 w-3" />
                                        {expiring.length} orgs
                                    </span>
                                )}
                            </div>
                            <div className="mt-3 max-h-72 overflow-y-auto">
                                {expiring.length === 0 && (
                                    <p className="py-8 text-center text-xs text-muted-foreground">
                                        Nothing expiring in the next 30 days.
                                    </p>
                                )}
                                <ul className="divide-y divide-border/60 text-sm">
                                    {expiring.slice(0, 20).map((e) => (
                                        <li
                                            key={e.id}
                                            className="flex items-center justify-between py-2"
                                        >
                                            <Link
                                                to={`/tenants/${e.id}`}
                                                className="flex flex-1 items-center justify-between hover:opacity-80"
                                            >
                                                <div>
                                                    <p className="font-medium text-[#001f3f]">{e.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {e.plan} · {e.user_count} users
                                                    </p>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {e.plan_expires_at?.slice(0, 10) ?? '—'}
                                                </p>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_8px_32px_rgba(3,107,211,0.08)] backdrop-blur-md">
                            <h2 className="text-sm font-semibold text-[#001f3f]">Geography (30d)</h2>
                            <p className="text-xs text-muted-foreground">
                                Active admin users by country
                            </p>
                            <div className="mt-4">
                                <HBarChart
                                    data={geo.slice(0, 10).map((g) => ({
                                        label: g.country,
                                        value: g.users,
                                    }))}
                                />
                            </div>
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}
