import { describe, expect, it } from 'vitest';
import { defaultAdminRoute } from './default-route';

describe('defaultAdminRoute', () => {
    it('returns dashboard when view-dashboard is granted', () => {
        expect(defaultAdminRoute((p) => p === 'view-dashboard')).toBe('/admin/dashboard');
    });

    it('falls back to next permitted route', () => {
        expect(defaultAdminRoute((p) => p === 'view-users')).toBe('/admin/users');
    });

    it('returns unauthorized when no route matches', () => {
        expect(defaultAdminRoute(() => false)).toBe('/unauthorized');
    });

    it('wildcard permission resolves to dashboard first', () => {
        expect(defaultAdminRoute(() => true)).toBe('/admin/dashboard');
    });
});
