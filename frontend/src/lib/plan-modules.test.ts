import { describe, expect, it } from 'vitest';
import { isModuleAllowed } from './plan-modules';

describe('isModuleAllowed', () => {
    it('allows any module when key is omitted', () => {
        expect(isModuleAllowed([], undefined)).toBe(true);
    });

    it('denies when plan modules empty', () => {
        expect(isModuleAllowed([], 'payroll')).toBe(false);
    });

    it('allows included module', () => {
        expect(isModuleAllowed(['dashboard', 'users'], 'users')).toBe(true);
    });

    it('denies missing module', () => {
        expect(isModuleAllowed(['dashboard'], 'payroll')).toBe(false);
    });
});
