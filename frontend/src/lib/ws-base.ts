import { resolveApiBase } from '@/lib/api-base';

/** WebSocket origin for chat/biometric live feeds (works in browser, Electron file://, and remote API). */
export function resolveWsOrigin(): { protocol: 'ws:' | 'wss:'; host: string } {
    const apiBase = resolveApiBase();
    if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
        const root = apiBase.replace(/\/api\/?$/, '');
        const u = new URL(root.endsWith('/') ? root : `${root}/`);
        return {
            protocol: u.protocol === 'https:' ? 'wss:' : 'ws:',
            host: u.host,
        };
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return { protocol, host: window.location.host };
}

export function wsUrl(pathWithQuery: string): string {
    const { protocol, host } = resolveWsOrigin();
    const path = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
    return `${protocol}//${host}${path}`;
}
