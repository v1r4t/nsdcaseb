import { test, expect } from './fixtures';

// Narrow-viewport regression: at 390px the event index must not scroll
// sideways, and event titles take the full row width (see Registrations Row:
// `col-span-2 row-start-2` on phones). Title assertions only run when the DB
// actually has events; the no-overflow assertion always runs.

test.use({ viewport: { width: 390, height: 844 } });

test('390px: no horizontal overflow, event titles full-width', async ({ page }) => {
  await page.goto('/registrations');
  await expect(page.getByRole('heading', { name: 'EVENTS' })).toBeVisible();

  // The list renders after the events fetch resolves; wait for THAT request
  // (not just any /api/ call) so the count doesn't race the fetch. Local D1
  // is shared with concurrent verify-step writes, so a busy read may resolve
  // empty — reload once before concluding the DB is empty.
  const titles = page.locator('main li h3');
  for (let attempt = 0; ; attempt++) {
    await page
      .waitForResponse((r) => r.url().includes('/api/events') && r.ok(), { timeout: 15000 })
      .catch(() => null);
    if ((await titles.count()) > 0 || attempt >= 1) break;
    await page.reload();
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page must not scroll horizontally at 390px').toBeLessThanOrEqual(1);

  const count = await titles.count();
  test.skip(count === 0, 'no events in DB — title width check needs seeded data');
  const box = await titles.first().boundingBox();
  expect(box, 'first event title must be laid out').not.toBeNull();
  expect(box!.width, 'event title should span most of the 390px row').toBeGreaterThan(390 * 0.7);

  const bodyOverflow = await page.evaluate(() => {
    const wide = Array.from(document.querySelectorAll('main *')).filter((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 391;
    });
    return wide.length;
  });
  expect(bodyOverflow, 'no element inside main may exceed the 390px viewport').toBe(0);
});
