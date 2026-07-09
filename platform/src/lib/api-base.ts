function normalizePlatformApiBase(raw: string): string {
    const trimmed = raw.trim().replace(/\/$/, '');
    if (!trimmed) return '/api/platform';
    if (trimmed.endsWith('/api/platform')) return trimmed;
    if (trimmed.endsWith('/api')) return `${trimmed}/platform`;
    return `${trimmed}/api/platform`;
}

function isLocalApiUrl(raw: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(raw.trim());
}

function bakedProductionApiBase(): string | null {
    const fromEnv = import.meta.env.VITE_API_URL;
    if (typeof fromEnv === 'string' && fromEnv.trim() && !isLocalApiUrl(fromEnv)) {
        return normalizePlatformApiBase(fromEnv);
    }
    return null;
}

/** Resolve platform API base for dev proxy and production builds. */
export function resolvePlatformApiBase(): string {
    const productionFallback = bakedProductionApiBase();

    if (typeof window !== 'undefined') {
        const { hostname, port } = window.location;
        if (
            (hostname === 'localhost' || hostname === '127.0.0.1') &&
            (port === '5175' || port === '5173')
        ) {
            return '/api/platform';
        }
    }

    if (productionFallback) {
        return productionFallback;
    }

    return '/api/platform';
}

/** Build a full platform API URL for a path like `/auth/login`. */
export function platformApiUrl(path: string): string {
    const base = resolvePlatformApiBase();
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (base.startsWith('http://') || base.startsWith('https://')) {
        return `${base}${normalized}`;
    }
    return `${base}${normalized}`;
}
