/** Shared Playwright helpers for tenant UI test scripts. */

/** Prefer Close/Dismiss over Next so announcement carousels actually exit. */
export async function dismissAnnouncements(page) {
  for (let i = 0; i < 10; i++) {
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /company announcement|HR Daddy|announcement/i })
      .first();
    if (!(await dialog.isVisible().catch(() => false))) {
      const overlay = page.locator('[data-slot="dialog-overlay"][data-state="open"]');
      if ((await overlay.count()) === 0) break;
    }

    const close = dialog.getByRole('button', { name: /^(close|dismiss|got it)$/i });
    if (await close.first().isVisible().catch(() => false)) {
      await close.first().click({ force: true });
    } else {
      const next = dialog.getByRole('button', { name: /^next$/i });
      if (await next.first().isVisible().catch(() => false)) {
        await next.first().click({ force: true });
      } else {
        await page.keyboard.press('Escape');
      }
    }
    await page.waitForTimeout(250);
  }
  await page.keyboard.press('Escape').catch(() => {});
}

/** Block announcement API + seed dismissals so overlays never block clicks. */
export async function suppressAnnouncements(page) {
  await page.route('**/api/admin/announcements**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
      return;
    }
    await route.fallback();
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      'hrm_dismissed_announcements',
      JSON.stringify(Array.from({ length: 5000 }, (_, i) => i + 1)),
    );
  });
}

export async function loginTenant(page, { base, email, password, orgSlug }) {
  await suppressAnnouncements(page);
  // Clear prior session so /login is not redirected away (e.g. after signup flows).
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    localStorage.setItem(
      'hrm_dismissed_announcements',
      JSON.stringify(Array.from({ length: 5000 }, (_, i) => i + 1)),
    );
  });
  await page.context().clearCookies();
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  if (orgSlug) {
    const org = page.locator('input#org_slug, input[name="org_slug"]');
    if ((await org.count()) > 0) await org.first().fill(orgSlug);
  }
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin\//, { timeout: 25000 });
  // Ensure SPA auth bootstrap finished before the next full navigation.
  await page.waitForFunction(() => !!localStorage.getItem('hrm_token'), null, {
    timeout: 10000,
  });
  await page
    .locator('[data-testid="sidebar-menu-button"], [data-sidebar="sidebar"]')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => null);
  await dismissAnnouncements(page);
}

/** Re-login when session expired (e.g. after long test marathon). */
export async function ensureLoggedIn(page, { base, email, password, orgSlug }) {
  if (page.url().includes('/login')) {
    await loginTenant(page, { base, email, password, orgSlug });
  }
}
