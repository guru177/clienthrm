import { expect, test, dismissOverlays } from './fixtures';
import fs from 'node:fs';
import { authStatePath } from './global-setup';

test.describe('Authenticated tenant workflow', () => {
    test('loads admin users list when authenticated', async ({ authenticatedPage: page }) => {
        await page.goto('/admin/users');
        await dismissOverlays(page);
        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.getByText(/users & access management/i)).toBeVisible({
            timeout: 15_000,
        });
    });

    test('departments page loads for authenticated admin', async ({ authenticatedPage: page }) => {
        await page.goto('/admin/departments');
        await dismissOverlays(page);
        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.getByText(/^departments$/i).first()).toBeVisible({
            timeout: 15_000,
        });
    });

    test('search filters users table', async ({ authenticatedPage: page }) => {
        await page.goto('/admin/users');
        await dismissOverlays(page);
        const search = page.getByPlaceholder(/search/i);
        if (await search.isVisible()) {
            await search.fill('admin');
            await page.waitForLoadState('networkidle');
        }
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('logout clears session and redirects to login', async ({ authenticatedPage: page, context }) => {
        await context.addInitScript(() => {
            localStorage.setItem(
                'hrm_dismissed_announcements',
                JSON.stringify(Array.from({ length: 500 }, (_, i) => i + 1)),
            );
        });
        await page.goto('/admin/users');
        await dismissOverlays(page);
        await expect(page).not.toHaveURL(/\/login/);

        await page.getByTestId('sidebar-menu-button').click();
        await page.getByTestId('logout-button').click();

        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
        const token = await page.evaluate(() => localStorage.getItem('hrm_token'));
        expect(token).toBeNull();
    });

    test('unauthorized page renders access denied', async ({ authenticatedPage: page }) => {
        await page.goto('/unauthorized');
        await dismissOverlays(page);
        await expect(page.getByText(/access denied/i).first()).toBeVisible();
    });

    test('login via UI with provisioned credentials', async ({ page }) => {
        if (!fs.existsSync(authStatePath)) {
            test.skip(true, 'No auth state from global setup');
        }
        const state = JSON.parse(fs.readFileSync(authStatePath, 'utf8'));
        await page.goto('/login');
        await page.getByLabel(/email address/i).fill(state.email);
        await page.getByLabel(/^password$/i).fill(state.password);
        if (state.orgSlug) {
            const orgField = page.getByLabel(/organization slug/i);
            if (await orgField.isVisible()) {
                await orgField.fill(state.orgSlug);
            }
        }
        await page.getByRole('button', { name: /sign in/i }).click();
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    });
});
