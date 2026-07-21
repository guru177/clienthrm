import fs from 'node:fs';
import { test as base, expect } from '@playwright/test';
import { authStatePath } from './global-setup';

type AuthFixtures = {
    authenticatedPage: import('@playwright/test').Page;
};

function loadAuthState():
    | { token: string; refreshToken?: string; email: string; password: string; orgSlug: string }
    | null {
    if (!fs.existsSync(authStatePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(authStatePath, 'utf8'));
    } catch {
        return null;
    }
}

export const e2eCredentials = {
    email: process.env.E2E_EMAIL ?? 'info@retaildaddy.in',
    password: process.env.E2E_PASSWORD ?? 'Guru!1234',
    orgSlug: process.env.E2E_ORG_SLUG ?? 'mashuptech',
};

/** Dismiss announcement carousel dialogs that block admin UI. */
export async function dismissOverlays(page: import('@playwright/test').Page) {
    await page.waitForLoadState('domcontentloaded');
    const dialog = page
        .getByRole('dialog')
        .filter({ hasText: /company announcement|HR Daddy|announcement/i })
        .first();

    await dialog.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => null);

    for (let i = 0; i < 10; i += 1) {
        if (!(await dialog.isVisible().catch(() => false))) return;

        // Prefer Close/Dismiss over Next so we exit the carousel instead of looping.
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
        await page.waitForTimeout(200);
    }

    // Absolute fallback: Escape until hidden
    if (await dialog.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
    }
    await expect(dialog).toBeHidden({ timeout: 5_000 }).catch(() => null);
}

export const test = base.extend<AuthFixtures>({
    authenticatedPage: async ({ page, context }, use, testInfo) => {
        const state = loadAuthState();
        if (!state?.token) {
            testInfo.skip(
                true,
                'No E2E auth state. Ensure backend is running on :3001 with public signup or set E2E_EMAIL/E2E_PASSWORD.',
            );
        }

        // Prevent announcement carousels from blocking clicks during E2E.
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

        await context.addInitScript(
            ({ t, r }) => {
                // Seed auth once per tab. Logout uses a full navigation to /login;
                // re-setting the token on every load would make logout tests fail.
                if (!sessionStorage.getItem('hrm_e2e_auth')) {
                    localStorage.setItem('hrm_token', t);
                    if (r) localStorage.setItem('hrm_refresh_token', r);
                    sessionStorage.setItem('hrm_e2e_auth', '1');
                }
                localStorage.setItem(
                    'hrm_dismissed_announcements',
                    JSON.stringify(Array.from({ length: 5000 }, (_, i) => i + 1)),
                );
            },
            { t: state.token, r: state.refreshToken ?? '' },
        );

        await use(page);
    },
});

export { expect };
