/**
 * Agent-style frontend module navigator — logs in and visits every admin route.
 * Run: node scripts/frontend-module-check.mjs  (from repo root, uses frontend/playwright)
 */
import { chromium } from '../frontend/node_modules/playwright/index.mjs';

const BASE = process.env.FE_URL || 'http://localhost:5174';
const EMAIL = process.env.HRM_EMAIL || 'admin@mashuptech.in';
const PASSWORD = process.env.HRM_PASSWORD || 'password';

const MODULES = [
    { module: 'Login', path: '/login', guest: true },
    { module: 'Dashboard', path: '/admin/dashboard' },
    { module: 'Users & Roles', path: '/admin/users' },
    { module: 'Centers', path: '/admin/centers' },
    { module: 'Departments', path: '/admin/departments' },
    { module: 'Designations', path: '/admin/designations' },
    { module: 'Job Postings', path: '/admin/careers' },
    { module: 'Applications', path: '/admin/job-applications' },
    { module: 'Team Chat', path: '/admin/chat' },
    { module: 'Attendance', path: '/admin/attendance' },
    { module: 'Shifts — Templates', path: '/admin/shifts' },
    { module: 'Shifts — Roster', path: '/admin/shifts/roster' },
    { module: 'Shifts — Daily Schedule', path: '/admin/shifts/daily' },
    { module: 'Biometric Devices', path: '/admin/biometric' },
    { module: 'Leave Requests', path: '/admin/leave-requests' },
    { module: 'Manage Leave', path: '/admin/leave-requests/manage' },
    { module: 'Holidays', path: '/admin/holidays' },
    { module: 'Salary Components', path: '/admin/salaries/components' },
    { module: 'Salary Employees', path: '/admin/salaries/employees' },
    { module: 'Payroll', path: '/admin/payroll' },
    { module: 'My Payslips', path: '/admin/my-payslips' },
    { module: 'Workflows', path: '/admin/workflows' },
    { module: 'Tasks & Activities', path: '/admin/tasks' },
    { module: 'Projects', path: '/admin/projects' },
    { module: 'Reports', path: '/admin/reports' },
    { module: 'Subscription', path: '/admin/subscription' },
    { module: 'Notifications', path: '/admin/notifications' },
    { module: 'Support', path: '/admin/support' },
    { module: 'App Settings', path: '/admin/settings/app' },
    { module: 'Leave Types Settings', path: '/admin/settings/leave-types' },
    { module: 'Profile Settings', path: '/admin/settings/profile' },
];

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// #region agent log
const DBG = 'http://127.0.0.1:7803/ingest/149eb4ce-a431-44e0-a315-d66a52298de3';
const SID = '8e5db3';
function dbgLog(hypothesisId, location, message, data = {}) {
    const payload = { sessionId: SID, runId: 'e2e-nav', hypothesisId, location, message, data, timestamp: Date.now() };
    fetch(DBG, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SID }, body: JSON.stringify(payload) }).catch(() => {});
}
// #endregion

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const results = [];
    let loggedIn = false;

    async function doLogin() {
        // #region agent log
        dbgLog('H1', 'frontend-module-check:login', 'login_start', { base: BASE });
        // #endregion
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.fill('#email', EMAIL);
        await page.fill('#password', PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/admin\//, { timeout: 20000 });
        loggedIn = true;
        // #region agent log
        dbgLog('H1', 'frontend-module-check:login', 'login_ok', { url: page.url() });
        // #endregion
    }

    for (const mod of MODULES) {
        const apiFails = [];
        const consoleErrors = [];
        const handler = (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        };
        const respHandler = (res) => {
            const url = res.url();
            if (!url.includes('/api/')) return;
            const status = res.status();
            if (status >= 400) {
                apiFails.push({ status, url: url.replace(/^https?:\/\/[^/]+/, '') });
            }
        };

        page.on('console', handler);
        page.on('response', respHandler);

        try {
            if (mod.guest) {
                await page.goto(`${BASE}${mod.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } else {
                if (!loggedIn) await doLogin();
                await page.goto(`${BASE}${mod.path}`, { waitUntil: 'networkidle', timeout: 45000 });
                await sleep(1500);
            }

            const url = page.url();
            const reactCrash = (await page.locator('text=React Error').count()) > 0;
            const unauthorized = url.includes('/unauthorized');
            const loginRedirect = !mod.guest && url.includes('/login');
            const notFound = (await page.locator('text=404').count()) > 0 && (await page.locator('text=Not Found').count()) > 0;

            let status = 'OK';
            const notes = [];

            if (reactCrash) { status = 'FAIL'; notes.push('React crash'); }
            if (unauthorized) { status = 'FAIL'; notes.push('Unauthorized page'); }
            if (loginRedirect) { status = 'FAIL'; notes.push('Redirected to login'); }
            if (apiFails.length) {
                const critical = apiFails.filter((f) => f.status !== 404);
                if (critical.length) {
                    status = status === 'OK' ? 'WARN' : status;
                    notes.push(`API ${critical.map((f) => `${f.status} ${f.url}`).join('; ')}`);
                }
            }
            if (consoleErrors.some((e) => !e.includes('favicon') && !e.includes('WebSocket'))) {
                if (status === 'OK') status = 'WARN';
                notes.push(`Console: ${consoleErrors[0].slice(0, 80)}`);
            }

            const row = {
                module: mod.module,
                path: mod.path,
                status,
                url: url.replace(BASE, ''),
                apiErrors: apiFails.length,
                apiFails: apiFails.slice(0, 5),
                note: notes.join(' | ') || 'Page loaded',
            };
            results.push(row);
            // #region agent log
            const hid = reactCrash ? 'H4' : unauthorized || loginRedirect ? 'H2' : apiFails.some((f) => f.status >= 500) ? 'H3' : apiFails.length ? 'H3' : 'H5';
            dbgLog(hid, `frontend-module-check:${mod.path}`, 'module_result', row);
            // #endregion
        } catch (err) {
            const row = {
                module: mod.module,
                path: mod.path,
                status: 'FAIL',
                url: '',
                apiErrors: 0,
                note: err.message?.slice(0, 120) || String(err),
            };
            results.push(row);
            // #region agent log
            dbgLog('H2', `frontend-module-check:${mod.path}`, 'module_error', row);
            // #endregion
        } finally {
            page.removeListener('console', handler);
            page.removeListener('response', respHandler);
        }
    }

    await browser.close();

    console.log('\n=== Frontend Module Navigation Report ===\n');
    const w = Math.max(...results.map((r) => r.module.length), 6);
    for (const r of results) {
        const icon = r.status === 'OK' ? '[OK]' : r.status === 'WARN' ? '[!!]' : '[FAIL]';
        console.log(`${icon} ${r.module.padEnd(w)}  ${r.status.padEnd(5)}  ${r.note}`);
        if (r.apiErrors > 0 && r.status !== 'OK') {
            console.log(`     (${r.apiErrors} API error(s) on ${r.path})`);
        }
    }

    const ok = results.filter((r) => r.status === 'OK').length;
    const warn = results.filter((r) => r.status === 'WARN').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\nSummary: ${ok} OK | ${warn} WARN | ${fail} FAIL | ${results.length} modules\n`);
    // #region agent log
    dbgLog('H5', 'frontend-module-check:summary', 'e2e_complete', { ok, warn, fail, total: results.length });
    // #endregion
    await sleep(500);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
