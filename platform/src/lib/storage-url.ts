import { getPlatformToken } from '@/lib/platform-api';

/** Build an authenticated URL for a platform-stored file (announcement banners). */
export function platformStorageUrl(path: string | null | undefined): string {
    if (!path) return '';
    const trimmed = path.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('data:')) return trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('/api/platform/files/')) {
        return appendToken(trimmed);
    }
    if (trimmed.startsWith('/storage/')) {
        return appendToken(`/api/platform/files/${trimmed.slice('/storage/'.length)}`);
    }
    return appendToken(`/api/platform/files/${trimmed.replace(/^\/+/, '')}`);
}

function appendToken(url: string): string {
    if (typeof window === 'undefined') return url;
    const token = getPlatformToken();
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
}
