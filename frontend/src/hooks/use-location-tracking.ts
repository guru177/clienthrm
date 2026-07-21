import { useState, useCallback, useRef } from 'react';
import axios from '@/lib/axios';

export type GeoLocationPayload = {
    lat: number;
    lng: number;
    accuracy?: number | null;
};

export type IpLocationPayload = {
    ip?: string;
    city?: string;
    region?: string;
    country?: string;
    lat?: number | null;
    lng?: number | null;
};

export type LocationPayload = {
    geo: GeoLocationPayload;
    ip: IpLocationPayload;
};

const LOCATION_TTL_MS = 90_000;
let sharedLocationCache: { at: number; data: LocationPayload } | null = null;

function cacheLocation(data: LocationPayload) {
    sharedLocationCache = { at: Date.now(), data };
}

function getCachedLocation(maxAgeMs = LOCATION_TTL_MS): LocationPayload | null {
    if (!sharedLocationCache) return null;
    if (Date.now() - sharedLocationCache.at > maxAgeMs) return null;
    return sharedLocationCache.data;
}

async function fetchIpLocation(): Promise<IpLocationPayload> {
    try {
        const ipRes = await axios.get('https://ipapi.co/json/', { timeout: 2500 });
        return {
            ip: ipRes.data.ip,
            city: ipRes.data.city,
            region: ipRes.data.region,
            country: ipRes.data.country_name,
            lat: ipRes.data.latitude,
            lng: ipRes.data.longitude,
        };
    } catch {
        return {};
    }
}

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            reject(new Error('Geolocation is not supported'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
}

export function useLocationTracking() {
    const [locationStatus, setLocationStatus] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
    const [locationLoading, setLocationLoading] = useState(false);
    const [locationData, setLocationData] = useState<LocationPayload | null>(() => getCachedLocation());
    const [error, setError] = useState<string | null>(null);
    const inFlightRef = useRef<Promise<LocationPayload | null> | null>(null);

    const requestLocation = useCallback(async (opts?: { softTimeoutMs?: number }): Promise<LocationPayload | null> => {
        const softTimeoutMs = opts?.softTimeoutMs ?? 3500;
        const cached = getCachedLocation();
        if (cached) {
            setLocationData(cached);
            setLocationStatus('granted');
            // Refresh quietly in background; don't block punch.
            void (async () => {
                try {
                    const pos = await getPosition({
                        enableHighAccuracy: false,
                        timeout: 5000,
                        maximumAge: 60_000,
                    });
                    const geo = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                    };
                    const payload = { geo, ip: cached.ip ?? {} };
                    cacheLocation(payload);
                    setLocationData(payload);
                    void fetchIpLocation().then((ip) => {
                        const next = { geo, ip: Object.keys(ip).length ? ip : payload.ip };
                        cacheLocation(next);
                        setLocationData(next);
                    });
                } catch {
                    /* keep cache */
                }
            })();
            return cached;
        }

        if (inFlightRef.current) {
            return inFlightRef.current;
        }

        setLocationLoading(true);
        setLocationStatus('pending');
        setError(null);

        const work = (async (): Promise<LocationPayload | null> => {
            if (!('geolocation' in navigator)) {
                setError('Geolocation is not supported by your browser.');
                setLocationStatus('denied');
                setLocationLoading(false);
                return null;
            }

            const attempts: PositionOptions[] = [
                { enableHighAccuracy: false, timeout: softTimeoutMs, maximumAge: 120_000 },
                { enableHighAccuracy: true, timeout: softTimeoutMs + 1500, maximumAge: 30_000 },
            ];

            for (const options of attempts) {
                try {
                    const pos = await getPosition(options);
                    const geo = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                    };
                    const payload: LocationPayload = { geo, ip: {} };
                    cacheLocation(payload);
                    setLocationData(payload);
                    setLocationStatus('granted');
                    setLocationLoading(false);
                    void fetchIpLocation().then((ip) => {
                        if (!Object.keys(ip).length) return;
                        const next = { geo, ip };
                        cacheLocation(next);
                        setLocationData(next);
                    });
                    return payload;
                } catch {
                    /* try next */
                }
            }

            setError('Location permission denied or unavailable. You can still proceed without exact location.');
            setLocationStatus('denied');
            setLocationLoading(false);
            return null;
        })();

        inFlightRef.current = work.finally(() => {
            inFlightRef.current = null;
        });
        return inFlightRef.current;
    }, []);

    return {
        locationStatus,
        locationLoading,
        locationData,
        error,
        requestLocation,
    };
}
