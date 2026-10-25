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

async function expectNoBlockers(page: Page, url: string) {
  await page.goto(url);
  // Let client fetches (events/projects/media lists) settle so axe scans the
  // loaded state, not the skeleton.
  await page
    .waitForResponse((r) => r.url().includes('/api/') && r.ok(), { timeout: 15000 })
    .catch(() => null);
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
