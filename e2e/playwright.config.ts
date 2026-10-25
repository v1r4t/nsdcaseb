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
//
// BROWSERS=chromium (default, fast local runs) or BROWSERS=all (CI:
// chromium + firefox + webkit). Chromium stays the local default so a cold
// laptop never waits on the big firefox/webkit downloads.
const browsers = process.env.BROWSERS ?? (process.env.CI ? 'all' : 'chromium');
const projects =
  browsers === 'all'
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Local D1 is one SQLite file shared with the dev server AND with sibling
  // verifyUserEmail wrangler invocations: keep local parallelism low so
  // concurrent writers don't hit SQLITE_BUSY (verifyUserEmail also retries).
  // With all three browser projects, serialize them: they share one D1, and
  // the capacity test mutates a single-seat event.
  workers: browsers === 'all' ? 1 : 2,
  reporter: 'list',
  // 60s: WebKit's full registration/waitlist/cancel flow is ~2x Chromium and
  // was tripping the old 30s budget mid-assertion.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:8787',
    trace: 'retain-on-failure',
    // Deterministic scans: the site honours prefers-reduced-motion by
    // collapsing every transition to instant, so axe never measures a
    // mid-reveal blend (which would fake contrast failures), and the
    // reduced-motion path itself gets exercised on every CI run.
    reducedMotion: 'reduce',
  },
  projects,
});
