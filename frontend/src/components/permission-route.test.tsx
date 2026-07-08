import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PermissionRoute } from './permission-route';

const mockAuth = vi.hoisted(() => ({
    user: null as null | { id: number },
    loading: false,
    hasPermission: vi.fn((_slug: string) => false),
    planModules: [] as string[],
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => mockAuth,
}));

vi.mock('@/lib/plan-modules', () => ({
    isModuleAllowed: (modules: string[], module: string) =>
        modules.includes('*') || modules.includes(module),
}));

function renderRoute(permission?: string) {
    return render(
        <MemoryRouter initialEntries={['/protected']}>
            <Routes>
                <Route
                    path="/protected"
                    element={
                        <PermissionRoute permission={permission}>
                            <div>Protected content</div>
                        </PermissionRoute>
                    }
                />
                <Route path="/login" element={<div>Login page</div>} />
                <Route path="/unauthorized" element={<div>Unauthorized</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('PermissionRoute', () => {
    it('redirects unauthenticated users to login', () => {
        mockAuth.user = null;
        mockAuth.loading = false;
        renderRoute('view-users');
        expect(screen.getByText('Login page')).toBeTruthy();
    });

    it('redirects when permission is missing', () => {
        mockAuth.user = { id: 1 };
        mockAuth.hasPermission.mockReturnValue(false);
        renderRoute('view-users');
        expect(screen.getByText('Unauthorized')).toBeTruthy();
    });

    it('renders children when permission is granted', () => {
        mockAuth.user = { id: 1 };
        mockAuth.hasPermission.mockImplementation((slug: string) => slug === 'view-users');
        renderRoute('view-users');
        expect(screen.getByText('Protected content')).toBeTruthy();
    });
});
