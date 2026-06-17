import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Users } from 'lucide-react';
import { platformGet } from '@/lib/platform-api';
import { OrganizationsPanel } from '@/components/organizations-panel';
import { StatCard } from '@/components/stat-card';

interface PlatformStats {
    total_organizations: number;
    active_organizations: number;
    total_users: number;
}

export default function PlatformUsers() {
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        platformGet<PlatformStats>('/dashboard/stats')
            .then((res) => setStats(res.data))
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : 'Failed to load users'),
            )
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">Users</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Manage organizations and tenant access.
                </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {!loading && stats && (
                <div className="grid gap-4 md:grid-cols-3">
                    <StatCard title="Organizations" value={stats.total_organizations} icon={Building2} />
                    <StatCard title="Active" value={stats.active_organizations} icon={CheckCircle2} />
                    <StatCard title="Total users" value={stats.total_users} icon={Users} />
                </div>
            )}

            {loading && <p className="text-muted-foreground">Loading...</p>}

            <OrganizationsPanel />
        </div>
    );
}
