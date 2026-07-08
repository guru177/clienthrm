import { apiUrl } from '@/lib/api-base';
import { navigateToLogin } from '@/lib/navigate-login';

/** Get JWT token from localStorage */
function getToken(): string | null {
    return localStorage.getItem('hrm_token');
}

/** Set JWT token */
export function setToken(token: string) {
    localStorage.setItem('hrm_token', token);
}

/** Clear JWT token */
export function clearToken() {
    localStorage.removeItem('hrm_token');
    localStorage.removeItem('hrm_refresh_token');
    import('@/lib/storage-url').then((m) => m.clearStorageBlobCache()).catch(() => {});
}

export function setRefreshToken(token: string) {
    localStorage.setItem('hrm_refresh_token', token);
}

export function getRefreshToken(): string | null {
    return localStorage.getItem('hrm_refresh_token');
}

/** Check if user is authenticated */
export function isAuthenticated(): boolean {
    return !!getToken();
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
    const refresh = getRefreshToken();
    if (!refresh) return false;
    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            try {
                const res = await fetch(apiUrl('/auth/refresh'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ refresh_token: refresh }),
                });
                if (!res.ok) return false;
                const json = await res.json();
                const newToken = json?.data?.token;
                const newRefresh = json?.data?.refresh_token;
                if (!newToken) return false;
                setToken(newToken);
                if (newRefresh) setRefreshToken(newRefresh);
                return true;
            } catch {
                return false;
            } finally {
                refreshInFlight = null;
            }
        })();
    }
    return refreshInFlight;
}

/** Core fetch wrapper with JWT */
async function apiFetch<T = any>(
    path: string,
    options: RequestInit = {},
    retried = false,
): Promise<{ success: boolean; data: T; type?: string; message?: string; total?: number }> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(apiUrl(path), {
        ...options,
        credentials: 'include',
        headers,
    });

    if (response.status === 401 && !retried && !path.startsWith('/auth/')) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
            return apiFetch<T>(path, options, true);
        }
        clearToken();
        navigateToLogin();
        throw new Error('Unauthorized');
    }

    const text = await response.text();
    let json: { success?: boolean; data?: T; type?: string; message?: string; total?: number } = {};
    if (text) {
        try {
            json = JSON.parse(text);
        } catch {
            throw new Error(
                response.status >= 500
                    ? 'Backend unavailable. Start the API server on port 3001 and try again.'
                    : 'Invalid response from server',
            );
        }
    } else if (!response.ok) {
        throw new Error(
            response.status === 502 || response.status === 503 || response.status === 500
                ? 'Backend unavailable. Start the API server on port 3001 and try again.'
                : `API error: ${response.status}`,
        );
    }

    if (!response.ok) {
        throw new Error(
            json.message
                || (response.status >= 500
                    ? 'Backend unavailable. Start the API server on port 3001 and try again.'
                    : `API error: ${response.status}`),
        );
    }

    return json as { success: boolean; data: T; type?: string; message?: string; total?: number };
}

/** GET request */
export async function apiGet<T = any>(path: string, params?: Record<string, string | number | undefined>): Promise<{ success: boolean; data: T; total?: number }> {
    let url = path;
    if (params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== '') {
                searchParams.set(key, String(value));
            }
        });
        const qs = searchParams.toString();
        if (qs) url += `?${qs}`;
    }
    return apiFetch<T>(url);
}

/** POST request */
export async function apiPost<T = any>(path: string, body?: any): Promise<{ success: boolean; data: T }> {
    return apiFetch<T>(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
    });
}

/** PUT request */
export async function apiPut<T = any>(path: string, body?: any): Promise<{ success: boolean; data: T }> {
    return apiFetch<T>(path, {
        method: 'PUT',
        body: body ? JSON.stringify(body) : undefined,
    });
}

/** PATCH request */
export async function apiPatch<T = any>(path: string, body?: any): Promise<{ success: boolean; data: T }> {
    return apiFetch<T>(path, {
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined,
    });
}

/** DELETE request */
export async function apiDelete<T = any>(path: string): Promise<{ success: boolean; data: T }> {
    return apiFetch<T>(path, { method: 'DELETE' });
}

/** Multipart upload (no JSON Content-Type) */
export async function apiUpload<T = any>(path: string, formData: FormData): Promise<{ success: boolean; data: T }> {
    const token = getToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(apiUrl(path), { method: 'POST', headers, body: formData });
    const text = await response.text();
    let json: { success?: boolean; data?: T; message?: string } = {};
    if (text) {
        try {
            json = JSON.parse(text);
        } catch {
            throw new Error('Invalid response from server');
        }
    }

    if (!response.ok) {
        throw new Error(json.message || `Upload failed (${response.status})`);
    }

    return json as { success: boolean; data: T };
}

export interface AttendanceRegisterParams {
    start_date: string;
    end_date: string;
    /** Alias for start_date */
    from_date?: string;
    /** Alias for end_date */
    to_date?: string;
    department_id?: number;
    search?: string;
}

/** Fetch book-style attendance register matrix for a date range. */
export async function fetchAttendanceRegister(params: AttendanceRegisterParams) {
    const query: Record<string, string | number> = {
        start_date: params.start_date ?? params.from_date ?? '',
        end_date: params.end_date ?? params.to_date ?? '',
    };
    if (params.department_id != null) query.department_id = params.department_id;
    if (params.search) query.search = params.search;
    return apiGet('/admin/reports/attendance-register', query);
}

/** Fetch salary split report for a payroll month. */
export async function fetchPayrollSplit(month: number, year: number) {
    return apiGet('/admin/reports/payroll-split', { month, year });
}
