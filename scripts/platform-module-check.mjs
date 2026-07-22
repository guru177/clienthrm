/**
 * Platform console module navigator — logs in and visits every platform route.
 * Run: node scripts/platform-module-check.mjs  (uses frontend/playwright, platform on :5175)
 */
import { chromium } from '../frontend/node_modules/playwright/index.mjs';

const BASE = process.env.PLATFORM_URL || 'http://localhost:5175';
const EMAIL = process.env.PLATFORM_ADMIN_EMAIL || 'admin@retaildaddy.in';
const PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || 'retaildaddy@0123';

const MODULES = [
    { module: 'Login', path: '/login', guest: true },
    { module: 'Dashboard', path: '/' },
    { module: 'Users', path: '/users' },
    { module: 'Subscription Plans', path: '/subscription-plans' },
    { module: 'IP Tracking', path: '/ip-tracking' },
    { module: 'Announcements', path: '/announcements' },
    { module: 'Releases', path: '/releases' },
    { module: 'Audit Log', path: '/audit-log' },
    { module: 'Platform Team', path: '/platform-team' },
    { module: 'Account', path: '/account' },
    { module: 'Tenant Detail', path: '/tenants/1' },
    { module: 'System Health', path: '/system-health' },
    { module: 'Revenue', path: '/revenue' },
    { module: 'Upgrade Requests', path: '/upgrade-requests' },
    { module: 'Support', path: '/support' },
];

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const results = [];
    let loggedIn = false;

    async function doLogin() {
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.fill('#platform_email', EMAIL);
        await page.fill('#platform_password', PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 25000 });
        await page.waitForLoadState('networkidle');
        loggedIn = true;
    }

    async function visit(path) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
                return;
            } catch (e) {
                if (!String(e.message).includes('interrupted') || attempt === 2) throw e;
                await sleep(800);
            }
        }
    }

    for (const mod of MODULES) {
        const apiFails = [];
        const respHandler = (res) => {
            const url = res.url();
            if (!url.includes('/api/')) return;
            const status = res.status();
            if (status >= 400) {
                apiFails.push({ status, url: url.replace(/^https?:\/\/[^/]+/, '') });
            }
        };
        page.on('response', respHandler);

        try {
            if (mod.guest) {
                await page.goto(`${BASE}${mod.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } else {
                if (!loggedIn) await doLogin();
                await visit(mod.path);
                await sleep(1200);
            }

            const url = page.url();
            const loginRedirect = !mod.guest && url.includes('/login');
            let status = 'OK';
            const notes = [];
            if (loginRedirect) {
                status = 'FAIL';
                notes.push('Redirected to login');
            }
            const critical = apiFails.filter((f) => f.status !== 404);
            if (critical.length) {
                status = status === 'OK' ? 'WARN' : status;
                notes.push(`API ${critical.map((f) => `${f.status} ${f.url}`).join('; ')}`);
            }

            results.push({
                module: mod.module,
                path: mod.path,
                status,
                note: notes.join(' | ') || 'Page loaded',
            });
        } catch (err) {
            results.push({
                module: mod.module,
                path: mod.path,
                status: 'FAIL',
                note: err.message?.slice(0, 120) || String(err),
            });
        } finally {
            page.removeListener('response', respHandler);
        }
    }

    await browser.close();

    console.log('\n=== Platform Module Navigation Report ===\n');
    const w = Math.max(...results.map((r) => r.module.length), 6);
    for (const r of results) {
        const icon = r.status === 'OK' ? '[OK]' : r.status === 'WARN' ? '[!!]' : '[FAIL]';
        console.log(`${icon} ${r.module.padEnd(w)}  ${r.status.padEnd(5)}  ${r.note}`);
    }

    const ok = results.filter((r) => r.status === 'OK').length;
    const warn = results.filter((r) => r.status === 'WARN').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\nSummary: ${ok} OK | ${warn} WARN | ${fail} FAIL | ${results.length} modules\n`);
    process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
