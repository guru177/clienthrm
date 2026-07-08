import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearToken,
    getRefreshToken,
    isAuthenticated,
    setRefreshToken,
    setToken,
} from './api';

describe('api token helpers', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('tracks authentication state via localStorage', () => {
        expect(isAuthenticated()).toBe(false);
        setToken('jwt-token');
        expect(isAuthenticated()).toBe(true);
        clearToken();
        expect(isAuthenticated()).toBe(false);
    });

    it('stores and clears refresh token', () => {
        setRefreshToken('refresh-abc');
        expect(getRefreshToken()).toBe('refresh-abc');
        clearToken();
        expect(getRefreshToken()).toBeNull();
    });
});

describe('apiFetch error handling', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('throws on invalid JSON for non-5xx responses', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response('not-json', { status: 400, statusText: 'Bad Request' }),
        );
        const { apiGet } = await import('./api');
        await expect(apiGet('/admin/users/list')).rejects.toThrow('Invalid response');
    });

    it('attaches Authorization header when token is set', async () => {
        setToken('secret-jwt');
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ success: true, data: {} }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const { apiGet } = await import('./api');
        await apiGet('/auth/me');
        const [, init] = vi.mocked(fetch).mock.calls[0];
        expect((init?.headers as Record<string, string>).Authorization).toBe(
            'Bearer secret-jwt',
        );
    });
});
