import { test, expect } from './fixtures';

// Deep-link contract: hash URLs land on (and reveal) the right section.
// Role/label selectors only — no CSS internals.

test('hash link /#about reveals the About section', async ({ page }) => {
  await page.goto('/#about');
  await expect(page).toHaveURL(/#about$/);
  const about = page.locator('section#about');
  await expect(about).toBeVisible();
  await expect(about.getByRole('heading', { name: 'Selected work.' })).toHaveCount(0);
  // The About section's mission statement is the stable content marker.
  await expect(about).toContainText('We bring students together');
});

test('hash link /#people reveals the People section', async ({ page }) => {
  await page.goto('/#people');
  await expect(page).toHaveURL(/#people$/);
  const people = page.locator('section#people');
  await expect(people).toBeVisible();
  await expect(people).toContainText('The people holding it together');
});

test('hash link /registrations#archive reveals the Archive section', async ({ page }) => {
  await page.goto('/registrations#archive');
  await expect(page).toHaveURL(/\/registrations#archive$/);
  await expect(page.getByRole('heading', { name: 'EVENTS' })).toBeVisible();
  const archive = page.locator('section#archive');
  await expect(archive).toBeVisible();
  await expect(archive.getByRole('heading', { name: 'Archive' })).toBeVisible();
});
