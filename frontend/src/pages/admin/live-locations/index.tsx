import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, MapPin, AlertCircle, ExternalLink } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { googleStreetViewUrl } from '@/lib/street-view-url';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import LiveLocationsMap from '@/components/attendance/live-locations-map';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';

interface LiveUser {
    id: number;
    name: string;
    email: string;
    ip_address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    accuracy_meters?: number | null;
    last_active_at: string | null;
    has_location: boolean;
    is_clocked_in: boolean;
    is_active?: boolean;
}

interface LiveLocationsResponse {
    users: LiveUser[];
    active_count: number;
    inactive_count: number;
    clocked_in_count?: number;
    clocked_out_count?: number;
    without_location_count: number;
    updated_at: string;
}

type StatusFilter = 'all' | 'in' | 'out';

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

function formatLastActive(value: string | null | undefined) {
    if (!value) return 'Never seen';
    const parsed = new Date(value.replace(' ', 'T') + 'Z');
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
}

function formatUpdatedAt(value: string) {
    const parsed = new Date(value.replace(' ', 'T') + 'Z');
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleTimeString();
}

export default function LiveLocationsPage() {
    const { setBreadcrumbs } = useBreadcrumbs();
    const [data, setData] = useState<LiveLocationsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [focusId, setFocusId] = useState<number | null>(null);

    useEffect(() => {
        setBreadcrumbs([
            { title: 'Location based attendance', href: '/admin/attendance' },
            { title: 'Live Locations' },
        ]);
    }, [setBreadcrumbs]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            const res = await apiGet<LiveLocationsResponse>('/admin/attendance/live-locations');
            setData(res.data);
            setError('');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load live locations');
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

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            const clockedIn = u.is_clocked_in ?? u.is_active ?? false;
            if (statusFilter === 'in' && !clockedIn) return false;
            if (statusFilter === 'out' && clockedIn) return false;
            return true;
        });
    }, [users, statusFilter]);

    const mapMarkers = useMemo(
        () =>
            filteredUsers.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                ip_address: u.ip_address,
                latitude: u.latitude,
                longitude: u.longitude,
                last_active_at: u.last_active_at,
                is_clocked_in: u.is_clocked_in ?? u.is_active ?? false,
                is_active: u.is_clocked_in ?? u.is_active ?? false,
                city: u.city,
                country: u.country,
            })),
        [filteredUsers],
    );

    const clockedInCount = data?.clocked_in_count ?? data?.active_count ?? 0;
    const clockedOutCount = data?.clocked_out_count ?? data?.inactive_count ?? 0;

    const filterCounts = {
        all: users.length,
        in: clockedInCount,
        out: clockedOutCount,
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border/60 bg-muted/30 px-4 py-4 md:px-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Live Locations</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Green = clocked in · Red = clocked out
                        {data ? ` · Updated ${updatedLabel}` : ''}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border border-border/60 bg-background p-0.5 text-xs font-medium shadow-sm">
                        {(
                            [
                                ['all', 'All'],
                                ['in', 'Clocked in'],
                                ['out', 'Clocked out'],
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setStatusFilter(key)}
                                className={cn(
                                    'rounded-md px-2.5 py-1.5 transition-colors',
                                    statusFilter === key
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {label} ({filterCounts[key]})
                            </button>
                        ))}
                    </div>
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => load(true)}
                        disabled={refreshing}
                    >
                        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                        Refresh
                    </Button>
                </div>
            </div>

            {error && <p className="shrink-0 px-4 py-2 text-sm text-destructive md:px-6">{error}</p>}

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row md:p-6">
                <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-xl border bg-[#1a1a2e] shadow-sm md:min-h-0">
                    <div className="pointer-events-none absolute left-4 top-4 z-[500] space-y-2">
                        <div className="pointer-events-auto rounded-full bg-background px-3 py-1 text-xs font-medium shadow-md">
                            <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                            Live map · {POLL_MS / 1000}s refresh
                        </div>
                        <div className="rounded-lg bg-background/95 px-3 py-2 text-[11px] shadow-md backdrop-blur">
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                Clocked in
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                                Clocked out
                            </div>
                        </div>
                    </div>
                    {loading && !data ? (
                        <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">
                            Loading map...
                        </div>
                    ) : (
                        <LiveLocationsMap
                            markers={mapMarkers}
                            focusId={focusId}
                            onSelect={setFocusId}
                            boundsKey={statusFilter}
                        />
                    )}
                </div>

                <aside className="flex max-h-[40vh] w-full shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm md:max-h-none md:h-full md:w-80 lg:w-96">
                    <div className="border-b px-4 py-4">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <h2 className="font-semibold">Employees</h2>
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                            <p className="font-medium">
                                {filteredUsers.length} shown · {clockedInCount} in · {clockedOutCount}{' '}
                                out
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
                                No employees in this organization yet.
                            </p>
                        )}

                        <ul className="space-y-3">
                            {filteredUsers.map((user) => {
                                const clockedIn = user.is_clocked_in ?? user.is_active ?? false;
                                const streetViewUrl = googleStreetViewUrl(
                                    user.latitude,
                                    user.longitude,
                                );
                                const selected = focusId === user.id;
                                return (
                                    <li key={user.id}>
                                        <button
                                            type="button"
                                            onClick={() => setFocusId(user.id)}
                                            className={cn(
                                                'w-full rounded-xl border p-3 text-left transition-colors',
                                                selected
                                                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                                    : 'border-border/60 bg-muted/40 hover:border-primary/40',
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className={cn(
                                                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
                                                        avatarColor(user.name),
                                                    )}
                                                >
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="truncate font-medium">
                                                            {user.name}
                                                        </p>
                                                        <span
                                                            className={cn(
                                                                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                                                clockedIn
                                                                    ? 'bg-emerald-100 text-emerald-700'
                                                                    : 'bg-red-100 text-red-700',
                                                            )}
                                                        >
                                                            {clockedIn ? 'In' : 'Out'}
                                                        </span>
                                                    </div>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {user.email}
                                                    </p>
                                                    {user.has_location ? (
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <p className="flex items-center gap-1 text-xs text-emerald-700">
                                                                <MapPin className="h-3 w-3 shrink-0" />
                                                                {user.city ||
                                                                    user.region ||
                                                                    user.country ||
                                                                    'Location available'}
                                                            </p>
                                                            {streetViewUrl && (
                                                                <a
                                                                    href={streetViewUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-muted"
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
                                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                                        {user.last_active_at
                                                            ? `Last seen ${formatLastActive(user.last_active_at)}`
                                                            : 'Never seen online'}
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
