import { test, expect } from './fixtures';

// Guest (logged-out) registration on an open event with no required
// questions: name + registration number -> confirmed (or waitlisted when the
// event happens to be full). Skips on an empty dev DB (see fixtures).

test('guest can register for an open event', async ({ page, plainOpenEvent }) => {
  const regNumber = `E2E-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  await page.goto(`/registrations/${plainOpenEvent.id}`);
  await expect(page.getByRole('heading', { name: plainOpenEvent.title })).toBeVisible();

  const section = page.getByRole('region', { name: 'Guest registration' });
  await expect(section).toBeVisible();
  await section.getByLabel('Name').fill('E2E Guest');
  await section.getByLabel('Registration number').fill(regNumber);
  await section.getByRole('button', { name: 'Register' }).click();

  await expect(
    page.getByRole('heading', { name: /YOU’RE IN\.|YOU’RE ON THE WAITLIST\./ }),
  ).toBeVisible();
});
