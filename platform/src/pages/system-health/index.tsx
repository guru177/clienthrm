import { useEffect, useState } from 'react';
import { Database, Server, AlertCircle, Activity, RefreshCw } from 'lucide-react';
import { platformGet } from '@/lib/platform-api';
import { Button } from '@/components/ui/button';

interface HealthData {
    database: {
        backend: 'sqlite' | 'postgres';
        path: string;
        size_bytes: number | null;
    };
    tables: { table: string; rows: number }[];
    active_platform_sessions: number;
    recent_errors: {
        id: number;
        action: string;
        target_label: string | null;
        created_at: string | null;
        ip_address: string | null;
    }[];
    last_biometric_punch: string | null;
    last_admin_login: string | null;
    last_org_signup: string | null;
    build: { name: string; version: string };
}

function formatBytes(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function PlatformSystemHealth() {
    const [data, setData] = useState<HealthData | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    function load() {
        setLoading(true);
        platformGet<HealthData>('/system/health')
            .then((res) => setData(res.data))
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Failed to load'),
            )
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        load();
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">
                        System health
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Backend status, database size, table cardinality, recent errors and freshness.
                    </p>
                </div>
                <Button variant="outline" onClick={load} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {data && (
                <>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card icon={<Database className="h-4 w-4" />} label="Database">
                            <p className="font-mono text-base font-bold uppercase text-[#001f3f]">
                                {data.database.backend}
                            </p>
                            <p className="text-xs text-muted-foreground break-all">
                                {data.database.path}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Size: {formatBytes(data.database.size_bytes)}
                            </p>
                        </Card>
                        <Card icon={<Activity className="h-4 w-4" />} label="Active sessions">
                            <p className="font-mono text-2xl font-bold text-[#001f3f]">
                                {data.active_platform_sessions}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                platform_sessions (revoked = 0)
                            </p>
                        </Card>
                        <Card icon={<Server className="h-4 w-4" />} label="Build">
                            <p className="font-mono text-base font-bold text-[#001f3f]">
                                {data.build.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                v{data.build.version}
                            </p>
                        </Card>
                        <Card icon={<AlertCircle className="h-4 w-4" />} label="Recent errors (audit)">
                            <p className="font-mono text-2xl font-bold text-[#001f3f]">
                                {data.recent_errors.length}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                actions matching error/failed
                            </p>
                        </Card>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <FreshnessCard label="Last biometric punch" value={data.last_biometric_punch} />
                        <FreshnessCard label="Last admin login" value={data.last_admin_login} />
                        <FreshnessCard label="Last org signup" value={data.last_org_signup} />
                    </div>

                    <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-sm">
                        <h2 className="text-sm font-semibold text-[#001f3f]">Table cardinality</h2>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                            {data.tables.map((t) => (
                                <div
                                    key={t.table}
                                    className="rounded-lg border border-border bg-white p-2.5"
                                >
                                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                        {t.table}
                                    </p>
                                    <p className="font-mono text-lg font-bold text-[#001f3f]">
                                        {t.rows.toLocaleString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-sm">
                        <h2 className="text-sm font-semibold text-[#001f3f]">Recent errors</h2>
                        {data.recent_errors.length === 0 && (
                            <p className="mt-2 text-sm text-muted-foreground">
                                No error-tagged audit entries.
                            </p>
                        )}
                        <table className="mt-3 w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase text-muted-foreground">
                                    <th className="px-3 py-2">When</th>
                                    <th className="px-3 py-2">Action</th>
                                    <th className="px-3 py-2">Target</th>
                                    <th className="px-3 py-2">IP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.recent_errors.map((e) => (
                                    <tr key={e.id} className="border-t border-border/60">
                                        <td className="px-3 py-2 text-xs text-muted-foreground">
                                            {e.created_at?.slice(0, 16) ?? '—'}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                                        <td className="px-3 py-2 text-xs">
                                            {e.target_label ?? '—'}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                                            {e.ip_address ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </>
            )}
        </div>
    );
}

function Card({
    icon,
    label,
    children,
}: {
    icon: React.ReactNode;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-white/80 bg-white/80 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                {icon}
                {label}
            </div>
            <div className="mt-2">{children}</div>
        </div>
    );
}

function FreshnessCard({ label, value }: { label: string; value: string | null }) {
    let stale = false;
    if (value) {
        const t = new Date(value).getTime();
        if (Number.isFinite(t)) {
            const ageHours = (Date.now() - t) / (1000 * 60 * 60);
            stale = ageHours > 24;
        }
    }
    return (
        <div className="rounded-xl border border-white/80 bg-white/80 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-mono text-base font-bold text-[#001f3f]">{value ?? '—'}</p>
            {value && (
                <p
                    className={`mt-1 text-xs ${
                        stale ? 'text-amber-600' : 'text-emerald-700'
                    }`}
                >
                    {stale ? 'Older than 24h' : 'Fresh (≤ 24h)'}
                </p>
            )}
        </div>
    );
}
