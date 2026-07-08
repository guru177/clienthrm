import { staticAssetUrl } from '@/lib/static-asset';

type NotificationOptions = {
    title: string;
    body: string;
    tag?: string;
    onClick?: () => void;
};

const clickHandlers = new Map<string, () => void>();
let electronClickCleanup: (() => void) | undefined;

function setupElectronClickListener() {
    if (electronClickCleanup || !window.electron?.onNotificationClick) return;
    electronClickCleanup = window.electron.onNotificationClick(({ tag }) => {
        if (tag && clickHandlers.has(tag)) {
            clickHandlers.get(tag)?.();
        }
    });
}

export async function requestNotificationPermission(): Promise<void> {
    if (window.electron?.isElectron) return;
    if ('Notification' in window && Notification.permission === 'default') {
        try {
            await Notification.requestPermission();
        } catch {
            /* ignore */
        }
    }
}

export function showDesktopNotification(options: NotificationOptions): void {
    const { title, body, tag, onClick } = options;

    if (tag && onClick) {
        clickHandlers.set(tag, onClick);
        window.setTimeout(() => clickHandlers.delete(tag), 60_000);
    }

    if (window.electron?.showNotification) {
        setupElectronClickListener();
        void window.electron.showNotification({ title, body, tag });
        return;
    }

    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
        void requestNotificationPermission();
        return;
    }

    const notification = new Notification(title, {
        body,
        tag,
        icon: staticAssetUrl('favicon.png'),
    });
    notification.onclick = () => {
        window.focus();
        onClick?.();
        notification.close();
    };
}
