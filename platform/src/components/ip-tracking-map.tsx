import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

export interface LiveAdminMarker {
    id: number;
    name: string;
    email: string;
    organization_name: string;
    ip_address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    last_active_at: string;
}

/** Esri World Imagery is reliable through zoom 18; higher levels return empty tiles. */
const MAP_MAX_ZOOM = 18;
const LABELS_MAX_ZOOM = 16;

const SATELLITE_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

const defaultIcon = L.icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

function FitBounds({ markers }: { markers: LiveAdminMarker[] }) {
    const map = useMap();

    useEffect(() => {
        const points = markers
            .filter((m) => m.latitude != null && m.longitude != null)
            .map((m) => [m.latitude!, m.longitude!] as [number, number]);

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
    }, [map, markers]);

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

export default function IpTrackingMap({ markers }: { markers: LiveAdminMarker[] }) {
    const located = markers.filter((m) => m.latitude != null && m.longitude != null);

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
            <FitBounds markers={markers} />
            {located.map((admin) => (
                <Marker key={admin.id} position={[admin.latitude!, admin.longitude!]}>
                    <Tooltip
                        direction="top"
                        offset={[0, -38]}
                        opacity={0.95}
                        className="ip-admin-tooltip"
                    >
                        <div style={{ lineHeight: 1.35 }}>
                            <div style={{ fontWeight: 600 }}>{admin.name}</div>
                            <div style={{ fontSize: 12, color: '#475569' }}>{admin.email}</div>
                        </div>
                    </Tooltip>
                    <Popup>
                        <div className="space-y-1 text-sm">
                            <p className="font-semibold">{admin.name}</p>
                            <p>{admin.organization_name}</p>
                            <p className="text-xs text-slate-600">{admin.email}</p>
                            {admin.ip_address && (
                                <p className="font-mono text-xs">{admin.ip_address}</p>
                            )}
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
}
