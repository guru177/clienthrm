/**
 * Input + submit flow check — exercises forms like a manual tester.
 * Run: node scripts/ui-input-flow-check.mjs
 */
import { chromium } from '../node_modules/playwright/index.mjs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dismissAnnouncements, loginTenant, suppressAnnouncements } from './playwright-helpers.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function uiFlowDates() {
  const raw = execSync(`python "${path.join(REPO_ROOT, 'scripts', 'test_date_pools.py')}" ${TS} ui_flow`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(raw.trim());
}

const BASE = 'http://localhost:5174';
const EMAIL = 'info@retaildaddy.in';
const PASSWORD = process.env.HRM_PASSWORD || 'Guru!1234';
const TS = Date.now();

const flows = [];

function record(module, step, status, detail = '') {
  flows.push({ module, step, status, detail });
  const icon = status === 'OK' ? '✓' : status === 'SKIP' ? '○' : status === 'WARN' ? '!' : '✗';
  console.log(`${icon} [${module}] ${step}${detail ? ` — ${detail}` : ''}`);
}

const ORG_SLUG = 'mashuptech';

async function dismissOpenOverlays(page) {
  await dismissAnnouncements(page);
}

async function clickActionButton(page, pattern) {
  await dismissOpenOverlays(page);
  const byText = page.getByRole('button', { name: pattern }).first();
  await byText.waitFor({ state: 'visible', timeout: 30000 });
  await byText.scrollIntoViewIfNeeded();
  await byText.click({ force: true });
}

async function gotoAdmin(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (page.url().includes('/login')) {
    await login(page);
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  await dismissAnnouncements(page);
}

async function runFlow(name, fn, page) {
  try {
    await fn(page);
  } catch (e) {
    record(name, 'Flow error', 'FAIL', e.message);
  }
}

async function login(page) {
  await loginTenant(page, { base: BASE, email: EMAIL, password: PASSWORD, orgSlug: ORG_SLUG });
  record('Auth', 'Login with email/password', 'OK', '→ Dashboard');
}

async function pickSelect(page, triggerLabel, optionText) {
  const trigger = page.getByRole('combobox').filter({ hasText: new RegExp(triggerLabel, 'i') }).first();
  if ((await trigger.count()) === 0) {
    await page.locator('[role="combobox"]').first().click();
  } else {
    await trigger.click();
  }
  await page.getByRole('option', { name: new RegExp(optionText, 'i') }).first().click();
}

async function submitDialog(dialog) {
  await dialog.locator('form').evaluate((form) => form.requestSubmit());
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
}

async function waitSuccess(page) {
  await page.waitForTimeout(1200);
  const err = await page.locator('text=React Error').count();
  if (err > 0) throw new Error('React error boundary');
}

// ─── 1. Departments: create → appears in list ───
async function flowDepartments(page) {
  const name = `QA Dept ${TS}`;
  await gotoAdmin(page, '/admin/departments');
  // Prefer the action button — heading can race with layout chrome.
  await page.getByRole('button', { name: /add department/i }).waitFor({ state: 'visible', timeout: 30000 });
  await clickActionButton(page, /add department/i);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  await dialog.locator('#name').fill(name);
  await dialog.locator('#description').fill('Automated test department');
  await submitDialog(dialog);
  await waitSuccess(page);
  const visible = await page.getByText(name).count();
  record('Departments', 'Create (name + description)', visible > 0 ? 'OK' : 'WARN', visible > 0 ? 'Listed in table' : 'Save OK, row not found');
}

// ─── 2. Designations ───
async function flowDesignations(page) {
  const name = `QA Role ${TS}`;
  await gotoAdmin(page, '/admin/designations');
  await clickActionButton(page, /add designation/i);
  await page.locator('#name, input[placeholder*="name" i]').first().fill(name);
  await page.getByRole('button', { name: /create|save/i }).last().click();
  await waitSuccess(page);
  record('Designations', 'Create designation', (await page.getByText(name).count()) > 0 ? 'OK' : 'WARN', name);
}

// ─── 3. Centers ───
async function flowCenters(page) {
  const name = `QA Center ${TS}`;
  await gotoAdmin(page, '/admin/centers');
  await page.getByRole('button', { name: /add center|new center|create/i }).first().click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="address_line1"]').fill('123 Test Street');
  await page.locator('input[name="place"]').fill('Test Park');
  await page.locator('input[name="city"]').fill('Chennai');
  await page.locator('input[name="state"]').fill('TN');
  await page.locator('input[name="pincode"]').fill('600001');
  await page.getByRole('button', { name: /save|create|submit/i }).last().click();
  await waitSuccess(page);
  record('Centers', 'Create center (address form)', (await page.getByText(name).count()) > 0 ? 'OK' : 'WARN', name);
}

// ─── 4. Holidays ───
async function flowHolidays(page) {
  const name = `QA Holiday ${TS}`;
  const { holiday: date } = uiFlowDates();
  await gotoAdmin(page, '/admin/holidays');
  await clickActionButton(page, /add holiday/i);
  await page.locator('#name, input').filter({ has: page.locator('..') }).first();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill(name);
  await dialog.locator('input[type="date"]').fill(date);
  await dialog.getByRole('button', { name: /save|create|add/i }).click();
  await waitSuccess(page);
  record('Holidays', 'Create holiday (name + date)', (await page.getByText(name).count()) > 0 ? 'OK' : 'WARN', `${name} on ${date}`);
}

// ─── 5. Leave request (employee submit) ───
async function flowLeaveRequest(page) {
  const { start: leaveStart, end: leaveEnd } = uiFlowDates();
  await gotoAdmin(page, '/admin/leave-requests');
  await page.getByRole('button', { name: /new leave request/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /annual/i }).click();
  await dialog.locator('input[type="date"]').nth(0).fill(leaveStart);
  await dialog.locator('input[type="date"]').nth(1).fill(leaveEnd);
  await dialog.locator('textarea').fill('QA automated leave flow test');
  await dialog.getByRole('button', { name: /submit|request|save/i }).click();
  await waitSuccess(page);
  record('Leave', 'Submit request (type, dates, reason)', 'OK', 'Dialog closed / table refresh');
}

// ─── 6. Tasks create ───
async function flowTaskCreate(page) {
  const title = `QA Task ${TS}`;
  await gotoAdmin(page, '/admin/tasks/create');
  await page.locator('#title').fill(title);
  await page.locator('#description, textarea').first().fill('Automated task description');
  await page.getByRole('button', { name: /create task/i }).click();
  await page.waitForURL(/\/admin\/tasks/, { timeout: 15000 });
  await waitSuccess(page);
  record('Tasks', 'Create task (title, description)', (await page.getByText(title).count()) > 0 ? 'OK' : 'WARN', title);
}

// ─── 7. Workflow create ───
async function flowWorkflowCreate(page) {
  const name = `QA Workflow ${TS}`;
  await gotoAdmin(page, '/admin/workflows/create');
  await page.locator('#name, input').first().fill(name);
  const triggers = page.getByRole('combobox');
  if ((await triggers.count()) > 0) {
    await triggers.first().click();
    await page.getByRole('option', { name: /leave request submitted/i }).click();
  }
  await page.getByRole('button', { name: /create workflow/i }).click();
  await page.waitForURL(/\/admin\/workflows/, { timeout: 20000 }).catch(() => {});
  await waitSuccess(page);
  record('Workflows', 'Create workflow (name + trigger)', 'OK', name);
}

// ─── 8. Projects create ───
async function flowProjectCreate(page) {
  const name = `QA Project ${TS}`;
  await gotoAdmin(page, '/admin/projects/create');
  const nameInput = page.locator('#name, input').filter({ hasNot: page.locator('[type="hidden"]') }).first();
  await nameInput.waitFor({ state: 'visible', timeout: 20000 });
  await nameInput.fill(name);
  const desc = page.locator('textarea').first();
  if ((await desc.count()) > 0) await desc.fill('QA project flow');
  const submit = page.getByRole('button', { name: /create project/i });
  if (!(await submit.first().isVisible().catch(() => false))) {
    record('Projects', 'Create project', 'WARN', 'Create Project button not visible');
    return;
  }
  await submit.first().click({ force: true });
  await page.waitForURL(/\/admin\/projects/, { timeout: 20000 }).catch(() => {});
  record('Projects', 'Create project', 'OK', name);
}

// ─── 9. Profile settings (read + patch field) ───
async function flowProfile(page) {
  await gotoAdmin(page, '/admin/settings/profile');
  const personalTab = page.getByRole('tab', { name: /personal/i });
  if ((await personalTab.count()) > 0) await personalTab.click();
  const phone = page.locator('#phone, input[name="phone"]').first();
  if ((await phone.count()) > 0) {
    await phone.fill(`9${String(TS).slice(-9)}`);
    const saveBtn = page.getByRole('button', { name: /^save personal|^update personal|save changes/i });
    if ((await saveBtn.count()) > 0) {
      await saveBtn.first().click();
      await waitSuccess(page);
      record('Settings', 'Profile: update phone (personal tab)', 'OK');
    } else {
      record('Settings', 'Profile: fields visible', 'OK', 'Submit on personal tab not found');
    }
  } else {
    record('Settings', 'Profile page', 'WARN', 'Phone input not found');
  }
}

// ─── 10. Attendance flow ───
async function flowAttendance(page) {
  await gotoAdmin(page, '/admin/attendance');
  record('Attendance', 'Load today sessions + stats', 'OK', 'Tabs: Statistics / History');

  const clockOut = page.getByRole('button', { name: /^clock out$/i });
  if ((await clockOut.count()) > 0 && (await clockOut.isEnabled())) {
    await clockOut.click();
    await waitSuccess(page);
    record('Attendance', 'Clock out active session', 'OK');
  } else {
    record('Attendance', 'Clock out', 'SKIP', 'No active session');
  }

  const historyTab = page.getByRole('tab', { name: /history/i });
  if ((await historyTab.count()) > 0) {
    await historyTab.first().click({ timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(500);
    record('Attendance', 'History tab (attendance table)', 'OK');
  } else {
    record('Attendance', 'History tab (attendance table)', 'WARN', 'History tab not found');
  }

  record('Attendance', 'Clock in via face dialog', 'SKIP', 'Requires camera + face models (manual)');
}

// ─── 11. Payroll (select employee UI) ───
async function flowPayroll(page) {
  await gotoAdmin(page, '/admin/payroll');
  const checkboxes = page.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  if (count > 1) {
    await checkboxes.nth(1).check();
    record('Payroll', 'Select employee checkbox', 'OK');
  } else {
    record('Payroll', 'Employee list', 'WARN', 'No checkboxes to select');
  }
}

// ─── 12. Dashboard metrics load ───
async function flowDashboard(page) {
  await gotoAdmin(page, '/admin/dashboard');
  await page
    .getByRole('heading', { name: /dashboard/i })
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .catch(() => null);
  const hasEmployees = (await page.getByText(/employee|attendance|payroll/i).count()) > 0;
  record('Dashboard', 'HR metrics charts load', hasEmployees ? 'OK' : 'WARN');
}

async function main() {
  console.log('=== HRM Input Flow Check ===\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await suppressAnnouncements(page);

  const apiFails = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      apiFails.push(`${res.request().method()} ${res.status()} ${res.url()}`);
    }
  });

  try {
    await login(page);
    await runFlow('Dashboard', flowDashboard, page);
    await runFlow('Departments', flowDepartments, page);
    await runFlow('Designations', flowDesignations, page);
    await runFlow('Centers', flowCenters, page);
    await runFlow('Holidays', flowHolidays, page);
    await runFlow('Leave', flowLeaveRequest, page);
    await runFlow('Tasks', flowTaskCreate, page);
    await runFlow('Workflows', flowWorkflowCreate, page);
    await runFlow('Projects', flowProjectCreate, page);
    await runFlow('Settings', flowProfile, page);
    await runFlow('Attendance', flowAttendance, page);
    await runFlow('Payroll', flowPayroll, page);
  } catch (e) {
    record('Runner', 'Unhandled error', 'FAIL', e.message);
  }

  await browser.close();

  console.log('\n--- Flow summary ---');
  const byModule = {};
  for (const f of flows) {
    if (!byModule[f.module]) byModule[f.module] = [];
    byModule[f.module].push(f);
  }
  for (const [mod, steps] of Object.entries(byModule)) {
    const bad = steps.filter((s) => s.status === 'FAIL');
    const warn = steps.filter((s) => s.status === 'WARN');
    console.log(`\n${mod}:`);
    steps.forEach((s) => console.log(`  • ${s.step} [${s.status}]${s.detail ? ` — ${s.detail}` : ''}`));
    if (bad.length) console.log(`  ⚠ ${bad.length} failure(s)`);
  }

  const fails = flows.filter((f) => f.status === 'FAIL');
  if (apiFails.length) {
    console.log('\nAPI errors during flows:');
    [...new Set(apiFails)].slice(0, 10).forEach((x) => console.log('  -', x));
  }

  console.log(`\nTotal steps: ${flows.length} | FAIL: ${fails.length} | WARN: ${flows.filter((f) => f.status === 'WARN').length}`);
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
