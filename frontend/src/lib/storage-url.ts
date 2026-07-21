/** Build URL for a stored file (no JWT in query string — use cookie or Bearer fetch). */
import { apiUrl, isElectronApp, resolveApiBase } from '@/lib/api-base';

export function storageUrl(path: string | null | undefined): string {
    if (!path) return '';
    const trimmed = path.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('data:')) {
        return trimmed;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        // Legacy CloudFront / absolute S3 URLs → route through authenticated API when possible
        try {
            const u = new URL(trimmed);
            const m = u.pathname.match(
                /\/(?:hrm\/)?((?:users|chat|doctor-reports|announcements|org-notifications|desktop-updates)\/.+)$/,
            );
            if (m?.[1]) {
                return apiUrl(`/admin/files/${m[1].replace(/^\/+/, '')}`);
            }
        } catch {
            /* ignore */
        }
        return '';
    }

    let relative = trimmed;
    if (relative.startsWith('/api/admin/files/')) {
        relative = relative.slice('/api/admin/files/'.length);
    } else if (relative.startsWith('/admin/files/')) {
        relative = relative.slice('/admin/files/'.length);
    } else if (relative.startsWith('/storage/')) {
        relative = relative.slice('/storage/'.length);
    }

    return apiUrl(`/admin/files/${relative.replace(/^\/+/, '')}`);
}

/** True when img/src cannot rely on same-origin session cookies (Electron, cross-origin API). */
export function needsAuthenticatedFetch(url: string): boolean {
    if (typeof window === 'undefined' || !url) return false;
    if (isElectronApp()) return true;
    try {
        const base = resolveApiBase();
        const resolved = url.startsWith('http')
            ? url
            : `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
        const apiOrigin = base.startsWith('http') ? new URL(base).origin : window.location.origin;
        return new URL(resolved).origin !== apiOrigin && new URL(resolved).origin !== window.location.origin;
    } catch {
        return false;
    }
}

const blobCache = new Map<string, string>();

export async function authStorageFetch(url: string): Promise<Response> {
    const token = localStorage.getItem('hrm_token');
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, { headers, credentials: 'include' });
}

/** Fetch file with Bearer token and return a blob: URL (cached). Empty string means failure. */
export async function fetchAuthenticatedBlobUrl(url: string): Promise<string> {
    if (!url) return '';
    const cached = blobCache.get(url);
    if (cached) return cached;

    const res = await authStorageFetch(url);
    if (!res.ok) return '';
    const blob = await res.blob();
    if (!blob || blob.size === 0) return '';
    const blobUrl = URL.createObjectURL(blob);
    blobCache.set(url, blobUrl);
    return blobUrl;
}

/** Drop one cached blob URL (e.g. after replacing a profile photo). */
export function invalidateStorageBlobUrl(pathOrUrl: string | null | undefined): void {
    if (!pathOrUrl) return;
    const url = pathOrUrl.startsWith('http') || pathOrUrl.startsWith('/api/')
        ? pathOrUrl
        : storageUrl(pathOrUrl);
    if (!url) return;
    const cached = blobCache.get(url);
    if (cached?.startsWith('blob:')) URL.revokeObjectURL(cached);
    blobCache.delete(url);
}

export function clearStorageBlobCache(): void {
    for (const blobUrl of blobCache.values()) {
        if (blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
    }
    blobCache.clear();
}

/** External resume/document URL — HTTPS only, for careers viewer. */
export function externalHttpsUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (trimmed.startsWith('https://')) return trimmed;
    return null;
}
