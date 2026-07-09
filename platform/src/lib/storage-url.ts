import { getPlatformToken } from '@/lib/platform-api';
import { platformApiUrl, resolvePlatformApiBase } from '@/lib/api-base';

/** Build an authenticated URL for a platform-stored file (announcement banners). */
export function platformStorageUrl(path: string | null | undefined): string {
    if (!path) return '';
    const trimmed = path.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('data:')) return trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    const apiBase = resolvePlatformApiBase();
    const filesPrefix = `${apiBase.replace(/\/$/, '')}/files/`;
    if (trimmed.startsWith(filesPrefix) || trimmed.startsWith('/api/platform/files/')) {
        return appendToken(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
    }
    if (trimmed.startsWith('/storage/')) {
        return appendToken(platformApiUrl(`/files/${trimmed.slice('/storage/'.length)}`));
    }
    return appendToken(platformApiUrl(`/files/${trimmed.replace(/^\/+/, '')}`));
}

function appendToken(url: string): string {
    if (typeof window === 'undefined') return url;
    const token = getPlatformToken();
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
}
