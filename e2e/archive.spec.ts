import { test, expect } from './fixtures';

// Landing archive: a manual carousel (no autoplay) fed by up to six images per
// event, linking out to the full /archive grid.

test('archive carousel advances manually and opens the /archive grid', async ({ page }) => {
  await page.goto('/');

  const carousel = page.getByRole('region', { name: 'Archive photos' });
  await expect(carousel).toBeVisible();

  const counter = carousel.getByText(/^\d{2} \/ \d{2}$/);
  await expect(counter).toBeVisible();
  const before = await counter.textContent();

  await page.getByRole('button', { name: 'Next photo' }).click();
  await expect(counter).not.toHaveText(before ?? '');

  await page.getByRole('link', { name: /Open the archive/ }).click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(page.getByRole('heading', { name: 'Archive' })).toBeVisible();
  await expect(page.locator('main img').first()).toBeVisible();
});
