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
    password: process.env.E2E_PASSWORD ?? 'Raintech123',
    orgSlug: process.env.E2E_ORG_SLUG ?? 'mashuptech',
};

/** Dismiss announcement carousel dialogs that block admin UI. */
export async function dismissOverlays(page: import('@playwright/test').Page) {
    await page.waitForLoadState('domcontentloaded');
    await expect
        .poll(
            async () => {
                const overlay = page.locator('[data-slot="dialog-overlay"][data-state="open"]');
                if (!(await overlay.isVisible().catch(() => false))) return true;

                const primary = page.getByRole('button', { name: /^(next|got it)$/i });
                if (await primary.isVisible().catch(() => false)) {
                    await primary.click();
                    return false;
                }

                await page.keyboard.press('Escape');
                return !(await overlay.isVisible().catch(() => false));
            },
            { timeout: 15_000 },
        )
        .toBe(true);
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

        await context.addInitScript(
            ({ t, r }) => {
                if (sessionStorage.getItem('hrm_e2e_auth')) return;
                localStorage.setItem('hrm_token', t);
                if (r) localStorage.setItem('hrm_refresh_token', r);
                sessionStorage.setItem('hrm_e2e_auth', '1');
            },
            { t: state.token, r: state.refreshToken ?? '' },
        );

        await use(page);
    },
});

export { expect };
