import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import { loginTenant, dismissAnnouncements, suppressAnnouncements } from '../frontend/scripts/playwright-helpers.mjs';

const BASE = 'http://localhost:5174';
const LOGIN = { base: BASE, email: 'info@retaildaddy.in', password: 'Guru!1234', orgSlug: 'mashuptech' };
const TS = Date.now();
const results = [];
const record = (s, st, d = '') => {
  results.push([s, st, d]);
  console.log(`${st === 'OK' ? '[OK]' : '[!!]'} ${s}${d ? ` — ${d}` : ''}`);
};

async function goto(page, path) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (page.url().includes('/login')) {
    await loginTenant(page, LOGIN);
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  await dismissAnnouncements(page);
}

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await suppressAnnouncements(page);
await loginTenant(page, LOGIN);

{
  const name = `Fix Dept ${TS}`;
  await goto(page, '/admin/departments');
  await page.getByRole('button', { name: /add department/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option').first().click();
  await dialog.locator('#name').fill(name);
  await dialog.locator('form').evaluate((f) => f.requestSubmit());
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.getByText(name).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  record('Create department', (await page.getByText(name).count()) > 0 ? 'OK' : 'WARN', name);
}

{
  const title = `Fix Task ${TS}`;
  await goto(page, '/admin/tasks/create');
  await page.locator('#title').fill(title);
  await page.locator('textarea').first().fill('fix');
  await page.getByRole('button', { name: /create task/i }).click();
  await page.waitForURL(/\/admin\/tasks(?:\?|$)/, { timeout: 15000 }).catch(() => {});
  await page.getByText(title).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  record('Create task', (await page.getByText(title).count()) > 0 ? 'OK' : 'WARN', title);
}

{
  await goto(page, '/admin/payroll');
  const allBtn = page.getByRole('button', { name: /all employees/i }).first();
  if (await allBtn.isVisible().catch(() => false)) await allBtn.click();
  // Lazy chunk + payroll/employees can take several seconds after domcontentloaded
  await page.getByRole('checkbox').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  const n = await page.getByRole('checkbox').count();
  record('Payroll checkboxes', n > 0 ? 'OK' : 'WARN', `count=${n}`);
}

{
  await goto(page, '/admin/settings/profile');
  const phone = page.locator('#phone');
  await phone.waitFor({ state: 'attached', timeout: 15000 });
  await phone.scrollIntoViewIfNeeded();
  const vis = await phone.isVisible();
  if (vis) await phone.fill('9876543210');
  record('Profile phone', vis ? 'OK' : 'WARN');
}

await browser.close();
console.log('\nFocused:', results.map((r) => `${r[0]}=${r[1]}`).join(', '));
process.exit(results.some((r) => r[1] !== 'OK') ? 1 : 0);
