/** Build an authenticated URL for a stored file (photos, chat attachments, logos). */
import { apiUrl } from '@/lib/api-base';

export function storageUrl(path: string | null | undefined): string {
    if (!path) return '';
    const trimmed = path.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('data:')) {
        return trimmed;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
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

    return appendToken(apiUrl(`/admin/files/${relative.replace(/^\/+/, '')}`));
}

/** External resume/document URL — HTTPS only, for careers viewer. */
export function externalHttpsUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (trimmed.startsWith('https://')) return trimmed;
    return null;
}

function appendToken(url: string): string {
    if (typeof window === 'undefined') return url;
    const token = localStorage.getItem('hrm_token');
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
}
