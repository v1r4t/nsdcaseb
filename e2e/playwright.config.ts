import { defineConfig, devices } from '@playwright/test';

// E2E against a locally running staging worker:
//   npm run build:site
//   npx wrangler d1 migrations apply nsdc-auth --local -c wrangler.staging.jsonc
//   npx wrangler d1 execute nsdc-auth --local --file=e2e/seed.sql -c wrangler.staging.jsonc
//   npx wrangler dev -c wrangler.staging.jsonc --port 8787
//   npm run test:e2e
//
// The config deliberately has NO webServer block: a sibling agent owns port
// 8787 during development, and CI starts wrangler explicitly (see
// .github/workflows/ci.yml). Override the target with BASE_URL when needed.
export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:8787',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
