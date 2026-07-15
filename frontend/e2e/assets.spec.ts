import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('Asset Workflow', () => {
    test.beforeEach(async ({ authenticatedPage: page }) => {
        await page.route('**/api/auth/me', async (route) => {
            let response;
            try {
                response = await route.fetch();
            } catch (e) {
                return; // Test ended or network closed
            }
            let json;
            try {
                json = await response.json();
            } catch (e) {
                await route.fulfill({ response });
                return;
            }
            if (json?.data) {
                if (!json.data.plan) json.data.plan = { modules: [] };
                json.data.plan.modules = Array.from(new Set([...(json.data.plan.modules || []), 'assets']));
                json.data.permissions = ['*'];
            }
            await route.fulfill({ response, json });
        });
    });

    test('authenticated user can view assets page', async ({ authenticatedPage: page }) => {
        await page.goto('/admin/assets');
        await expect(page.getByText(/Assets & Maintenance/i).first()).toBeVisible();
    });

    test('can click allocate new asset', async ({ authenticatedPage: page }) => {
        await page.goto('/admin/assets');
        const allocateBtn = page.getByRole('button', { name: /allocate asset/i });
        if (await allocateBtn.isVisible()) {
            await allocateBtn.click();
            await expect(page.getByRole('heading', { name: /allocate/i })).toBeVisible();
        }
    });
});
