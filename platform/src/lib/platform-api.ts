const API_BASE = '/api/platform';

const PLATFORM_TOKEN_KEY = 'hrm_platform_token';

export function getPlatformToken(): string | null {
    return localStorage.getItem(PLATFORM_TOKEN_KEY);
}

export function setPlatformToken(token: string) {
    localStorage.setItem(PLATFORM_TOKEN_KEY, token);
}

export function clearPlatformToken() {
    localStorage.removeItem(PLATFORM_TOKEN_KEY);
}

export function isPlatformAuthenticated(): boolean {
    return !!getPlatformToken();
}

async function platformFetch<T>(
    path: string,
    options: RequestInit = {},
): Promise<{ success: boolean; data: T; message?: string }> {
    const token = getPlatformToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(json.message || `Request failed (${response.status})`);
    }
    return json;
}

export async function platformGet<T>(path: string) {
    return platformFetch<T>(path);
}

export async function platformPost<T>(path: string, body?: unknown) {
    return platformFetch<T>(path, {
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
}

export async function platformPatch<T>(path: string, body: unknown) {
    return platformFetch<T>(path, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });
}

export async function platformPut<T>(path: string, body: unknown) {
    return platformFetch<T>(path, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
}

export async function platformDelete<T>(path: string) {
    return platformFetch<T>(path, { method: 'DELETE' });
}

export async function platformUpload<T>(path: string, formData: FormData) {
    const token = getPlatformToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: formData,
    });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(json.message || `Upload failed (${response.status})`);
    }
    return json as { success: boolean; data: T; message?: string };
}
