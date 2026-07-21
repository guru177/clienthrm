import { describe, expect, it } from 'vitest';
import { canAccessNavItem, resolveMobileTabs } from './admin-nav';

describe('resolveMobileTabs', () => {
    it('puts Home first when dashboard is allowed', () => {
        const { tabs } = resolveMobileTabs(
            ['view-dashboard', 'view-leave-requests', 'view-my-payslips'],
            ['dashboard', 'leave', 'my_payslips'],
        );
        expect(tabs.map((t) => t.id)).toEqual(['home', 'leave', 'payslips']);
        expect(tabs[0]?.href).toBe('/admin/dashboard');
    });

    it('returns only tabs allowed by permission and plan module', () => {
        const { tabs } = resolveMobileTabs(
            ['view-attendance', 'view-leave-requests'],
            ['attendance', 'leave'],
        );
        expect(tabs.map((t) => t.id)).toEqual(['leave', 'clock']);
    });

    it('hides attendance when module not on plan', () => {
        const { tabs } = resolveMobileTabs(
            ['view-attendance', 'view-leave-requests', 'view-my-payslips'],
            ['leave', 'my_payslips'],
        );
        expect(tabs.map((t) => t.id)).toEqual(['leave', 'payslips']);
    });

    it('does not include team tab in bottom bar', () => {
        const { tabs } = resolveMobileTabs(
            ['approve-leave-requests', 'view-dashboard'],
            ['leave_manage', 'dashboard'],
        );
        expect(tabs.map((t) => t.id)).not.toContain('team');
        expect(tabs.map((t) => t.id)).toContain('home');
    });

    it('caps at four primary tabs', () => {
        const { tabs } = resolveMobileTabs(['*'], [
            'dashboard',
            'attendance',
            'leave',
            'my_payslips',
            'leave_manage',
            'my_doctor_reports',
            'chat',
        ]);
        expect(tabs).toHaveLength(4);
        expect(tabs[0]?.id).toBe('home');
        expect(tabs.map((t) => t.id)).not.toContain('team');
    });

    it('falls back to sidebar links when no primary candidates match', () => {
        const { tabs } = resolveMobileTabs(['view-jobs'], ['careers', 'job_applications']);
        expect(tabs.length).toBeGreaterThan(0);
        expect(tabs[0]?.href).toBe('/admin/careers');
    });
});

describe('canAccessNavItem', () => {
    it('requires both module and permission', () => {
        expect(
            canAccessNavItem(['view-payroll'], ['payroll'], 'payroll', 'view-payroll'),
        ).toBe(true);
        expect(
            canAccessNavItem(['view-payroll'], [], 'payroll', 'view-payroll'),
        ).toBe(false);
        expect(
            canAccessNavItem([], ['payroll'], 'payroll', 'view-payroll'),
        ).toBe(false);
    });
});
