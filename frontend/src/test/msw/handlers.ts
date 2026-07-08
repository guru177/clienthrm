import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const API = '/api';

export const testUser = {
    id: 1,
    name: 'Test Admin',
    email: 'admin@test.local',
    is_super_admin: true,
};

export const handlers = [
    http.get(`${API}/auth/me`, () =>
        HttpResponse.json({
            success: true,
            data: {
                user: testUser,
                permissions: ['*'],
                settings: {},
                plan: { slug: 'enterprise', name: 'Enterprise', max_users: 0, modules: ['*'] },
            },
        }),
    ),
    http.post(`${API}/auth/login`, async ({ request }) => {
        const body = (await request.json()) as { email?: string; password?: string };
        if (body.email === 'bad@test.local') {
            return HttpResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
        }
        return HttpResponse.json({
            success: true,
            data: {
                token: 'test-jwt',
                refresh_token: 'test-refresh',
                user: testUser,
                permissions: ['view-dashboard', 'view-users'],
            },
        });
    }),
    http.post(`${API}/auth/logout`, () =>
        HttpResponse.json({ success: true, data: {} }),
    ),
    http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({
            success: true,
            data: { token: 'refreshed-jwt', refresh_token: 'refreshed-refresh' },
        }),
    ),
    http.get(`${API}/admin/users/list`, () =>
        HttpResponse.json({
            success: true,
            data: [{ id: 1, name: 'Alice', email: 'alice@test.local' }],
            total: 1,
        }),
    ),
    http.get(`${API}/admin/departments`, () =>
        HttpResponse.json({
            success: true,
            data: [{ id: 1, name: 'Engineering', code: 'ENG' }],
            total: 1,
        }),
    ),
];

export const server = setupServer(...handlers);
