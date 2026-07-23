const STORAGE_KEY = 'hrm_offline_punch_queue_v1';

export type OfflinePunchType = 'clock-in' | 'clock-out';

export type OfflinePunchItem = {
    id: string;
    type: OfflinePunchType;
    ts: string;
    payload: Record<string, unknown>;
    /** Set when sync failed for a non-network reason; punch stays queued for retry. */
    lastError?: string;
    failedAt?: string;
};

function readQueue(): OfflinePunchItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as OfflinePunchItem[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeQueue(items: OfflinePunchItem[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hrm-offline-punch-changed'));
    }
}

export function getOfflinePunchQueue(): OfflinePunchItem[] {
    return readQueue();
}

export function getOfflinePunchCount(): number {
    return readQueue().length;
}

export function enqueueOfflinePunch(
    type: OfflinePunchType,
    payload: Record<string, unknown> = {},
): OfflinePunchItem {
    const item: OfflinePunchItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        ts: new Date().toISOString(),
        payload,
    };
    const queue = readQueue();
    queue.push(item);
    writeQueue(queue);
    return item;
}

export function clearOfflinePunchQueue() {
    writeQueue([]);
}

export function removeOfflinePunch(id: string) {
    writeQueue(readQueue().filter((item) => item.id !== id));
}

export function markOfflinePunchFailed(id: string, errorMessage: string) {
    writeQueue(
        readQueue().map((item) =>
            item.id === id
                ? {
                      ...item,
                      lastError: errorMessage,
                      failedAt: new Date().toISOString(),
                  }
                : item,
        ),
    );
}

export function isNetworkError(error: unknown): boolean {
    if (!navigator.onLine) return true;
    if (!error || typeof error !== 'object') return false;
    const err = error as { code?: string; message?: string; response?: unknown };
    if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
    if (!err.response && typeof err.message === 'string') {
        return /network|offline|failed to fetch/i.test(err.message);
    }
    return false;
}
