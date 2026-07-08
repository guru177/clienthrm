import { expect, test } from '@playwright/test';

test.describe('Public auth pages', () => {
    test('login page renders email and password fields', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByLabel(/email address/i)).toBeVisible();
        await expect(page.getByLabel(/^password$/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('forgot password page is reachable', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('link', { name: /forgot password/i }).click();
        await expect(page).toHaveURL(/forgot-password/);
    });

    test('unauthenticated admin route redirects to login', async ({ page }) => {
        await page.goto('/admin/users');
        await expect(page).toHaveURL(/login/);
    });
});

test.describe('Signup flow (public)', () => {
    test('signup page loads', async ({ page }) => {
        await page.goto('/signup');
        await expect(page.getByRole('heading', { name: /sign up|create/i })).toBeVisible();
    });
});
