import { useEffect, useRef, useState } from 'react';
import { wsUrl } from '@/lib/ws-base';

export type BiometricLiveEvent = {
    type: string;
    ts?: string;
    serial_number?: string;
    ip_address?: string;
    last_heartbeat?: string;
    count?: number;
    message?: string;
};

type Options = {
    enabled?: boolean;
    onEvent: (event: BiometricLiveEvent) => void;
};

/**
 * WebSocket live feed from HRM backend when device syncs (heartbeat / punches).
 * Auto-reconnects — keeps the admin UI in sync without manual refresh.
 */
export function useBiometricLive({ enabled = true, onEvent }: Options) {
    const [connected, setConnected] = useState(false);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    useEffect(() => {
        if (!enabled) return;

        const token = localStorage.getItem('hrm_token');
        if (!token) return;

        let ws: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let closed = false;

        const connect = () => {
            if (closed) return;
            // Prefer backend origin in local Vite so WS does not depend on the
            // HTTP proxy upgrade path (avoids flaky "closed before established").
            const url = wsUrl(`/api/admin/biometric/ws?token=${encodeURIComponent(token)}`, {
                preferBackendInDev: true,
            });
            ws = new WebSocket(url);

            ws.onopen = () => {
                if (!closed) setConnected(true);
            };

            ws.onmessage = (ev) => {
                try {
                    const data = JSON.parse(ev.data as string) as BiometricLiveEvent;
                    onEventRef.current(data);
                } catch {
                    /* ignore */
                }
            };

            ws.onclose = () => {
                setConnected(false);
                if (!closed) {
                    reconnectTimer = setTimeout(connect, 2500);
                }
            };

            ws.onerror = () => {
                // Closing a still-connecting socket triggers browser console noise;
                // only close after an error if we intend to reconnect.
                if (!closed && ws && ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            };
        };

        connect();

        return () => {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            const socket = ws;
            ws = null;
            if (socket) {
                socket.onopen = null;
                socket.onmessage = null;
                socket.onerror = null;
                socket.onclose = null;
                if (socket.readyState === WebSocket.CONNECTING) {
                    // Defer close until open to avoid "closed before established".
                    socket.addEventListener('open', () => {
                        try {
                            socket.close();
                        } catch {
                            /* ignore */
                        }
                    });
                } else if (
                    socket.readyState === WebSocket.OPEN ||
                    socket.readyState === WebSocket.CLOSING
                ) {
                    try {
                        socket.close();
                    } catch {
                        /* ignore */
                    }
                }
            }
            setConnected(false);
        };
    }, [enabled]);

    return { connected };
}

/** Device is "online" if heartbeat within the last N minutes (BIO-PARK polls every few min). */
export const DEVICE_ONLINE_MS = 10 * 60 * 1000;

export function isDeviceOnline(lastHeartbeat: string | null): boolean {
    if (!lastHeartbeat) return false;
    const t = new Date(lastHeartbeat.includes('T') ? lastHeartbeat : `${lastHeartbeat.replace(' ', 'T')}Z`);
    return Date.now() - t.getTime() < DEVICE_ONLINE_MS;
}
