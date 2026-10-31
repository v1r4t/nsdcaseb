import { test, expect } from './fixtures';

// Landing archive: the shared Index+Stage index (which replaced the retired
// manual carousel) leading into the full /archive grid. Playwright's default
// 1280x720 viewport gets the interactive nav; below 768px / under reduced
// motion the same items render as a stacked list. /api/media may be seeded or
// empty locally, so both the index and the honest empty state must reach
// /archive.

// The suite defaults to reduced motion (instant reveals for the axe scan), but
// IndexStage deliberately drops its pinned two-column interaction under
// reduced motion. This assertion is about that desktop interaction, so opt
// back in to full motion for this file only.
test.use({ reducedMotion: 'no-preference' });

test('landing archive index opens the /archive grid', async ({ page }) => {
  await page.goto('/');

  const section = page.getByRole('region', { name: 'Archive' });
  await expect(section).toBeVisible();

  const index = section.getByRole('navigation', { name: 'Archive index' });
  const empty = section.getByText('The archive is empty for now.');
  await expect(index.or(empty)).toBeVisible();

  if (await index.isVisible()) {
    // Seeded: a real row and the stage it activates are both rendered.
    await expect(index.getByRole('link').first()).toBeVisible();
    await expect(section.getByRole('group').first()).toBeVisible();
  }

  await section.getByRole('link', { name: /Open the archive/ }).first().click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(page.getByRole('heading', { name: 'Archive' })).toBeVisible();
});
