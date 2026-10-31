import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// Accessibility contract: zero critical- or serious-impact findings on the
// main public routes. Minor/moderate findings are reported but do not fail —
// they are tracked separately, so routine content edits cannot silently
// introduce a blocker for keyboard/screen-reader users while minor
// colour-contrast nits do not break the build.
//
// Threshold: violations.filter(v => v.impact === 'critical' || v.impact === 'serious') must be empty.

/**
 * Let the page finish loading, then walk it top → bottom once so every
 * scroll-triggered entrance has fired, and return to the top. `Reveal` and
 * `Swoop` start below the fold at opacity 0; axe would otherwise scan the
 * pre-entrance tree (and skip colour-contrast on the hidden copy). The final
 * pause covers the longest entrance (Swoop 820 ms; Reveal 900 ms plus a
 * 300 ms People stagger) if the caller runs with motion enabled.
 */
async function settleForScan(page: Page): Promise<void> {
  // Client fetches (content/events/projects/media/lists) settle first so axe
  // scans the loaded state, not a skeleton. Best-effort: a failed fetch still
  // renders an honest empty state.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);

  await page.evaluate(async () => {
    const nextFrame = (): Promise<void> =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    const step = Math.max(240, Math.floor(window.innerHeight * 0.75));
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );
    for (let y = 0; y <= height; y += step) {
      window.scrollTo(0, y);
      await nextFrame();
    }
    window.scrollTo(0, 0);
    await nextFrame();
  });

  await page.waitForTimeout(1500);
}

async function expectNoBlockers(page: Page, url: string) {
  await page.goto(url);
  await settleForScan(page);
  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(
    blockers.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`),
    `axe blockers on ${url}`,
  ).toEqual([]);
}

test('axe: landing / has no critical/serious findings', async ({ page }) => {
  await expectNoBlockers(page, '/');
});

test('axe: /registrations has no critical/serious findings', async ({ page }) => {
  await expectNoBlockers(page, '/registrations');
});

test('axe: /archive has no critical/serious findings', async ({ page }) => {
  await expectNoBlockers(page, '/archive');
});

test('axe: /admin locked 404 state has no critical/serious findings', async ({ page }) => {
  // Locked camouflage 404 — do NOT click the zero-button; the scan covers
  // the state every visitor sees.
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await settleForScan(page);
  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(
    blockers.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`),
    'axe blockers on /admin (locked)',
  ).toEqual([]);
});

test('axe: project detail has no critical/serious findings', async ({ page, request }) => {
  const res = await request.get('/api/projects');
  test.skip(!res.ok(), 'projects API unavailable — cannot resolve a detail URL');
  const body = (await res.json()) as { projects?: Array<{ id: string }> };
  const first = body.projects?.[0];
  test.skip(!first, 'no projects in DB — detail scan needs at least one project');
  await expectNoBlockers(page, `/projects/${encodeURIComponent(first!.id)}`);
});
