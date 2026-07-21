import { expect } from '@playwright/test';
import { test, dismissOverlays } from './fixtures';

test.describe('Grocery Benefits Workflow', () => {
    test.beforeEach(async ({ authenticatedPage: page }) => {
        await page.route('**/api/auth/me', async (route) => {
            let response;
            try {
                response = await route.fetch();
            } catch {
                return;
            }
            let json;
            try {
                json = await response.json();
            } catch {
                await route.fulfill({ response });
                return;
            }
            if (json?.data) {
                if (!json.data.plan) json.data.plan = { modules: [] };
                json.data.plan.modules = Array.from(
                    new Set([
                        ...(json.data.plan.modules || []),
                        'grocery_benefits',
                        'my_grocery_benefits',
                    ]),
                );
                json.data.permissions = ['*'];
            }
            await route.fulfill({ response, json });
        });
    });

    test('admin can view enrolled employees and claims', async ({ authenticatedPage: page }) => {
        await page.route('**/api/admin/grocery-benefits**', async (route) => {
            if (route.request().url().includes('my-status')) {
                await route.fallback();
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: [
                        {
                            id: 1,
                            user_id: 2,
                            user_name: 'Test Employee',
                            start_date: '2026-07-01',
                            subsidy_percentage: 50,
                            monthly_allowance: 5000,
                            status: 'active',
                        },
                    ],
                }),
            });
        });
        await page.route('**/api/admin/grocery-claims**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: [
                        {
                            id: 1,
                            user_id: 2,
                            user_name: 'Test Employee',
                            claim_month: 7,
                            claim_year: 2026,
                            amount: 2000,
                            company_share: 1000,
                            employee_share: 1000,
                            is_free_month: 0,
                            status: 'pending',
                        },
                    ],
                }),
            });
        });

        await page.goto('/admin/grocery-benefits');
        await dismissOverlays(page);
        await expect(page.getByRole('heading', { name: 'Grocery Benefits' })).toBeVisible({
            timeout: 15_000,
        });

        await expect(page.getByText('Test Employee').first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(/5,000/).first()).toBeVisible();

        await page.getByRole('tab', { name: /Claims/ }).click();
        await expect(page.getByRole('cell', { name: /2,000\.00/ }).first()).toBeVisible({
            timeout: 10_000,
        });
        await expect(page.getByRole('button', { name: 'Review' }).first()).toBeVisible();
    });

    test('admin can enroll employee', async ({ authenticatedPage: page }) => {
        await page.route('**/api/admin/users/list**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        data: [
                            {
                                id: 3,
                                name: 'New Hire',
                                email: 'new@example.com',
                                date_of_joining: '2026-07-15',
                            },
                        ],
                    },
                }),
            });
        });

        await page.route('**/api/admin/grocery-benefits**', async (route) => {
            if (route.request().method() === 'POST') {
                const postData = JSON.parse(route.request().postData() || '{}');
                expect(postData.user_id).toBe(3);
                expect(postData.subsidy_percentage).toBe(75);
                expect(postData.monthly_allowance).toBe(8000);
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, message: 'Enrolled' }),
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: [] }),
            });
        });

        await page.goto('/admin/grocery-benefits');
        await dismissOverlays(page);
        await expect(page.getByRole('heading', { name: 'Grocery Benefits' })).toBeVisible({
            timeout: 15_000,
        });

        await page.getByRole('button', { name: /Enroll Employee/ }).click({ timeout: 15_000 });

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 10_000 });

        await dialog.getByRole('combobox').click();
        await page.getByRole('option', { name: /New Hire/ }).click();

        await dialog.locator('input[type="number"]').first().fill('75');
        await dialog.locator('input[type="number"]').nth(1).fill('8000');

        await dialog.getByRole('button', { name: 'Enroll Employee' }).click();
    });

    test('employee can view their benefits and submit a claim', async ({
        authenticatedPage: page,
    }) => {
        await page.route('**/api/admin/grocery-benefits/my-status**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        benefit: {
                            id: 1,
                            start_date: '2026-07-01',
                            subsidy_percentage: 50,
                            monthly_allowance: 5000,
                            status: 'active',
                        },
                        is_free_month: false,
                        effective_subsidy_percentage: 50,
                        used_this_month: 1000,
                        remaining_allowance: 4000,
                        current_month: 7,
                        current_year: 2026,
                        claims: [],
                    },
                }),
            });
        });

        await page.route('**/api/admin/grocery-claims**', async (route) => {
            if (route.request().method() === 'POST') {
                const postData = JSON.parse(route.request().postData() || '{}');
                expect(postData.amount).toBe(1000);
                expect(postData.description).toBe('Weekly veggies');
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, message: 'Claim submitted' }),
                });
                return;
            }
            await route.fallback();
        });

        await page.goto('/admin/my-grocery-benefits');
        await dismissOverlays(page);
        await expect(page.getByRole('heading', { name: /My Grocery Benefits/i })).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByText(/50%\s*Grocery Subsidy Active/i)).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByText(/4,000\.00/)).toBeVisible();

        await page.getByRole('button', { name: /Submit Claim/ }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 10_000 });

        await dialog.locator('input[type="number"]').fill('1000');
        await dialog.locator('textarea').fill('Weekly veggies');

        await dialog.getByRole('button', { name: 'Submit Claim', exact: true }).click();
    });
});
