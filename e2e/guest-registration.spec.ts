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
  // event page. Copy works without a native share sheet (headless desktop).
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const share = page.getByRole('region', { name: 'Share this event' });
  await expect(share).toBeVisible();
  await share.getByRole('button', { name: 'Copy link' }).click();
  await expect(share.getByText('Link copied.')).toBeVisible();

  // Reading the clipboard back is Chromium-only in CI; the URL shape itself is
  // covered by share.test.ts, and every browser still sees the copy feedback.
  if (browserName === 'chromium') {
    const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(sharedUrl).toBe(`${new URL(page.url()).origin}/registrations/${plainOpenEvent.id}`);

    // Following the shared link lands on the same public event page.
    await page.goto(sharedUrl);
    await expect(page.getByRole('heading', { name: plainOpenEvent.title })).toBeVisible();
  }
});
