import { useEffect, useRef } from 'react';
import { apiPost } from '@/lib/api';

const PRESENCE_INTERVAL_MS = 30_000;

interface PresenceCoords {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    city?: string;
    region?: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<Pick<PresenceCoords, 'city' | 'region'>> {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } },
        );
        if (!res.ok) return {};
        const data = await res.json();
        const addr = data.address ?? {};
        const city =
            addr.suburb ||
            addr.neighbourhood ||
            addr.quarter ||
            addr.city_district ||
            addr.town ||
            addr.village ||
            addr.city;
        return {
            city: city ? String(city) : undefined,
            region: addr.state ? String(addr.state) : undefined,
        };
    } catch {
        return {};
    }
}

/**
 * Sends periodic presence heartbeats (with live GPS when available)
 * so the platform IP Tracking map can monitor movement in near real time.
 */
export function useAdminPresence(enabled: boolean) {
    const coordsRef = useRef<PresenceCoords>({});
    const geocodeTimerRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        let watchId: number | undefined;
        let interval: number | undefined;

        async function ping() {
            const { latitude, longitude, accuracy, city, region } = coordsRef.current;
            const payload: Record<string, unknown> = {};
            if (latitude != null && longitude != null) {
                payload.latitude = latitude;
                payload.longitude = longitude;
                if (accuracy != null) payload.accuracy_meters = accuracy;
                if (city) payload.city = city;
                if (region) payload.region = region;
            }
            await apiPost('/auth/presence', payload).catch(() => {});
        }

        async function applyPosition(pos: GeolocationPosition) {
            const { latitude, longitude, accuracy } = pos.coords;
            coordsRef.current = {
                ...coordsRef.current,
                latitude,
                longitude,
                accuracy,
            };

            if (geocodeTimerRef.current) {
                window.clearTimeout(geocodeTimerRef.current);
            }
            geocodeTimerRef.current = window.setTimeout(async () => {
                const place = await reverseGeocode(latitude, longitude);
                coordsRef.current = { ...coordsRef.current, ...place };
                await ping();
            }, 400);

            await ping();
        }

        async function geoAllowed(): Promise<boolean> {
            if (!('geolocation' in navigator)) return false;
            try {
                if (navigator.permissions?.query) {
                    const status = await navigator.permissions.query({
                        name: 'geolocation' as PermissionName,
                    });
                    // Avoid hammering the API when the browser has auto-denied
                    // after repeated dismissals (Chrome console warning).
                    if (status.state === 'denied') return false;
                }
            } catch {
                /* Safari / older browsers may throw */
            }
            return true;
        }

        function startGeoTracking() {
            if (!navigator.geolocation) {
                void ping();
                return;
            }
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    void applyPosition(pos);
                },
                () => {
                    void ping();
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 60_000,
                    timeout: 20_000,
                },
            );

            interval = window.setInterval(() => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        void applyPosition(pos);
                    },
                    () => {
                        void ping();
                    },
                    {
                        enableHighAccuracy: true,
                        maximumAge: 60_000,
                        timeout: 20_000,
                    },
                );
            }, PRESENCE_INTERVAL_MS);

            const onVisible = () => {
                if (document.visibilityState !== 'visible') return;
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        void applyPosition(pos);
                    },
                    () => {
                        void ping();
                    },
                    {
                        enableHighAccuracy: true,
                        maximumAge: 60_000,
                        timeout: 20_000,
                    },
                );
            };
            document.addEventListener('visibilitychange', onVisible);
            cleanupVisible = () => document.removeEventListener('visibilitychange', onVisible);
        }

        let cleanupVisible: (() => void) | undefined;

        void (async () => {
            const allowed = await geoAllowed();
            if (cancelled) return;
            if (allowed) {
                startGeoTracking();
            } else {
                void ping();
                interval = window.setInterval(() => {
                    void ping();
                }, PRESENCE_INTERVAL_MS);
            }
        })();

        return () => {
            cancelled = true;
            if (watchId != null) navigator.geolocation.clearWatch(watchId);
            if (geocodeTimerRef.current) window.clearTimeout(geocodeTimerRef.current);
            if (interval != null) window.clearInterval(interval);
            cleanupVisible?.();
        };
    }, [enabled]);
}
