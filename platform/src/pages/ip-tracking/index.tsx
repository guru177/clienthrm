import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, MapPin, AlertCircle } from 'lucide-react';
import { platformGet } from '@/lib/platform-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import IpTrackingMap from '@/components/ip-tracking-map';

interface LiveAdmin {
    id: number;
    name: string;
    email: string;
    organization_name: string;
    organization_slug: string;
    ip_address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    accuracy_meters?: number | null;
    last_active_at: string;
    has_location: boolean;
}

interface IpTrackingResponse {
    users: LiveAdmin[];
    active_count: number;
    without_location_count: number;
    updated_at: string;
}

const AVATAR_COLORS = [
    'bg-blue-500',
    'bg-violet-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
];

function avatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatLastActive(value: string) {
    const parsed = new Date(value.replace(' ', 'T') + 'Z');
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
}

function formatUpdatedAt(value: string) {
    const parsed = new Date(value.replace(' ', 'T') + 'Z');
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleTimeString();
}

export default function PlatformIpTracking() {
    const [data, setData] = useState<IpTrackingResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            const res = await platformGet<IpTrackingResponse>('/ip-tracking');
            setData(res.data);
            setError('');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load live admins');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = window.setInterval(() => load(true), 60_000);
        return () => window.clearInterval(interval);
    }, [load]);

    const users = data?.users ?? [];
    const updatedLabel = data?.updated_at ? formatUpdatedAt(data.updated_at) : '—';

    const mapMarkers = useMemo(
        () =>
            users.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                organization_name: u.organization_name,
                ip_address: u.ip_address,
                latitude: u.latitude,
                longitude: u.longitude,
                last_active_at: u.last_active_at,
            })),
        [users],
    );

    return (
        <div className="-m-4 flex min-h-[calc(100dvh-4rem)] flex-col md:-m-5">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border/60 bg-[#f4f8fc] px-4 py-4 md:px-5">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">IP Tracking</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Company admins with the app open in the last 15 minutes
                        {data ? ` — Updated ${updatedLabel}` : ''}
                    </p>
                </div>
                <Button
                    variant="outline"
                    className="gap-2 bg-white"
                    onClick={() => load(true)}
                    disabled={refreshing}
                >
                    <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

            {error && (
                <p className="shrink-0 px-4 py-2 text-sm text-red-600 md:px-5">{error}</p>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row md:p-5">
                <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_8px_32px_rgba(3,107,211,0.08)] md:min-h-0">
                    <div className="absolute left-4 top-4 z-[500] rounded-full bg-white px-3 py-1 text-xs font-medium shadow-md">
                        Live Now
                    </div>
                    {loading && !data ? (
                        <div className="flex h-full min-h-[320px] items-center justify-center text-muted-foreground">
                            Loading map...
                        </div>
                    ) : (
                        <IpTrackingMap markers={mapMarkers} />
                    )}
                </div>

                <aside className="flex w-full shrink-0 flex-col rounded-2xl border border-white/80 bg-white shadow-[0_8px_32px_rgba(3,107,211,0.08)] md:w-80 lg:w-96">
                    <div className="border-b border-border/60 px-4 py-4">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <h2 className="font-semibold text-[#001f3f]">Live Admins</h2>
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                            <p className="font-medium text-emerald-600">
                                {data?.active_count ?? 0} active in last 15 min
                            </p>
                            {(data?.without_location_count ?? 0) > 0 && (
                                <p className="text-amber-600">
                                    {data?.without_location_count} without location data
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {users.length === 0 && !loading && (
                            <p className="p-4 text-center text-sm text-muted-foreground">
                                No company admins online right now. Admins appear here when they
                                have the tenant app open.
                            </p>
                        )}

                        <ul className="space-y-3">
                            {users.map((admin) => (
                                <li
                                    key={admin.id}
                                    className="rounded-xl border border-border/60 bg-[#f8fbff] p-3"
                                >
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={cn(
                                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
                                                avatarColor(admin.name),
                                            )}
                                        >
                                            {admin.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium text-[#001f3f]">
                                                {admin.name}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {admin.email}
                                            </p>
                                            <p className="mt-1 truncate text-xs font-medium text-[#036bd3]">
                                                {admin.organization_name}
                                            </p>
                                            {admin.has_location ? (
                                                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                                                    <MapPin className="h-3 w-3" />
                                                    {admin.city || admin.region || admin.country || 'Location available'}
                                                    {admin.accuracy_meters != null && admin.accuracy_meters > 1000 && (
                                                        <span className="text-amber-600">
                                                            (approx ±{Math.round(admin.accuracy_meters / 100) / 10} km)
                                                        </span>
                                                    )}
                                                </p>
                                            ) : (
                                                <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                                                    <AlertCircle className="h-3 w-3" />
                                                    Location unknown
                                                </p>
                                            )}
                                            {admin.ip_address && (
                                                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                                                    {admin.ip_address}
                                                </p>
                                            )}
                                            <p className="mt-1 text-[11px] text-muted-foreground">
                                                {formatLastActive(admin.last_active_at)}
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </aside>
            </div>
        </div>
    );
}
