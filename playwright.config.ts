import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list']],
  use: {
    baseURL,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'corepack npm run start -- --hostname 127.0.0.1 --port 3100',
    env: {
      ADMIN_GITHUB_IDS: 'e2e-owner',
      AUTH_SECRET: 'e2e-auth-secret-not-for-production',
      // Keep the owner health-route test deterministic and offline even when
      // a developer's ignored .env.local contains a valid AWS profile.
      AWS_RUNTIME_PRINCIPAL_ARN_PREFIX: 'e2e-health-disabled',
      NEXTAUTH_URL: baseURL,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
