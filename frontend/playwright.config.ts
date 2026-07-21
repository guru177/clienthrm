import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5174';

export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/global-setup.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    timeout: 60_000,
    use: {
        baseURL,
        testIdAttribute: 'data-testid',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
        ? undefined
        : [
              {
                  command: 'npm run dev -- --host 127.0.0.1 --port 5174',
                  url: 'http://127.0.0.1:5174',
                  reuseExistingServer: true,
                  timeout: 120_000,
              },
              ...(process.env.PLAYWRIGHT_SKIP_API
                  ? []
                  : [
                        {
                            command: 'cargo run',
                            cwd: '../backend',
                            url: 'http://127.0.0.1:3001/api/health',
                            reuseExistingServer: true,
                            timeout: 180_000,
                        },
                    ]),
          ],
});
