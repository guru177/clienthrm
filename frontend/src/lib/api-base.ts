/** True when running inside the HR Daddy Electron shell. */
export function isElectronApp(): boolean {
    return typeof window !== 'undefined' && !!window.electron?.isElectron;
}

function normalizeApiBase(raw: string): string {
    const trimmed = raw.trim().replace(/\/$/, '');
    if (!trimmed) return '/api';
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function isLocalApiUrl(raw: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(raw.trim());
}

function bakedProductionApiBase(): string | null {
    const fromEnv = import.meta.env.VITE_API_URL;
    if (typeof fromEnv === 'string' && fromEnv.trim() && !isLocalApiUrl(fromEnv)) {
        return normalizeApiBase(fromEnv);
    }
    return null;
}

/** Resolve API base URL for browser dev, production web, and Electron desktop. */
export function resolveApiBase(): string {
    const productionFallback = bakedProductionApiBase();

    if (typeof window !== 'undefined') {
        const { protocol, hostname, port } = window.location;
        const desktopShell =
            isElectronApp() || protocol === 'file:' || protocol === 'hrm:';

        if (desktopShell) {
            const fromDesktop = window.electron?.getApiBase?.();
            if (typeof fromDesktop === 'string' && fromDesktop.trim()) {
                const normalized = normalizeApiBase(fromDesktop);
                // Packaged desktop builds ship a live API URL; ignore stale localhost config.
                if (!(productionFallback && isLocalApiUrl(normalized))) {
                    return normalized;
                }
            }
            if (productionFallback) {
                return productionFallback;
            }
            if (typeof fromDesktop === 'string' && fromDesktop.trim()) {
                return normalizeApiBase(fromDesktop);
            }
        }

        if (
            (hostname === 'localhost' || hostname === '127.0.0.1') &&
            (port === '5174' || port === '5173')
        ) {
            return '/api';
        }
    }

    if (productionFallback) {
        return productionFallback;
    }

    if (typeof window === 'undefined') {
        return '/api';
    }

    return '/api';
}

/** Build a full API URL for a path like `/auth/login` or `/admin/releases`. */
export function apiUrl(path: string): string {
    const base = resolveApiBase();
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (base.startsWith('http://') || base.startsWith('https://')) {
        return `${base}${normalized}`;
    }
    return `${base}${normalized}`;
}
