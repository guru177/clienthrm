import { resolveApiBase } from '@/lib/api-base';

/** WebSocket origin for chat/biometric live feeds (works in browser, Electron file://, and remote API). */
export function resolveWsOrigin(options?: {
    preferBackendInDev?: boolean;
}): { protocol: 'ws:' | 'wss:'; host: string } {
    const apiBase = resolveApiBase();
    if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
        const root = apiBase.replace(/\/api\/?$/, '');
        const u = new URL(root.endsWith('/') ? root : `${root}/`);
        return {
            protocol: u.protocol === 'https:' ? 'wss:' : 'ws:',
            host: u.host,
        };
    }

    // Vite serves on :5174 with relative `/api`. For WebSockets, talking to the
    // API host directly is more reliable than proxying the upgrade.
    if (
        options?.preferBackendInDev &&
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        (window.location.port === '5174' || window.location.port === '5173')
    ) {
        return { protocol: 'ws:', host: '127.0.0.1:3001' };
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return { protocol, host: window.location.host };
}

export function wsUrl(
    pathWithQuery: string,
    options?: { preferBackendInDev?: boolean },
): string {
    const { protocol, host } = resolveWsOrigin(options);
    const path = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
    return `${protocol}//${host}${path}`;
}
