/**
 * Real-person full product walkthrough (visible Chromium).
 * Visits every admin module, then exercises create/use workflows.
 *
 * Run from repo root:
 *   node scripts/real-user-walkthrough.mjs
 * Optional: HEADED=0 for headless, SLOW_MO=80 for slower human-like pace
 */
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  dismissAnnouncements,
  loginTenant,
  suppressAnnouncements,
  ensureLoggedIn,
} from '../frontend/scripts/playwright-helpers.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.FE_URL || 'http://localhost:5174';
const EMAIL = process.env.HRM_EMAIL || 'info@retaildaddy.in';
const PASSWORD = process.env.HRM_PASSWORD || 'Guru!1234';
const ORG_SLUG = process.env.HRM_ORG_SLUG || 'mashuptech';
const LOGIN = { base: BASE, email: EMAIL, password: PASSWORD, orgSlug: ORG_SLUG };
const HEADED = process.env.HEADED !== '0';
const SLOW_MO = Number(process.env.SLOW_MO || (HEADED ? 40 : 0));
const TS = Date.now();

const results = [];

function record(area, step, status, detail = '') {
  results.push({ area, step, status, detail });
  const icon = status === 'OK' ? '[OK]' : status === 'WARN' ? '[!!]' : status === 'SKIP' ? '[--]' : '[FAIL]';
  console.log(`${icon} ${area} | ${step}${detail ? ` — ${detail}` : ''}`);
}

function uiFlowDates() {
  const raw = execSync(`python "${path.join(REPO_ROOT, 'scripts', 'test_date_pools.py')}" ${TS} ui_flow`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(raw.trim());
}

const MODULES = [
  { name: 'Dashboard', path: '/admin/dashboard' },
  { name: 'Branches', path: '/admin/centers' },
  { name: 'Departments', path: '/admin/departments' },
  { name: 'Designations', path: '/admin/designations' },
  { name: 'Users & Roles', path: '/admin/users' },
  { name: 'Shifts Templates', path: '/admin/shifts' },
  { name: 'Shift Roster', path: '/admin/shifts/roster' },
  { name: 'Daily Schedule', path: '/admin/shifts/daily' },
  { name: 'Attendance', path: '/admin/attendance' },
  { name: 'Live Locations', path: '/admin/live-locations' },
  { name: 'Biometric', path: '/admin/biometric' },
  { name: 'Manual Attendance', path: '/admin/manual-attendance' },
  { name: 'Leave Requests', path: '/admin/leave-requests' },
  { name: 'Manage Leave', path: '/admin/leave-requests/manage' },
  { name: 'Holidays', path: '/admin/holidays' },
  { name: 'Salary Components', path: '/admin/salaries/components' },
  { name: 'Salary Employees', path: '/admin/salaries/employees' },
  { name: 'Payroll', path: '/admin/payroll' },
  { name: 'My Payslips', path: '/admin/my-payslips' },
  { name: 'Job Postings', path: '/admin/careers' },
  { name: 'Applications', path: '/admin/job-applications' },
  { name: 'Team Chat', path: '/admin/chat' },
  { name: 'Doctor Reports', path: '/admin/doctor-reports' },
  { name: 'My Doctor Reports', path: '/admin/my-doctor-reports' },
  { name: 'Grocery Benefits', path: '/admin/grocery-benefits' },
  { name: 'My Grocery Benefits', path: '/admin/my-grocery-benefits' },
  { name: 'Assets', path: '/admin/assets' },
  { name: 'My Assets', path: '/admin/my-assets' },
  { name: 'Workflows', path: '/admin/workflows' },
  { name: 'Tasks', path: '/admin/tasks' },
  { name: 'Projects', path: '/admin/projects' },
  { name: 'Reports', path: '/admin/reports' },
  { name: 'Subscription', path: '/admin/subscription' },
  { name: 'Notifications', path: '/admin/notifications' },
  { name: 'Support', path: '/admin/support' },
  { name: 'App Settings', path: '/admin/settings/app' },
  { name: 'Integrations', path: '/admin/settings/integrations' },
  { name: 'Leave Types', path: '/admin/settings/leave-types' },
  { name: 'Profile', path: '/admin/settings/profile' },
];

async function gotoAdmin(page, path) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // SPA auth bootstrap may redirect after first paint — wait briefly for settle.
    await page.waitForTimeout(500);
    const onLogin = page.url().includes('/login');
    const hasToken = await page.evaluate(() => !!localStorage.getItem('hrm_token')).catch(() => false);
    if (!onLogin && hasToken) {
      await dismissAnnouncements(page);
      await page.waitForTimeout(200);
      return;
    }
    await loginTenant(page, LOGIN);
  }
  await ensureLoggedIn(page, LOGIN);
  if (page.url().includes('/login')) {
    await loginTenant(page, LOGIN);
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  await dismissAnnouncements(page);
  await page.waitForTimeout(400);
}

async function visitModule(page, mod) {
  const apiFails = [];
  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onResp = (res) => {
    if (!res.url().includes('/api/')) return;
    if (res.status() >= 400 && res.status() !== 404 && res.status() !== 429) {
      apiFails.push(`${res.status()} ${res.url().replace(/^https?:\/\/[^/]+/, '')}`);
    }
  };
  page.on('console', onConsole);
  page.on('response', onResp);
  try {
    await gotoAdmin(page, mod.path);
    const url = page.url();
    const reactCrash = (await page.locator('text=React Error').count()) > 0;
    const unauthorized = url.includes('/unauthorized');
    const loginRedirect = url.includes('/login');

    // Light "use it" interactions when present
    const search = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill('a');
      await page.waitForTimeout(300);
      await search.fill('');
    }
    const tabs = page.getByRole('tab');
    if ((await tabs.count()) > 1) {
      await tabs.nth(1).click({ timeout: 3000 }).catch(() => null);
      await page.waitForTimeout(250);
      await tabs.first().click({ timeout: 3000 }).catch(() => null);
    }

    let status = 'OK';
    const notes = [];
    if (reactCrash) {
      status = 'FAIL';
      notes.push('React crash');
    }
    if (unauthorized) {
      status = 'FAIL';
      notes.push('Unauthorized');
    }
    if (loginRedirect) {
      status = 'FAIL';
      notes.push('Redirected to login');
    }
    if (apiFails.length) {
      status = status === 'OK' ? 'WARN' : status;
      notes.push(`API: ${apiFails.slice(0, 2).join('; ')}`);
    }
    const seriousConsole = consoleErrors.filter(
      (e) => !/favicon|WebSocket|Download the React DevTools/i.test(e),
    );
    if (seriousConsole.length && status === 'OK') {
      status = 'WARN';
      notes.push(`Console: ${seriousConsole[0].slice(0, 80)}`);
    }
    record('Navigate', mod.name, status, notes.join(' | ') || url.replace(BASE, ''));
  } catch (e) {
    record('Navigate', mod.name, 'FAIL', e.message?.slice(0, 120) || String(e));
  } finally {
    page.off('console', onConsole);
    page.off('response', onResp);
  }
}

async function clickAction(page, pattern) {
  await dismissAnnouncements(page);
  const btn = page.getByRole('button', { name: pattern }).first();
  await btn.waitFor({ state: 'visible', timeout: 20000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
}

async function submitDialog(dialog) {
  await dialog.locator('form').evaluate((form) => form.requestSubmit()).catch(async () => {
    await dialog.getByRole('button', { name: /save|create|submit|add|enroll/i }).last().click();
  });
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
}

async function waitOk(page) {
  await page.waitForTimeout(1000);
  if ((await page.locator('text=React Error').count()) > 0) throw new Error('React error boundary');
}

async function searchForCreated(page, name) {
  const search = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(name);
    await page.waitForTimeout(900);
  }
  await page.getByText(name).first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => null);
  return (await page.getByText(name).count()) > 0;
}

async function flowCreateDepartment(page) {
  const name = `Walk Dept ${TS}`;
  await gotoAdmin(page, '/admin/departments');
  await clickAction(page, /add department/i);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  // Branch is required — wait for options to load
  const branchSelect = dialog.getByRole('combobox').first();
  await branchSelect.waitFor({ state: 'visible', timeout: 10000 });
  await branchSelect.click();
  await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('option').first().click();
  await dialog.locator('#name').fill(name);
  const desc = dialog.locator('#description');
  if (await desc.count()) await desc.fill('Real-user walkthrough department');
  await submitDialog(dialog);
  await waitOk(page);
  record('Workflow', 'Create department', (await searchForCreated(page, name)) ? 'OK' : 'WARN', name);
}

async function flowCreateDesignation(page) {
  const name = `Walk Desig ${TS}`;
  await gotoAdmin(page, '/admin/designations');
  await clickAction(page, /add designation/i);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  await dialog.locator('#name').fill(name);
  await submitDialog(dialog);
  await waitOk(page);
  record('Workflow', 'Create designation', (await searchForCreated(page, name)) ? 'OK' : 'WARN', name);
}

async function flowCreateCenter(page) {
  const name = `Walk Branch ${TS}`;
  await gotoAdmin(page, '/admin/centers');
  await page.getByRole('button', { name: /add center/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.locator('input[name="address_line1"]').fill('1 Walk Street');
  await dialog.locator('input[name="place"]').fill('Walk Park');
  await dialog.locator('input[name="city"]').fill('Chennai');
  await dialog.locator('input[name="state"]').fill('TN');
  await dialog.locator('input[name="pincode"]').fill('600001');
  await submitDialog(dialog);
  await waitOk(page);
  record('Workflow', 'Create branch/center', (await searchForCreated(page, name)) ? 'OK' : 'WARN', name);
}

async function flowHoliday(page) {
  const name = `Walk Holiday ${TS}`;
  const { holiday: date } = uiFlowDates();
  await gotoAdmin(page, '/admin/holidays');
  await clickAction(page, /add holiday/i);
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill(name);
  await dialog.locator('input[type="date"]').fill(date);
  await dialog.getByRole('button', { name: /save|create|add/i }).click();
  await waitOk(page);
  record('Workflow', 'Create holiday', (await page.getByText(name).count()) > 0 ? 'OK' : 'WARN', `${name} ${date}`);
}

async function flowLeave(page) {
  const { start, end } = uiFlowDates();
  await gotoAdmin(page, '/admin/leave-requests');
  await page.getByRole('button', { name: /new leave request/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /annual|sick|casual/i }).first().click();
  await dialog.locator('input[type="date"]').nth(0).fill(start);
  await dialog.locator('input[type="date"]').nth(1).fill(end);
  await dialog.locator('textarea').fill('Real-user walkthrough leave request');
  await dialog.getByRole('button', { name: /submit|request|save/i }).click();
  await waitOk(page);
  record('Workflow', 'Submit leave request', 'OK', `${start} → ${end}`);
}

async function flowApproveLeave(page) {
  await gotoAdmin(page, '/admin/leave-requests/manage');
  const approve = page.getByRole('button', { name: /^approve$/i }).first();
  if (await approve.isVisible().catch(() => false)) {
    await approve.click();
    await page.getByRole('button', { name: /confirm|yes|approve/i }).last().click().catch(() => null);
    await waitOk(page);
    record('Workflow', 'Approve leave (manage)', 'OK');
  } else {
    record('Workflow', 'Approve leave (manage)', 'SKIP', 'No pending Approve button');
  }
}

async function flowTask(page) {
  const title = `Walk Task ${TS}`;
  await gotoAdmin(page, '/admin/tasks/create');
  await page.locator('#title').fill(title);
  await page.locator('#description, textarea').first().fill('Walkthrough task');
  await page.getByRole('button', { name: /create task/i }).click();
  await page.waitForURL(/\/admin\/tasks(?:\?|$)/, { timeout: 15000 }).catch(() => {});
  await page.getByText(title).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);
  record('Workflow', 'Create task', (await page.getByText(title).count()) > 0 ? 'OK' : 'WARN', title);
}

async function flowWorkflow(page) {
  const name = `Walk WF ${TS}`;
  await gotoAdmin(page, '/admin/workflows/create');
  await page.locator('#name, input').first().fill(name);
  const triggers = page.getByRole('combobox');
  if ((await triggers.count()) > 0) {
    await triggers.first().click();
    await page.getByRole('option', { name: /leave request submitted/i }).click();
  }
  await page.getByRole('button', { name: /create workflow/i }).click();
  await page.waitForURL(/\/admin\/workflows/, { timeout: 20000 }).catch(() => {});
  await waitOk(page);
  record('Workflow', 'Create workflow', 'OK', name);
}

async function flowProject(page) {
  const name = `Walk Project ${TS}`;
  await gotoAdmin(page, '/admin/projects/create');
  const nameInput = page.locator('#name, input').first();
  await nameInput.waitFor({ state: 'visible', timeout: 20000 });
  await nameInput.fill(name);
  const desc = page.locator('textarea').first();
  if ((await desc.count()) > 0) await desc.fill('Walkthrough project');
  const submit = page.getByRole('button', { name: /create project/i });
  if (!(await submit.first().isVisible().catch(() => false))) {
    record('Workflow', 'Create project', 'WARN', 'Create button missing');
    return;
  }
  await submit.first().click({ force: true });
  await page.waitForURL(/\/admin\/projects/, { timeout: 20000 }).catch(() => {});
  record('Workflow', 'Create project', 'OK', name);
}

async function flowUsersTab(page) {
  await gotoAdmin(page, '/admin/users');
  const rolesTab = page.getByRole('tab', { name: /roles/i });
  if (await rolesTab.isVisible().catch(() => false)) {
    await rolesTab.click();
    await page.waitForTimeout(500);
    record('Workflow', 'Users → Roles tab', 'OK');
  } else {
    record('Workflow', 'Users page', 'OK', 'Roles tab not found');
  }
}

async function flowPayrollSelect(page) {
  await gotoAdmin(page, '/admin/payroll');
  // Ensure "All Employees" mode is active (loads the list)
  const allBtn = page.getByRole('button', { name: /all employees/i }).first();
  if (await allBtn.isVisible().catch(() => false)) {
    await allBtn.click();
  }
  // Radix checkboxes are role=checkbox, not input[type=checkbox].
  // Wait for lazy page + /payroll/employees rather than a fixed short timeout.
  const boxes = page.getByRole('checkbox');
  await boxes.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  const count = await boxes.count();
  if (count > 0) {
    await boxes.first().click({ force: true });
    record('Workflow', 'Payroll select employee', 'OK', `checkboxes=${count}`);
  } else {
    record('Workflow', 'Payroll list', 'WARN', 'No employee checkboxes');
  }
}

async function flowAttendance(page) {
  await gotoAdmin(page, '/admin/attendance');
  const history = page.getByRole('tab', { name: /history/i });
  if (await history.isVisible().catch(() => false)) {
    await history.click();
    await page.waitForTimeout(400);
  }
  record('Workflow', 'Attendance page use', 'OK');
}

async function flowGrocery(page) {
  await gotoAdmin(page, '/admin/grocery-benefits');
  record('Workflow', 'Grocery benefits page', 'OK', page.url().replace(BASE, ''));
}

async function flowAssets(page) {
  await gotoAdmin(page, '/admin/assets');
  const add = page.getByRole('button', { name: /add asset|new asset|create/i }).first();
  if (await add.isVisible().catch(() => false)) {
    await add.click();
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.locator('input').first().fill(`Walk Asset ${TS}`);
      await page.keyboard.press('Escape');
      record('Workflow', 'Assets open create dialog', 'OK');
    } else {
      record('Workflow', 'Assets create UI', 'WARN', 'No dialog');
    }
  } else {
    record('Workflow', 'Assets page', 'OK', 'No add button');
  }
}

async function flowChat(page) {
  await gotoAdmin(page, '/admin/chat');
  record('Workflow', 'Team chat load', 'OK', page.url().replace(BASE, ''));
}

async function flowReports(page) {
  await gotoAdmin(page, '/admin/reports');
  record('Workflow', 'Reports page', 'OK', page.url().replace(BASE, ''));
}

async function flowSettings(page) {
  await gotoAdmin(page, '/admin/settings/app');
  record('Workflow', 'App settings', 'OK');
  await gotoAdmin(page, '/admin/settings/profile');
  const phone = page.locator('#phone');
  await phone.waitFor({ state: 'visible', timeout: 15000 });
  await phone.scrollIntoViewIfNeeded();
  await phone.fill(`9${String(TS).slice(-9)}`);
  const save = page.getByRole('button', { name: /save personal info/i });
  await save.waitFor({ state: 'visible', timeout: 10000 });
  await save.click();
  await waitOk(page);
  record('Workflow', 'Profile phone update', 'OK');
}

async function flowBiometric(page) {
  await gotoAdmin(page, '/admin/biometric');
  record('Workflow', 'Biometric page', 'OK');
}

async function main() {
  console.log('=== REAL-USER FULL WALKTHROUGH ===');
  console.log(`URL: ${BASE} | headed=${HEADED} | slowMo=${SLOW_MO}ms`);
  console.log(`User: ${EMAIL} / org ${ORG_SLUG}\n`);

  const browser = await chromium.launch({
    headless: !HEADED,
    slowMo: SLOW_MO,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await suppressAnnouncements(page);

  try {
    await loginTenant(page, LOGIN);
    record('Auth', 'Login', 'OK', 'Dashboard');

    console.log('\n--- Visit every module ---');
    for (const mod of MODULES) {
      await visitModule(page, mod);
    }

    console.log('\n--- Exercise workflows ---');
    const workflows = [
      ['Department create', flowCreateDepartment],
      ['Designation create', flowCreateDesignation],
      ['Branch create', flowCreateCenter],
      ['Holiday create', flowHoliday],
      ['Leave submit', flowLeave],
      ['Leave approve', flowApproveLeave],
      ['Task create', flowTask],
      ['Workflow create', flowWorkflow],
      ['Project create', flowProject],
      ['Users roles tab', flowUsersTab],
      ['Payroll select', flowPayrollSelect],
      ['Attendance', flowAttendance],
      ['Grocery', flowGrocery],
      ['Assets', flowAssets],
      ['Chat', flowChat],
      ['Reports', flowReports],
      ['Settings/Profile', flowSettings],
      ['Biometric', flowBiometric],
    ];
    for (const [label, fn] of workflows) {
      try {
        await fn(page);
      } catch (e) {
        record('Workflow', label, 'FAIL', e.message?.slice(0, 140) || String(e));
      }
    }
  } catch (e) {
    record('Runner', 'Unhandled', 'FAIL', e.message || String(e));
  }

  await browser.close();

  const ok = results.filter((r) => r.status === 'OK').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;

  console.log('\n=== SUMMARY ===');
  console.log(`OK=${ok} WARN=${warn} FAIL=${fail} SKIP=${skip} TOTAL=${results.length}`);
  if (fail) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`  - ${r.area} | ${r.step}: ${r.detail}`);
    }
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
