import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { googleStreetViewUrl } from '@/lib/street-view-url';

export interface LiveAdminMarker {
    id: number;
    name: string;
    email: string;
    organization_name: string;
    ip_address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    last_active_at: string;
    is_active?: boolean;
    city?: string | null;
    country?: string | null;
}

/** Esri World Imagery is reliable through zoom 18; higher levels return empty tiles. */
const MAP_MAX_ZOOM = 18;
const LABELS_MAX_ZOOM = 16;
const TRAIL_MAX_POINTS = 24;
const MOVE_DURATION_MS = 1200;

const SATELLITE_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

function markerIcon(active: boolean) {
    const color = active ? '#22c55e' : '#94a3b8';
    const pulse = active
        ? `<span class="ip-live-pulse" style="background:${color}"></span>`
        : '';
    return L.divIcon({
        className: 'ip-live-marker',
        html: `<div class="ip-live-pin-wrap">${pulse}<span class="ip-live-pin" style="background:${color};border-color:${active ? '#16a34a' : '#64748b'}"></span></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
    });
}

function FitBounds({
    markers,
    boundsKey,
}: {
    markers: LiveAdminMarker[];
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
    markers: LiveAdminMarker[];
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

/** Hide place labels when zoomed in — their tiles stop earlier and paint grey over the map. */
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
    admin,
    onSelect,
}: {
    admin: LiveAdminMarker;
    onSelect?: (id: number) => void;
}) {
    const markerRef = useRef<L.Marker | null>(null);
    const fromRef = useRef<[number, number]>([admin.latitude!, admin.longitude!]);
    const rafRef = useRef<number | null>(null);
    const active = !!admin.is_active;
    const icon = useMemo(() => markerIcon(active), [active]);
    const streetViewUrl = googleStreetViewUrl(admin.latitude, admin.longitude);

    useEffect(() => {
        const marker = markerRef.current;
        if (!marker || admin.latitude == null || admin.longitude == null) return;

        const to: [number, number] = [admin.latitude, admin.longitude];
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
    }, [admin.latitude, admin.longitude]);

    return (
        <Marker
            ref={markerRef}
            position={[admin.latitude!, admin.longitude!]}
            icon={icon}
            zIndexOffset={active ? 1000 : 0}
            eventHandlers={{
                click: () => onSelect?.(admin.id),
            }}
        >
            <Tooltip direction="top" offset={[0, -14]} opacity={0.95} className="ip-admin-tooltip">
                <div style={{ lineHeight: 1.35 }}>
                    <div style={{ fontWeight: 600 }}>
                        {admin.name}{' '}
                        <span style={{ color: active ? '#16a34a' : '#64748b', fontSize: 11 }}>
                            {active ? 'LIVE' : 'IDLE'}
                        </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569' }}>{admin.email}</div>
                </div>
            </Tooltip>
            <Popup>
                <div className="space-y-2 text-sm">
                    <p className="font-semibold">
                        {admin.name}{' '}
                        <span className={active ? 'text-emerald-600' : 'text-slate-500'}>
                            {active ? '· LIVE' : '· IDLE'}
                        </span>
                    </p>
                    <p>{admin.organization_name}</p>
                    <p className="text-xs text-slate-600">{admin.email}</p>
                    {(admin.city || admin.country) && (
                        <p className="text-xs text-slate-600">
                            {[admin.city, admin.country].filter(Boolean).join(', ')}
                        </p>
                    )}
                    {admin.ip_address && (
                        <p className="font-mono text-xs">{admin.ip_address}</p>
                    )}
                    {streetViewUrl && (
                        <a
                            href={streetViewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-[#036bd3] hover:bg-[#f8fbff]"
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

export default function IpTrackingMap({
    markers,
    focusId = null,
    onSelect,
    boundsKey = 'default',
}: {
    markers: LiveAdminMarker[];
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
        <MapContainer
            center={[20.5937, 78.9629]}
            zoom={5}
            minZoom={3}
            maxZoom={MAP_MAX_ZOOM}
            scrollWheelZoom
            className="h-full w-full rounded-2xl"
            style={{ minHeight: '100%', background: '#1a1a2e' }}
        >
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
                const color = user?.is_active ? '#22c55e' : '#94a3b8';
                return (
                    <Polyline
                        key={`trail-${id}`}
                        positions={positions}
                        pathOptions={{
                            color,
                            weight: 3,
                            opacity: 0.75,
                            dashArray: user?.is_active ? undefined : '4 6',
                        }}
                    />
                );
            })}

            {located.map((admin) => (
                <AnimatedMarker key={admin.id} admin={admin} onSelect={onSelect} />
            ))}
        </MapContainer>
    );
}
