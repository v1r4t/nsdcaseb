import { test, expect } from './fixtures';

// /admin is camouflaged as the normal 404: the middle "0" of "404" is the only
// control, and activating it reveals the Admin console in place (URL stays
// /admin). The unlock is component state only, so reload re-locks.

test('admin door: locked 404 -> zero-button unlocks Admin in place -> reload re-locks', async ({
  page,
}) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);

  // Locked: looks like a 404 with one accessible zero-button.
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  const zero = page.getByRole('button', { name: 'Open admin console' });
  await expect(zero).toBeVisible();

  await zero.click();

  // Unlocked: an Admin heading appears (dashboard for ob, sign-in prompt for
  // guests, restricted notice for members) but the URL does not change.
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: /Admin/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open admin console' })).toHaveCount(0);

  // Reload re-locks the door.
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('button', { name: 'Open admin console' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
