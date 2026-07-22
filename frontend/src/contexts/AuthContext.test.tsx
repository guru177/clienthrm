import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/handlers';

vi.mock('@/lib/navigate-login', () => ({
    navigateToLogin: vi.fn(),
}));

import { AuthProvider, useAuth } from './AuthContext';

function AuthProbe() {
    const { user, loading, hasPermission, logout } = useAuth();
    if (loading) return <div>Loading</div>;
    return (
        <div>
            <span data-testid="user-email">{user?.email ?? 'none'}</span>
            <span data-testid="can-view-users">{hasPermission('view-users') ? 'yes' : 'no'}</span>
            <button type="button" onClick={() => logout()}>
                Logout
            </button>
        </div>
    );
}

describe('AuthContext', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('loads user when token exists on mount', async () => {
        localStorage.setItem('hrm_token', 'existing-token');
        render(
            <MemoryRouter>
                <AuthProvider>
                    <AuthProbe />
                </AuthProvider>
            </MemoryRouter>,
        );
        await waitFor(
            () => {
                expect(screen.getByTestId('user-email').textContent).toBe('admin@test.local');
            },
            { timeout: 8_000 },
        );
    });

    it('login stores token and permissions', async () => {
        let loginFn: ReturnType<typeof useAuth>['login'] | undefined;
        function LoginTrigger() {
            const auth = useAuth();
            loginFn = auth.login;
            return null;
        }
        render(
            <MemoryRouter>
                <AuthProvider>
                    <LoginTrigger />
                    <AuthProbe />
                </AuthProvider>
            </MemoryRouter>,
        );
        await waitFor(() => expect(loginFn).toBeDefined(), { timeout: 8_000 });
        await loginFn!('admin@test.local', 'secret');
        await waitFor(() => {
            expect(localStorage.getItem('hrm_token')).toBe('test-jwt');
            expect(localStorage.getItem('hrm_refresh_token')).toBe('test-refresh');
        });
    });

    it('logout clears session', async () => {
        localStorage.setItem('hrm_token', 'existing-token');
        localStorage.setItem('hrm_refresh_token', 'refresh');
        render(
            <MemoryRouter>
                <AuthProvider>
                    <AuthProbe />
                </AuthProvider>
            </MemoryRouter>,
        );
        await waitFor(
            () => expect(screen.getByTestId('user-email').textContent).toBe('admin@test.local'),
            { timeout: 8_000 },
        );
        screen.getByRole('button', { name: /logout/i }).click();
        await waitFor(() => {
            expect(localStorage.getItem('hrm_token')).toBeNull();
        });
    });

    it('hasPermission respects wildcard', async () => {
        localStorage.setItem('hrm_token', 'existing-token');
        render(
            <MemoryRouter>
                <AuthProvider>
                    <AuthProbe />
                </AuthProvider>
            </MemoryRouter>,
        );
        await waitFor(
            () => expect(screen.getByTestId('can-view-users').textContent).toBe('yes'),
            { timeout: 8_000 },
        );
    });

    it('handles failed /auth/me by clearing token', async () => {
        server.use(
            http.get('/api/auth/me', () =>
                HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
            ),
        );
        localStorage.setItem('hrm_token', 'stale-token');
        render(
            <MemoryRouter>
                <AuthProvider>
                    <AuthProbe />
                </AuthProvider>
            </MemoryRouter>,
        );
        await waitFor(
            () => {
                expect(screen.getByTestId('user-email').textContent).toBe('none');
                expect(localStorage.getItem('hrm_token')).toBeNull();
            },
            { timeout: 8_000 },
        );
    });

    it('keeps token when /auth/me fails transiently', async () => {
        server.use(
            http.get('/api/auth/me', () =>
                HttpResponse.json({ message: 'timeout' }, { status: 408 }),
            ),
        );
        localStorage.setItem('hrm_token', 'still-valid-token');
        render(
            <MemoryRouter>
                <AuthProvider>
                    <AuthProbe />
                </AuthProvider>
            </MemoryRouter>,
        );
        await waitFor(
            () => expect(screen.getByTestId('user-email').textContent).toBe('none'),
            { timeout: 8_000 },
        );
        expect(localStorage.getItem('hrm_token')).toBe('still-valid-token');
    });

    it('keeps token when /auth/me returns 403 (session valid, permission narrow)', async () => {
        // Regression for QA-DEEP-AUDIT-2026-07-22: a transient 403 from /auth/me
        // must NOT clear the token. Only a definitive 401 should nuke the session.
        server.use(
            http.get('/api/auth/me', () =>
                HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
            ),
        );
        localStorage.setItem('hrm_token', 'session-still-valid');
        render(
            <MemoryRouter>
                <AuthProvider>
                    <AuthProbe />
                </AuthProvider>
            </MemoryRouter>,
        );
        await waitFor(
            () => expect(screen.getByTestId('user-email').textContent).toBe('none'),
            { timeout: 8_000 },
        );
        expect(localStorage.getItem('hrm_token')).toBe('session-still-valid');
    });
});
