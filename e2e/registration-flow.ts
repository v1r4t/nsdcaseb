import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * Walk a signed-in member through the real three-step registration UI.
 *
 * Extracted from `capacity-waitlist.spec.ts` so the admin cancel/delete specs
 * exercise exactly the same product path instead of a copy that can drift.
 * The caller owns the final assertion (YOU'RE IN / waitlist) because that is
 * what each spec is proving.
 */
export async function completeRegistrationFlow(
  page: Page,
  name: string,
  regNumber: string,
): Promise<void> {
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
