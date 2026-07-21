/**
 * Visit all tenant module UI routes (MODULE_CATALOG).
 * Run: node scripts/test-all-24-modules-ui.mjs
 */
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import { dismissAnnouncements, ensureLoggedIn, loginTenant } from '../frontend/scripts/playwright-helpers.mjs';

const BASE = process.env.FE_URL || 'http://localhost:5174';
const EMAIL = process.env.HRM_EMAIL || 'info@retaildaddy.in';
const PASSWORD = process.env.HRM_PASSWORD || 'Guru!1234';
const ORG_SLUG = process.env.HRM_ORG_SLUG || 'mashuptech';
const LOGIN = { base: BASE, email: EMAIL, password: PASSWORD, orgSlug: ORG_SLUG };
const EXPECTED_MODULE_COUNT = 31;

const MODULES = [
    { key: 'dashboard', label: 'Dashboard', path: '/admin/dashboard' },
    { key: 'users', label: 'Users & Roles', path: '/admin/users' },
    { key: 'centers', label: 'Centers', path: '/admin/centers' },
    { key: 'departments', label: 'Departments', path: '/admin/departments' },
    { key: 'designations', label: 'Designations', path: '/admin/designations' },
    { key: 'careers', label: 'Job Postings', path: '/admin/careers' },
    { key: 'job_applications', label: 'Applications', path: '/admin/job-applications' },
    { key: 'chat', label: 'Team Chat', path: '/admin/chat' },
    { key: 'attendance', label: 'Attendance', path: '/admin/attendance' },
    { key: 'shifts', label: 'Shifts', path: '/admin/shifts' },
    { key: 'biometric', label: 'Biometric Devices', path: '/admin/biometric' },
    { key: 'manual_attendance', label: 'Manual Attendance', path: '/admin/manual-attendance' },
    { key: 'leave', label: 'Leave Requests', path: '/admin/leave-requests' },
    { key: 'leave_manage', label: 'Manage Leave', path: '/admin/leave-requests/manage' },
    { key: 'holidays', label: 'Holidays', path: '/admin/holidays' },
    { key: 'payroll', label: 'Salaries & Payroll', path: '/admin/payroll' },
    { key: 'my_payslips', label: 'My Payslips', path: '/admin/my-payslips' },
    { key: 'doctor_reports', label: 'Doctor Reports', path: '/admin/doctor-reports' },
    { key: 'my_doctor_reports', label: 'My Doctor Reports', path: '/admin/my-doctor-reports' },
    { key: 'grocery_benefits', label: 'Grocery Benefits', path: '/admin/grocery-benefits' },
    { key: 'my_grocery_benefits', label: 'My Grocery Benefits', path: '/admin/my-grocery-benefits' },
    { key: 'assets', label: 'Assets & Maintenance', path: '/admin/assets' },
    { key: 'my_assets', label: 'My Assets', path: '/admin/my-assets' },
    { key: 'workflows', label: 'Workflows', path: '/admin/workflows' },
    { key: 'tasks', label: 'Tasks & Activities', path: '/admin/tasks' },
    { key: 'projects', label: 'Projects', path: '/admin/projects' },
    { key: 'reports', label: 'Reports', path: '/admin/reports' },
    { key: 'subscription', label: 'Subscription', path: '/admin/subscription' },
    { key: 'notifications', label: 'Notifications', path: '/admin/notifications' },
    { key: 'support', label: 'Support', path: '/admin/support' },
    { key: 'settings', label: 'App Settings', path: '/admin/settings/app' },
];

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    if (MODULES.length !== EXPECTED_MODULE_COUNT) {
        console.error(`Expected ${EXPECTED_MODULE_COUNT} modules, got ${MODULES.length}`);
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const results = [];

    await loginTenant(page, LOGIN);

    for (let i = 0; i < MODULES.length; i++) {
        const mod = MODULES[i];
        const caseId = `UI-${String(i + 1).padStart(2, '0')}`;
        const apiFails = [];
        const handler = (res) => {
            const url = res.url();
            if (!url.includes('/api/')) return;
            if (res.status() >= 400) apiFails.push({ status: res.status(), url: url.replace(/^https?:\/\/[^/]+/, '') });
        };
        page.on('response', handler);
        try {
            await page.goto(`${BASE}${mod.path}`, { waitUntil: 'load', timeout: 60000 });
            await dismissAnnouncements(page);
            await sleep(600);
            await ensureLoggedIn(page, LOGIN);
            if (page.url().includes('/login')) {
                await loginTenant(page, LOGIN);
                await page.goto(`${BASE}${mod.path}`, { waitUntil: 'load', timeout: 60000 });
                await dismissAnnouncements(page);
                await sleep(600);
            }
            const url = page.url();
            const loginRedirect = url.includes('/login');
            const unauthorized = url.includes('/unauthorized');
            const critical = apiFails.filter((f) => f.status !== 404 && f.status !== 429);
            let status = 'OK';
            if (loginRedirect || unauthorized) status = 'FAIL';
            else if (critical.length || apiFails.some((f) => f.status === 429)) status = 'WARN';
            results.push({ caseId, ...mod, status, note: loginRedirect ? 'login redirect' : unauthorized ? 'unauthorized' : critical[0]?.url || 'loaded' });
            const icon = status === 'OK' ? 'PASS' : status === 'WARN' ? 'WARN' : 'FAIL';
            console.log(`  [${icon}] ${caseId}: ${mod.label} (${mod.key}) | ${mod.path}`);
        } catch (err) {
            results.push({ caseId, ...mod, status: 'FAIL', note: err.message?.slice(0, 80) });
            console.log(`  [FAIL] ${caseId}: ${mod.label} (${mod.key}) | ${err.message?.slice(0, 80)}`);
        } finally {
            page.removeListener('response', handler);
        }
    }

    await browser.close();
    const ok = results.filter((r) => r.status === 'OK').length;
    const warn = results.filter((r) => r.status === 'WARN').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\nTENANT MODULE UI: ${ok} OK | ${warn} WARN | ${fail} FAIL | ${results.length} modules\n`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
