import { useEffect, useRef, useCallback } from 'react';
import { wsUrl } from '@/lib/ws-base';

type ChatWsHandler = (event: Record<string, unknown>) => void;

const RECONNECT_MS = 3000;

let sharedWs: WebSocket | null = null;
let sharedReconnectTimer: ReturnType<typeof setTimeout> | undefined;
let subscriberCount = 0;
let connectEnabled = false;
const handlers = new Set<ChatWsHandler>();

function broadcast(data: Record<string, unknown>) {
    handlers.forEach((handler) => {
        try {
            handler(data);
        } catch {
            /* ignore handler errors */
        }
    });
}

function connect() {
    if (!connectEnabled) return;
    const token = localStorage.getItem('hrm_token');
    if (!token) return;

    if (
        sharedWs &&
        (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)
    ) {
        return;
    }

    const url = wsUrl(`/api/admin/chat/ws?token=${encodeURIComponent(token)}`);
    const ws = new WebSocket(url);
    sharedWs = ws;

    ws.onmessage = (ev) => {
        try {
            const data = JSON.parse(ev.data as string) as Record<string, unknown>;
            broadcast(data);
        } catch {
            /* ignore */
        }
    };

    ws.onclose = () => {
        if (sharedWs === ws) {
            sharedWs = null;
        }
        if (!connectEnabled) return;
        sharedReconnectTimer = setTimeout(connect, RECONNECT_MS);
    };
}

function disconnect() {
    if (sharedReconnectTimer) {
        clearTimeout(sharedReconnectTimer);
        sharedReconnectTimer = undefined;
    }
    if (sharedWs) {
        sharedWs.onclose = null;
        if (sharedWs.readyState === WebSocket.OPEN) {
            sharedWs.close();
        }
        sharedWs = null;
    }
}

function subscribe(handler: ChatWsHandler) {
    handlers.add(handler);
    subscriberCount += 1;
    connectEnabled = true;
    connect();
    return () => {
        handlers.delete(handler);
        subscriberCount -= 1;
        if (subscriberCount === 0) {
            connectEnabled = false;
            disconnect();
        }
    };
}

export function useChatWs(onEvent: ChatWsHandler, enabled = true) {
    const handlerRef = useRef(onEvent);
    handlerRef.current = onEvent;

    const stableHandler = useCallback((data: Record<string, unknown>) => {
        handlerRef.current(data);
    }, []);

    useEffect(() => {
        if (!enabled) return;
        return subscribe(stableHandler);
    }, [enabled, stableHandler]);

    const sendTyping = useCallback((spaceId: number) => {
        if (sharedWs?.readyState === WebSocket.OPEN) {
            sharedWs.send(JSON.stringify({ type: 'typing', space_id: spaceId }));
        }
    }, []);

    return { sendTyping };
}
