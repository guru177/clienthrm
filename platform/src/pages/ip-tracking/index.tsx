import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, MapPin, AlertCircle, ExternalLink } from 'lucide-react';
import { platformGet } from '@/lib/platform-api';
import { googleStreetViewUrl } from '@/lib/street-view-url';
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
    is_active: boolean;
}

interface IpTrackingResponse {
    users: LiveAdmin[];
    active_count: number;
    inactive_count: number;
    without_location_count: number;
    updated_at: string;
}

type StatusFilter = 'all' | 'active' | 'inactive';

const POLL_MS = 10_000;

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
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [countryFilter, setCountryFilter] = useState<string>('all');
    const [focusId, setFocusId] = useState<number | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            const res = await platformGet<IpTrackingResponse>('/ip-tracking');
            setData(res.data);
            setError('');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load live tracking');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = window.setInterval(() => load(true), POLL_MS);
        return () => window.clearInterval(interval);
    }, [load]);

    const users = data?.users ?? [];
    const updatedLabel = data?.updated_at ? formatUpdatedAt(data.updated_at) : '—';

    const countries = useMemo(() => {
        const counts = new Map<string, number>();
        for (const u of users) {
            const c = (u.country || '').trim();
            if (!c) continue;
            counts.set(c, (counts.get(c) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [users]);

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            if (statusFilter === 'active' && !u.is_active) return false;
            if (statusFilter === 'inactive' && u.is_active) return false;
            if (countryFilter !== 'all') {
                const c = (u.country || '').trim();
                if (c !== countryFilter) return false;
            }
            return true;
        });
    }, [users, statusFilter, countryFilter]);

    const mapMarkers = useMemo(
        () =>
            filteredUsers.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                organization_name: u.organization_name,
                ip_address: u.ip_address,
                latitude: u.latitude,
                longitude: u.longitude,
                last_active_at: u.last_active_at,
                is_active: u.is_active,
                city: u.city,
                country: u.country,
            })),
        [filteredUsers],
    );

    const filterCounts = {
        all: users.length,
        active: data?.active_count ?? 0,
        inactive: data?.inactive_count ?? 0,
    };

    return (
        <div className="-m-4 flex min-h-[calc(100dvh-4rem)] flex-col md:-m-5">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border/60 bg-[#f4f8fc] px-4 py-4 md:px-5">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[#001f3f]">IP Tracking</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        All users — active (last 15 min) and inactive (last known location)
                        {data ? ` — Updated ${updatedLabel}` : ''}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border border-border/60 bg-white p-0.5 text-xs font-medium shadow-sm">
                        {(
                            [
                                ['all', 'All'],
                                ['active', 'Active'],
                                ['inactive', 'Inactive'],
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setStatusFilter(key)}
                                className={cn(
                                    'rounded-md px-2.5 py-1.5 transition-colors',
                                    statusFilter === key
                                        ? 'bg-[#001f3f] text-white'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {label} ({filterCounts[key]})
                            </button>
                        ))}
                    </div>
                    <select
                        value={countryFilter}
                        onChange={(e) => setCountryFilter(e.target.value)}
                        className="h-9 rounded-lg border border-border/60 bg-white px-2 text-xs font-medium shadow-sm outline-none focus:ring-2 focus:ring-[#036bd3]/30"
                    >
                        <option value="all">All countries ({users.length})</option>
                        {countries.map(([name, count]) => (
                            <option key={name} value={name}>
                                {name} ({count})
                            </option>
                        ))}
                    </select>
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
            </div>

            {error && (
                <p className="shrink-0 px-4 py-2 text-sm text-red-600 md:px-5">{error}</p>
            )}

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row md:p-5">
                <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_8px_32px_rgba(3,107,211,0.08)] md:min-h-0">
                    <div className="absolute left-4 top-4 z-[500] space-y-2">
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-medium shadow-md">
                            <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                            Live map · {POLL_MS / 1000}s refresh
                        </div>
                        <div className="rounded-lg bg-white/95 px-3 py-2 text-[11px] shadow-md backdrop-blur">
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                Active (moving)
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                                <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />
                                Inactive (last known)
                            </div>
                        </div>
                    </div>
                    {loading && !data ? (
                        <div className="flex h-full min-h-[320px] items-center justify-center text-muted-foreground">
                            Loading map...
                        </div>
                    ) : (
                        <IpTrackingMap
                            markers={mapMarkers}
                            focusId={focusId}
                            onSelect={setFocusId}
                            boundsKey={`${statusFilter}:${countryFilter}`}
                        />
                    )}
                </div>

                <aside className="flex w-full shrink-0 flex-col rounded-2xl border border-white/80 bg-white shadow-[0_8px_32px_rgba(3,107,211,0.08)] md:w-80 lg:w-96">
                    <div className="border-b border-border/60 px-4 py-4">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <h2 className="font-semibold text-[#001f3f]">All Users</h2>
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                            <p className="font-medium text-[#001f3f]">
                                {filteredUsers.length} shown · {data?.active_count ?? 0} active ·{' '}
                                {data?.inactive_count ?? 0} inactive
                            </p>
                            {(data?.without_location_count ?? 0) > 0 && (
                                <p className="text-amber-600">
                                    {data?.without_location_count} without location data
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {filteredUsers.length === 0 && !loading && (
                            <p className="p-4 text-center text-sm text-muted-foreground">
                                No users match this filter. Users appear when they have the tenant
                                app open and share location.
                            </p>
                        )}

                        <ul className="space-y-3">
                            {filteredUsers.map((admin) => {
                                const streetViewUrl = googleStreetViewUrl(
                                    admin.latitude,
                                    admin.longitude,
                                );
                                const selected = focusId === admin.id;
                                return (
                                    <li key={admin.id}>
                                        <button
                                            type="button"
                                            onClick={() => setFocusId(admin.id)}
                                            className={cn(
                                                'w-full rounded-xl border p-3 text-left transition-colors',
                                                selected
                                                    ? 'border-[#036bd3] bg-[#eef6ff] ring-1 ring-[#036bd3]/30'
                                                    : 'border-border/60 bg-[#f8fbff] hover:border-[#036bd3]/40',
                                            )}
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
                                                    <div className="flex items-center gap-2">
                                                        <p className="truncate font-medium text-[#001f3f]">
                                                            {admin.name}
                                                        </p>
                                                        <span
                                                            className={cn(
                                                                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                                                admin.is_active
                                                                    ? 'bg-emerald-100 text-emerald-700'
                                                                    : 'bg-slate-100 text-slate-500',
                                                            )}
                                                        >
                                                            {admin.is_active ? 'Live' : 'Idle'}
                                                        </span>
                                                    </div>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {admin.email}
                                                    </p>
                                                    <p className="mt-1 truncate text-xs font-medium text-[#036bd3]">
                                                        {admin.organization_name}
                                                    </p>
                                                    {admin.has_location ? (
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <p className="flex items-center gap-1 text-xs text-emerald-700">
                                                                <MapPin className="h-3 w-3 shrink-0" />
                                                                {admin.city ||
                                                                    admin.region ||
                                                                    admin.country ||
                                                                    'Location available'}
                                                                {admin.accuracy_meters != null &&
                                                                    admin.accuracy_meters > 1000 && (
                                                                        <span className="text-amber-600">
                                                                            (approx ±
                                                                            {Math.round(
                                                                                admin.accuracy_meters /
                                                                                    100,
                                                                            ) / 10}{' '}
                                                                            km)
                                                                        </span>
                                                                    )}
                                                            </p>
                                                            {streetViewUrl && (
                                                                <a
                                                                    href={streetViewUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="inline-flex items-center gap-1 rounded-md border border-[#036bd3]/30 bg-white px-2 py-0.5 text-[11px] font-medium text-[#036bd3] hover:bg-[#036bd3]/5"
                                                                >
                                                                    Street View
                                                                    <ExternalLink className="h-3 w-3" />
                                                                </a>
                                                            )}
                                                        </div>
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
                                                        Last seen {formatLastActive(admin.last_active_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </aside>
            </div>
        </div>
    );
}
