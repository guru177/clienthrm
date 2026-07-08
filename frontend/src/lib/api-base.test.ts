import { describe, expect, it } from 'vitest';
import { apiUrl, resolveApiBase } from './api-base';

describe('api-base', () => {
    it('resolves relative API base in jsdom', () => {
        expect(resolveApiBase()).toBe('/api');
    });

    it('builds paths under the API base', () => {
        expect(apiUrl('/auth/login')).toBe('/api/auth/login');
        expect(apiUrl('auth/login')).toBe('/api/auth/login');
    });
});
