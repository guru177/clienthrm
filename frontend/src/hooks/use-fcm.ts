import { useEffect, useRef } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging, vapidKey } from '@/lib/firebase';
import { showToast } from '@/lib/toast';
import axios from '@/lib/axios';

const FCM_TOKEN_KEY = 'fcm_device_token';

/** Returns a short human-readable device label from the user-agent. */
function getDeviceName(): string {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua)
        ? 'Edge'
        : /OPR\//.test(ua)
          ? 'Opera'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Firefox\//.test(ua)
              ? 'Firefox'
              : /Safari\//.test(ua)
                ? 'Safari'
                : 'Browser';
    const os = /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'Mac'
          : /Android/.test(ua)
            ? 'Android'
            : /iPhone|iPad/.test(ua)
              ? 'iOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : 'Unknown OS';
    return `${browser} on ${os}`;
}

/**
 * Call this on logout to remove the current device's FCM token from the server,
 * preventing push notifications to a signed-out device.
 */
export async function clearFcmToken(): Promise<void> {
    const token = localStorage.getItem(FCM_TOKEN_KEY);
    if (!token) return;
    try {
        await axios.delete('/admin/fcm-token', { data: { token } });
        localStorage.removeItem(FCM_TOKEN_KEY);
    } catch {
        // Best-effort — don't block logout
    }
}

export function useFcm() {
    const initialized = useRef(false);

    useEffect(() => {
        // Only run once, only in browser, only if Firebase messaging is available
        if (initialized.current || !messaging || !vapidKey) return;
        initialized.current = true;

        initFcm();
    }, []);
}

async function initFcm() {
    try {
        if (!messaging || typeof window === 'undefined') {
            return;
        }

        if (!('serviceWorker' in navigator) || !('Notification' in window)) {
            return;
        }

        // 1. Register service worker.
        //    The SW loads its own Firebase config via importScripts('/firebase-sw-config.js')
        //    so no postMessage handshake is needed.
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        // Wait until a service worker is active before requesting an FCM token.
        // Without this, PushManager.subscribe may fail with "no active Service Worker".
        const registration = await navigator.serviceWorker.ready;

        // 2. Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.info('[FCM] Notification permission not granted');
            return;
        }

        // 3. Get FCM token
        const token = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration,
        });

        if (!token) {
            console.warn('[FCM] No registration token available');
            return;
        }

        // 4. Save token to backend (upserts, so safe to call on every load)
        await axios.post('/admin/fcm-token', {
            token,
            device_name: getDeviceName(),
        });

        // Remember locally so clearFcmToken() can remove it on logout
        localStorage.setItem(FCM_TOKEN_KEY, token);

        // 5. Handle foreground messages → show toast
        onMessage(messaging, (payload) => {
            const title = payload.notification?.title || 'New notification';
            const body  = payload.notification?.body  || '';

            showToast({
                type:    'info',
                message: `${title}${body ? ': ' + body : ''}`,
                duration: 6000,
            });
        });

        console.info('[FCM] Push notifications initialized');
    } catch (err) {
        console.error('[FCM] Initialization error:', err);
    }
}
