/** True when running inside the Raintech HRM Electron shell. */
export function isElectronApp(): boolean {
    return typeof window !== 'undefined' && !!window.electron?.isElectron;
}

function normalizeApiBase(raw: string): string {
    const trimmed = raw.trim().replace(/\/$/, '');
    if (!trimmed) return '/api';
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

/** Resolve API base URL for browser dev, production web, and Electron desktop. */
export function resolveApiBase(): string {
    const fromEnv = import.meta.env.VITE_API_URL;
    if (typeof fromEnv === 'string' && fromEnv.trim()) {
        return normalizeApiBase(fromEnv);
    }

    if (typeof window === 'undefined') {
        return '/api';
    }

    const { protocol, hostname, port } = window.location;

    // Vite dev server proxies /api → backend.
    if (
        (hostname === 'localhost' || hostname === '127.0.0.1') &&
        port === '5174'
    ) {
        return '/api';
    }

    // Packaged Electron (file://) or explicit desktop shell → direct backend.
    if (isElectronApp() || protocol === 'file:') {
        return 'http://127.0.0.1:3001/api';
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
