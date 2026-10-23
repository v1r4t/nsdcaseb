import { test, expect, registerViaApi, uniqueEmail } from './fixtures';
import type { Page } from '@playwright/test';

// Capacity lifecycle on a capacity-1 event: first member is confirmed, the
// second is waitlisted, and cancelling the first promotes the second.
// Two isolated browser contexts stand in for two members. Skips on an empty
// dev DB (see fixtures).

async function completeRegistrationFlow(page: Page, name: string, regNumber: string) {
  await page.getByPlaceholder('Your full name').fill(name);
  await page.getByPlaceholder('Registration number').fill(regNumber);
  await page.getByRole('button', { name: 'Continue →' }).click();

  // Step 2: answer inline when the event asks questions, else just continue.
  await expect(page.getByRole('heading', { name: '02 / Event questions' })).toBeVisible();
  const form = page.locator('form[aria-label="Event questions"]');
  if ((await form.count()) > 0) {
    for (const input of await form.locator('input[required]').all()) {
      await input.fill('E2E answer');
    }
    await form.getByRole('button', { name: 'Continue →' }).click();
  } else {
    await page.getByRole('button', { name: 'Continue →' }).click();
  }

  await expect(page.getByRole('heading', { name: '03 / Confirm' })).toBeVisible();
  await page.getByRole('button', { name: 'Register →' }).click();
}

test('capacity 1: first registers, second waitlists, cancel promotes', async ({
  browser,
  tinyEvent,
}) => {
  const baseURL = test.info().project.use.baseURL as string;
  const stamp = Date.now().toString(36);

  const ctxA = await browser.newContext({ baseURL });
  const ctxB = await browser.newContext({ baseURL });
  try {
    await registerViaApi(ctxA.request, {
      name: 'E2E First',
      email: uniqueEmail('cap-first'),
      mobile: '+911234567890',
      password: 'E2eTest123456',
    });
    await registerViaApi(ctxB.request, {
      name: 'E2E Second',
      email: uniqueEmail('cap-second'),
      mobile: '+911234567891',
      password: 'E2eTest123456',
    });

    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // First member takes the only seat.
    await pageA.goto(`/registrations/${tinyEvent.id}`);
    await completeRegistrationFlow(pageA, 'E2E First', `E2EA-${stamp}`);
    await expect(pageA.getByRole('heading', { name: /YOU’RE IN\./ })).toBeVisible();

    // Second member lands on the waitlist.
    await pageB.goto(`/registrations/${tinyEvent.id}`);
    await completeRegistrationFlow(pageB, 'E2E Second', `E2EB-${stamp}`);
    await expect(pageB.getByRole('heading', { name: /YOU’RE ON THE WAITLIST\./ })).toBeVisible();

    // First member cancels (two-click confirm); the waiter is promoted.
    await pageA.getByRole('button', { name: 'Cancel registration' }).click();
    await pageA.getByRole('button', { name: 'Yes, cancel my registration' }).click();
    await expect(pageA.getByText('Your registration was cancelled.')).toBeVisible();

    await pageB.reload();
    await expect(pageB.getByRole('heading', { name: /YOU’RE IN\./ })).toBeVisible();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
