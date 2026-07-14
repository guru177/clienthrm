/** Shared Playwright helpers for tenant UI test scripts. */

export async function dismissAnnouncements(page) {
  for (let i = 0; i < 5; i++) {
    const overlay = page.locator('[data-slot="dialog-overlay"][data-state="open"]');
    if ((await overlay.count()) === 0) break;
    const dialog = page.getByRole('dialog');
    const action = dialog.getByRole('button', { name: /got it|next|close|dismiss/i });
    if ((await action.count()) > 0) {
      await action.first().click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
  }
}

export async function loginTenant(page, { base, email, password, orgSlug }) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  if (orgSlug) {
    const org = page.locator('input#org_slug, input[name="org_slug"]');
    if ((await org.count()) > 0) await org.first().fill(orgSlug);
  }
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin\//, { timeout: 25000 });
  await dismissAnnouncements(page);
}

/** Re-login when session expired (e.g. after long test marathon). */
export async function ensureLoggedIn(page, { base, email, password, orgSlug }) {
  if (page.url().includes('/login')) {
    await loginTenant(page, { base, email, password, orgSlug });
  }
}
