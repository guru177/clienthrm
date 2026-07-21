import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { googleStreetViewUrl } from '@/lib/street-view-url';

export interface LiveUserMarker {
    id: number;
    name: string;
    email: string;
    ip_address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    last_active_at?: string | null;
    is_clocked_in?: boolean;
    /** @deprecated use is_clocked_in */
    is_active?: boolean;
    city?: string | null;
    country?: string | null;
}

const MAP_MAX_ZOOM = 18;
const LABELS_MAX_ZOOM = 16;
const TRAIL_MAX_POINTS = 24;
const MOVE_DURATION_MS = 1200;

const SATELLITE_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

function isClockedIn(user: LiveUserMarker) {
    return user.is_clocked_in ?? user.is_active ?? false;
}

function markerIcon(clockedIn: boolean) {
    const color = clockedIn ? '#22c55e' : '#ef4444';
    const border = clockedIn ? '#16a34a' : '#dc2626';
    const pulse = clockedIn
        ? `<span class="live-loc-pulse" style="background:${color}"></span>`
        : '';
    return L.divIcon({
        className: 'live-loc-marker',
        html: `<div class="live-loc-pin-wrap">${pulse}<span class="live-loc-pin" style="background:${color};border-color:${border}"></span></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
    });
}

function InvalidateSize() {
    const map = useMap();

    useEffect(() => {
        const fix = () => {
            map.invalidateSize({ animate: false });
        };
        fix();
        const timers = [50, 200, 500].map((ms) => window.setTimeout(fix, ms));
        window.addEventListener('resize', fix);
        const parent = map.getContainer().parentElement;
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fix) : null;
        if (parent && ro) ro.observe(parent);

        return () => {
            timers.forEach((id) => window.clearTimeout(id));
            window.removeEventListener('resize', fix);
            ro?.disconnect();
        };
    }, [map]);

    return null;
}

function FitBounds({
    markers,
    boundsKey,
}: {
    markers: LiveUserMarker[];
    boundsKey: string;
}) {
    const map = useMap();
    const lastKey = useRef<string | null>(null);
    const hadPoints = useRef(false);

    useEffect(() => {
        const points = markers
            .filter((m) => m.latitude != null && m.longitude != null)
            .map((m) => [m.latitude!, m.longitude!] as [number, number]);

        const keyChanged = lastKey.current !== boundsKey;
        const firstPoints = points.length > 0 && !hadPoints.current;
        if (!keyChanged && !firstPoints) return;

        lastKey.current = boundsKey;
        hadPoints.current = points.length > 0;
        map.invalidateSize({ animate: false });

        if (points.length === 0) {
            map.setView([20.5937, 78.9629], 5);
            return;
        }
        if (points.length === 1) {
            map.setView(points[0], Math.min(15, MAP_MAX_ZOOM));
            return;
        }
        map.fitBounds(L.latLngBounds(points), {
            padding: [48, 48],
            maxZoom: Math.min(12, MAP_MAX_ZOOM),
        });
    }, [map, markers, boundsKey]);

    return null;
}

function FlyToUser({
    focusId,
    markers,
}: {
    focusId: number | null;
    markers: LiveUserMarker[];
}) {
    const map = useMap();
    const lastFocus = useRef<number | null>(null);

    useEffect(() => {
        if (focusId == null || focusId === lastFocus.current) return;
        const target = markers.find((m) => m.id === focusId);
        if (target?.latitude == null || target.longitude == null) return;
        lastFocus.current = focusId;
        map.flyTo([target.latitude, target.longitude], Math.min(16, MAP_MAX_ZOOM), {
            duration: 0.8,
        });
    }, [focusId, markers, map]);

    return null;
}

function PlaceLabelsLayer() {
    const map = useMap();
    const [visible, setVisible] = useState(map.getZoom() <= LABELS_MAX_ZOOM);

    useEffect(() => {
        const sync = () => setVisible(map.getZoom() <= LABELS_MAX_ZOOM);
        map.on('zoomend', sync);
        sync();
        return () => {
            map.off('zoomend', sync);
        };
    }, [map]);

    if (!visible) return null;

    return (
        <TileLayer
            url={LABELS_URL}
            maxNativeZoom={LABELS_MAX_ZOOM}
            maxZoom={LABELS_MAX_ZOOM}
            opacity={0.8}
            updateWhenIdle
        />
    );
}

function AnimatedMarker({
    user,
    onSelect,
}: {
    user: LiveUserMarker;
    onSelect?: (id: number) => void;
}) {
    const markerRef = useRef<L.Marker | null>(null);
    const fromRef = useRef<[number, number]>([user.latitude!, user.longitude!]);
    const rafRef = useRef<number | null>(null);
    const clockedIn = isClockedIn(user);
    const icon = useMemo(() => markerIcon(clockedIn), [clockedIn]);
    const streetViewUrl = googleStreetViewUrl(user.latitude, user.longitude);

    useEffect(() => {
        const marker = markerRef.current;
        if (!marker || user.latitude == null || user.longitude == null) return;

        const to: [number, number] = [user.latitude, user.longitude];
        const from = fromRef.current;
        if (from[0] === to[0] && from[1] === to[1]) return;

        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

        const start = performance.now();
        const animate = (now: number) => {
            const t = Math.min(1, (now - start) / MOVE_DURATION_MS);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const lat = from[0] + (to[0] - from[0]) * ease;
            const lng = from[1] + (to[1] - from[1]) * ease;
            marker.setLatLng([lat, lng]);
            if (t < 1) {
                rafRef.current = requestAnimationFrame(animate);
            } else {
                fromRef.current = to;
                rafRef.current = null;
            }
        };
        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, [user.latitude, user.longitude]);

    return (
        <Marker
            ref={markerRef}
            position={[user.latitude!, user.longitude!]}
            icon={icon}
            zIndexOffset={clockedIn ? 1000 : 0}
            eventHandlers={{
                click: () => onSelect?.(user.id),
            }}
        >
            <Tooltip direction="top" offset={[0, -14]} opacity={0.95} className="live-loc-tooltip">
                <div style={{ lineHeight: 1.35 }}>
                    <div style={{ fontWeight: 600 }}>
                        {user.name}{' '}
                        <span style={{ color: clockedIn ? '#16a34a' : '#dc2626', fontSize: 11 }}>
                            {clockedIn ? 'IN' : 'OUT'}
                        </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569' }}>{user.email}</div>
                </div>
            </Tooltip>
            <Popup>
                <div className="space-y-2 text-sm">
                    <p className="font-semibold">
                        {user.name}{' '}
                        <span className={clockedIn ? 'text-emerald-600' : 'text-red-600'}>
                            {clockedIn ? '· Clocked in' : '· Clocked out'}
                        </span>
                    </p>
                    <p className="text-xs text-slate-600">{user.email}</p>
                    {(user.city || user.country) && (
                        <p className="text-xs text-slate-600">
                            {[user.city, user.country].filter(Boolean).join(', ')}
                        </p>
                    )}
                    {user.ip_address && (
                        <p className="font-mono text-xs">{user.ip_address}</p>
                    )}
                    {streetViewUrl && (
                        <a
                            href={streetViewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-muted"
                        >
                            Open Street View
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    )}
                </div>
            </Popup>
        </Marker>
    );
}

export default function LiveLocationsMap({
    markers,
    focusId = null,
    onSelect,
    boundsKey = 'default',
}: {
    markers: LiveUserMarker[];
    focusId?: number | null;
    onSelect?: (id: number) => void;
    boundsKey?: string;
}) {
    const located = markers.filter((m) => m.latitude != null && m.longitude != null);
    const trailsRef = useRef<Map<number, [number, number][]>>(new Map());
    const [trails, setTrails] = useState<Map<number, [number, number][]>>(new Map());

    useEffect(() => {
        let changed = false;
        const next = new Map(trailsRef.current);

        for (const m of markers) {
            if (m.latitude == null || m.longitude == null) continue;
            const point: [number, number] = [m.latitude, m.longitude];
            const prev = next.get(m.id) ?? [];
            const last = prev[prev.length - 1];
            if (!last || last[0] !== point[0] || last[1] !== point[1]) {
                const updated = [...prev, point].slice(-TRAIL_MAX_POINTS);
                next.set(m.id, updated);
                changed = true;
            }
        }

        if (changed) {
            trailsRef.current = next;
            setTrails(new Map(next));
        }
    }, [markers]);

    return (
        <div className="absolute inset-0 h-full w-full">
            <MapContainer
                center={[20.5937, 78.9629]}
                zoom={5}
                minZoom={3}
                maxZoom={MAP_MAX_ZOOM}
                scrollWheelZoom
                className="h-full w-full !bg-[#1a1a2e]"
                style={{ height: '100%', width: '100%' }}
            >
                <InvalidateSize />
                <TileLayer
                    attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
                    url={SATELLITE_URL}
                    maxNativeZoom={MAP_MAX_ZOOM}
                    maxZoom={MAP_MAX_ZOOM}
                    updateWhenIdle
                />
                <PlaceLabelsLayer />
                <FitBounds markers={markers} boundsKey={boundsKey} />
                <FlyToUser focusId={focusId} markers={markers} />

                {[...trails.entries()].map(([id, positions]) => {
                    if (positions.length < 2) return null;
                    const user = located.find((m) => m.id === id);
                    const color = user && isClockedIn(user) ? '#22c55e' : '#ef4444';
                    return (
                        <Polyline
                            key={`trail-${id}`}
                            positions={positions}
                            pathOptions={{
                                color,
                                weight: 3,
                                opacity: 0.75,
                                dashArray: user && isClockedIn(user) ? undefined : '4 6',
                            }}
                        />
                    );
                })}

                {located.map((user) => (
                    <AnimatedMarker key={user.id} user={user} onSelect={onSelect} />
                ))}
            </MapContainer>
        </div>
    );
}
