import { test, expect } from './fixtures';

// History contract: back/forward between / and /registrations keeps the URL
// and the rendered content in sync (no blank shell, no stale route).

test('back/forward between / and /registrations preserves URL + content', async ({
  page,
}) => {
  await page.goto('/');
  // Landing hero marker — the scroll affordance only exists on the landing.
  await expect(page.getByRole('link', { name: 'Scroll to about section' })).toBeVisible();

  await page.goto('/registrations');
  await expect(page).toHaveURL(/\/registrations$/);
  await expect(page.getByRole('heading', { name: 'EVENTS' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Scroll to about section' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'EVENTS' })).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(/\/registrations$/);
  await expect(page.getByRole('heading', { name: 'EVENTS' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Scroll to about section' })).toHaveCount(0);
});
