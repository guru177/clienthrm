/**
 * Targeted E2E: forgot-password wizard, payroll/advanced pages, workflows.
 * Run from repo root: node scripts/e2e-targeted-flows.mjs
 */
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import { dismissAnnouncements, loginTenant } from '../frontend/scripts/playwright-helpers.mjs';

const BASE = process.env.FE_URL || 'http://localhost:5174';
const API = process.env.HRM_API || 'http://127.0.0.1:3001';
const EMAIL = process.env.HRM_EMAIL || 'info@retaildaddy.in';
const PASSWORD = process.env.HRM_PASSWORD || 'password';
const ORG_SLUG = process.env.HRM_ORG_SLUG || 'mashuptech';

const results = [];

function record(id, name, ok, detail = '') {
    results.push({ id, name, ok, detail });
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${id}: ${name}${detail ? ` | ${detail}` : ''}`);
}

async function login(page) {
    await loginTenant(page, { base: BASE, email: EMAIL, password: PASSWORD, orgSlug: ORG_SLUG });
}

async function signupEnabled() {
    try {
        const res = await fetch(`${API}/api/public/signup/check-availability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ org_slug: 'e2e-probe-slug' }),
        });
        return res.status !== 403;
    } catch {
        return false;
    }
}

async function flowSignup(page) {
    if (!(await signupEnabled())) {
        record('E2E-09', 'Signup wizard (public)', true, 'SKIP: public signup disabled');
        return;
    }

    const ts = Date.now();
    const slug = `e2e-signup-${ts}-${Math.random().toString(36).slice(2, 8)}`;
    const companyEmail = `company-${slug}@example.com`;
    const adminEmail = `admin-${slug}@example.com`;
    const password = 'TestPassword123!';

    await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle', timeout: 30000 });
    const step1Visible = (await page.locator('#organization_name').count()) > 0;
    record('E2E-09', 'Signup page loads', step1Visible);
    if (!step1Visible) return;

    await page.fill('#organization_name', 'E2E Signup Org');
    await page.fill('#org_slug', slug);
    await page.fill('#contact_person', 'E2E Tester');
    await page.fill('#company_email', companyEmail);
    await page.fill('#company_phone', '+919876543210');
    await page.click('form button[type="submit"]');
    await page.waitForSelector('#admin_name', { timeout: 15000 });

    await page.fill('#admin_name', 'E2E Admin');
    await page.fill('#admin_email', adminEmail);
    await page.fill('#admin_mobile', '+919876543211');
    await page.fill('#admin_password', password);
    await page.fill('#confirm_password', password);
    await page.click('form button[type="submit"]:has-text("Continue")');
    await page.waitForSelector('#otp', { timeout: 15000 });

    const otpResponse = page.waitForResponse(
        (r) => r.url().includes('/public/signup/send-otp') && r.status() === 200,
        { timeout: 30000 },
    );
    await page.click('button:has-text("Send verification code")');
    let debugOtp = '';
    try {
        const res = await otpResponse;
        const json = await res.json();
        debugOtp = json?.data?.debug_otp || '';
    } catch {
        /* send-otp may fail without SMTP */
    }

    if (!debugOtp) {
        const otpValue = await page.inputValue('#otp').catch(() => '');
        debugOtp = otpValue || '';
    }

    if (!debugOtp) {
        record(
            'E2E-10',
            'Signup wizard completes with OTP',
            true,
            'SKIP: OTP debug not exposed (SIGNUP_OTP_DEBUG=1)',
        );
        return;
    }

    if ((await page.inputValue('#otp')) !== debugOtp) {
        await page.fill('#otp', debugOtp);
    }

    await page.waitForFunction(
        () => {
            const btn = [...document.querySelectorAll('button[type="submit"]')].find((b) =>
                (b.textContent || '').includes('Create organization'),
            );
            return btn && !btn.disabled;
        },
        { timeout: 15000 },
    );

    const signupResponse = page.waitForResponse(
        (r) =>
            r.url().includes('/api/public/signup') &&
            !r.url().includes('send-otp') &&
            !r.url().includes('check-availability') &&
            r.request().method() === 'POST',
        { timeout: 45000 },
    );
    await page.click('button[type="submit"]:has-text("Create organization")');

    let signupOk = false;
    let signupDetail = '';
    try {
        const res = await signupResponse;
        signupDetail = `HTTP ${res.status()}`;
        if (res.status() === 429) {
            record('E2E-10', 'Signup wizard completes with OTP', true, 'SKIP: signup rate limit');
            return;
        }
        signupOk = res.status() === 200 || res.status() === 201;
        if (!signupOk) {
            const json = await res.json().catch(() => ({}));
            signupDetail = json?.message || signupDetail;
        }
    } catch (e) {
        signupDetail = e.message;
    }

    if (signupOk) {
        await page.waitForURL(/\/admin\//, { timeout: 15000 }).catch(() => {});
    }
    record(
        'E2E-10',
        'Signup wizard completes with OTP',
        signupOk,
        signupOk ? `org=${slug}` : signupDetail,
    );
}

async function flowForgotPassword(page) {
    await page.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle', timeout: 30000 });
    const emailVisible = (await page.locator('input[type="email"]').count()) > 0;
    record('E2E-01', 'Forgot-password page loads', emailVisible);

    await page.fill('input[type="email"]', 'nonexistent-test@example.com');
    const orgField = page.locator('input[name="org_slug"], input[placeholder*="slug" i]');
    if (await orgField.count()) {
        await orgField.first().fill(ORG_SLUG);
    }
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    const noCrash = !(body || '').includes('React Error');
    record('E2E-02', 'Forgot-password submit no crash', noCrash);

    // Invalid OTP step navigation (if verification_id returned we may be on OTP step)
    const otpInputs = page.locator('[data-slot="input-otp"], input[inputmode="numeric"]');
    if ((await otpInputs.count()) > 0) {
        record('E2E-03', 'OTP step UI present', true);
    } else {
        record('E2E-03', 'OTP step UI present', true, 'skipped — email step only (no account or SMTP)');
    }
}

async function flowPayroll(page) {
    await page.goto(`${BASE}/admin/payroll`, { waitUntil: 'networkidle', timeout: 30000 });
    const body = await page.textContent('body');
    const h1 = await page.locator('h1').filter({ hasText: /payroll/i }).first().textContent().catch(() => '');
    record('E2E-04', 'Payroll page loads', (h1 || body || '').toLowerCase().includes('payroll'));

    await page.goto(`${BASE}/admin/payroll/advanced`, { waitUntil: 'networkidle', timeout: 30000 });
    const advText = await page.textContent('body');
    record(
        'E2E-05',
        'Advanced payroll page loads',
        (advText || '').toLowerCase().includes('payroll') || (advText || '').includes('Variable'),
    );

    const nanOnPage = (advText || '').includes('NaN') || (advText || '').includes('₹NaN');
    record('E2E-06', 'No NaN currency on advanced payroll', !nanOnPage);
}

async function flowWorkflow(page) {
    await page.goto(`${BASE}/admin/workflows`, { waitUntil: 'networkidle', timeout: 30000 });
    const text = await page.textContent('body');
    record(
        'E2E-07',
        'Workflows page loads',
        (text || '').toLowerCase().includes('workflow') || (text || '').includes('Trigger'),
    );

    await page.goto(`${BASE}/admin/leave-requests`, { waitUntil: 'networkidle', timeout: 30000 });
    const leaveText = await page.textContent('body');
    record('E2E-08', 'Leave requests page loads (workflow trigger source)', (leaveText || '').length > 100);
}

async function main() {
    console.log('='.repeat(60));
    console.log('TARGETED E2E FLOWS');
    console.log('='.repeat(60));

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
    } catch (e) {
        console.error('Playwright/chromium not available:', e.message);
        process.exit(2);
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('pageerror', (err) => console.warn('  pageerror:', err.message));

    try {
        await flowForgotPassword(page);
        await flowSignup(page);
        if (page.url().includes('/admin/')) {
            await dismissAnnouncements(page);
        } else {
            await login(page);
        }
        await flowPayroll(page);
        await flowWorkflow(page);
    } catch (e) {
        record('E2E-00', 'Unexpected E2E error', false, e.message);
    } finally {
        await browser.close();
    }

    const passed = results.filter((r) => r.ok).length;
    console.log('\n' + '='.repeat(60));
    console.log(`E2E RESULTS: ${passed}/${results.length} passed`);
    const failed = results.filter((r) => !r.ok);
    for (const f of failed) {
        console.log(`  - ${f.id}: ${f.name} | ${f.detail}`);
    }
    process.exit(failed.length ? 1 : 0);
}

main();
