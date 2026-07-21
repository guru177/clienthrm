import { expect, test, dismissOverlays } from './fixtures';

test.describe('Mobile PWA shell (RBAC tabs)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('shows bottom nav on phone viewport when authenticated', async ({
        authenticatedPage: page,
    }) => {
        await page.goto('/admin/attendance');
        await dismissOverlays(page);
        await expect(page).not.toHaveURL(/\/login/);

        const nav = page.getByTestId('mobile-bottom-nav');
        await expect(nav).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId('mobile-tab-more')).toBeVisible();
    });

    test('More sheet lists profile settings', async ({ authenticatedPage: page }) => {
        await page.goto('/admin/attendance');
        await dismissOverlays(page);
        await page.getByTestId('mobile-tab-more').click();
        await expect(page.getByText(/view & edit my profile|profile & settings/i)).toBeVisible({ timeout: 8_000 });
        await expect(page.getByRole('link', { name: /^profile$/i })).toBeVisible({ timeout: 5_000 });
    });

    test('leave page uses mobile cards layout', async ({ authenticatedPage: page }) => {
        await page.goto('/admin/leave-requests');
        await dismissOverlays(page);
        if (page.url().includes('/unauthorized')) {
            test.skip(true, 'User lacks leave permission');
        }
        await expect(page.getByRole('heading', { name: /leave/i }).first()).toBeVisible({
            timeout: 15_000,
        });
        // Mobile card list is md:hidden; assert the marker exists in the DOM for phone viewports.
        const cards = page.getByTestId('leave-mobile-cards');
        await expect(cards).toBeAttached({ timeout: 15_000 });
        await expect(cards).toBeVisible({ timeout: 5_000 });
    });

    test('desktop width hides bottom nav', async ({ authenticatedPage: page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/admin/attendance');
        await dismissOverlays(page);
        await expect(page.getByTestId('mobile-bottom-nav')).toHaveCount(0);
    });
});
