import { useEffect, useRef } from 'react';
import { apiPost } from '@/lib/api';

const PRESENCE_INTERVAL_MS = 60_000;

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
 * Sends periodic presence heartbeats for company admins (is_super_admin)
 * so the platform console can show live IP / location tracking.
 */
export function useAdminPresence(enabled: boolean) {
    const coordsRef = useRef<PresenceCoords>({});
    const geocodeTimerRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (!enabled) return;

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

        let watchId: number | undefined;
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    void applyPosition(pos);
                },
                () => {
                    void ping();
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 20_000,
                },
            );
        } else {
            void ping();
        }

        const interval = window.setInterval(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        void applyPosition(pos);
                    },
                    () => {
                        void ping();
                    },
                    {
                        enableHighAccuracy: true,
                        maximumAge: 0,
                        timeout: 20_000,
                    },
                );
            } else {
                void ping();
            }
        }, PRESENCE_INTERVAL_MS);

        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        void applyPosition(pos);
                    },
                    () => {
                        void ping();
                    },
                    {
                        enableHighAccuracy: true,
                        maximumAge: 0,
                        timeout: 20_000,
                    },
                );
            } else {
                void ping();
            }
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            if (watchId != null) navigator.geolocation.clearWatch(watchId);
            if (geocodeTimerRef.current) window.clearTimeout(geocodeTimerRef.current);
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [enabled]);
}
