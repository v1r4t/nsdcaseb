import { test, expect } from './fixtures';

// Guest (logged-out) registration on an open event with no required
// questions: name + registration number -> confirmed (or waitlisted when the
// event happens to be full). Skips on an empty dev DB (see fixtures).

test('guest can register for an open event', async ({ page, plainOpenEvent, browserName }) => {
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

  // The confirmation/waitlist state invites the registrant to share the exact
  // event page. Firefox and WebKit do not implement Playwright's clipboard
  // permissions, so only Chromium exercises copy + read-back; every browser
  // still proves the share UI is present. URL shape is covered by share.test.ts.
  const share = page.getByRole('region', { name: 'Share this event' });
  await expect(share).toBeVisible();
  await expect(share.getByRole('button', { name: 'Copy link' })).toBeVisible();

  if (browserName === 'chromium') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await share.getByRole('button', { name: 'Copy link' }).click();
    await expect(share.getByText('Link copied.')).toBeVisible();

    const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(sharedUrl).toBe(`${new URL(page.url()).origin}/registrations/${plainOpenEvent.id}`);

    // Following the shared link lands on the same public event page.
    await page.goto(sharedUrl);
    await expect(page.getByRole('heading', { name: plainOpenEvent.title })).toBeVisible();
  }
});
