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
        .filter({ hasText: /company announcement|HR Daddy/i })
        .first();

    await dialog.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => null);

    for (let i = 0; i < 6; i += 1) {
        if (!(await dialog.isVisible().catch(() => false))) return;

        const action = dialog.getByRole('button', { name: /^(next|got it|close|dismiss)$/i });
        if (await action.first().isVisible().catch(() => false)) {
            await action.first().click();
        } else {
            await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(250);
    }

    await expect(dialog).toBeHidden({ timeout: 3_000 });
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
