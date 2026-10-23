import { test, expect } from './fixtures';

// A genuinely unknown route renders the plain 404: no zero-button, so there
// is no admin affordance to discover.

test('unknown route renders a plain 404 with an inert zero', async ({ page }) => {
  const response = await page.goto('/nope-this-route-does-not-exist-e2e');
  expect(response?.status()).toBe(404);

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open admin console' })).toHaveCount(0);

  // The "404" digits are static text: the only buttons on the page are the
  // "More about this error" cycler and the Back-home / Sign-in navigation.
  const buttons = page.getByRole('button');
  await expect(buttons.filter({ hasText: '0' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More about this error' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
});
