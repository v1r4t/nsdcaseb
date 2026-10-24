import { test, expect, deleteRecruitmentApplication, uniqueEmail } from './fixtures';
import type { Locator, Page } from '@playwright/test';

// Public recruitment flow at /recruit:
//   client validation -> submit -> reference ID -> status lookup -> duplicate 409.
// One application per run, cleaned up via local D1 afterwards, so re-runs do
// not accumulate rows in the admin list. Rate limits: POST /api/recruit allows
// 10/15 min per IP (we use 2: the real submit + the duplicate); status lookup
// allows 20/15 min (we use 1).

const WHY_JOIN =
  'I want to learn data science alongside other students and contribute to club events.';
const CONTRIBUTE =
  'I can help with event operations, write beginner tutorials and take photos.';

function applicant(prefix: string): {
  name: string;
  email: string;
  reg_number: string;
} {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return {
    name: `E2E Recruit ${stamp}`,
    email: uniqueEmail(prefix),
    reg_number: `E2E-R-${stamp}`,
  };
}

/** The application form (not the status-lookup form on the same page). */
function applicationForm(page: Page): Locator {
  return page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Submit application' }) });
}

function lookupForm(page: Page): Locator {
  return page.locator('form').filter({ has: page.getByRole('button', { name: 'Check status' }) });
}

async function fillApplication(
  form: Locator,
  input: { name: string; email: string; reg_number: string; phone: string },
): Promise<void> {
  await form.getByLabel('Full name').fill(input.name);
  await form.getByLabel('College email').fill(input.email);
  await form.getByLabel('Register ID').fill(input.reg_number);
  await form.getByLabel('Phone number').fill(input.phone);
  await form.getByLabel('Year of study').selectOption('2');
  await form.getByLabel('Branch').fill('Computer Science');
  await form.getByLabel('Why do you want to join?').fill(WHY_JOIN);
  await form.getByLabel('What can you contribute?').fill(CONTRIBUTE);
  await form.getByLabel('Time commitment').fill('4–6 hours a week');
}

test('recruit: client validation blocks a bad email and phone', async ({ page }) => {
  await page.goto('/recruit');

  await expect(page.getByRole('heading', { name: 'Join the corps.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Recruitment is open now.' })).toBeVisible();

  const form = applicationForm(page);
  const input = applicant('recruit-invalid');
  await fillApplication(form, { ...input, email: 'not-an-email', phone: '123' });

  await form.getByRole('button', { name: 'Submit application' }).click();

  // The client rules mirror the worker and paint aria-invalid + inline copy.
  await expect(form.getByLabel('College email')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByLabel('Phone number')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Use your @bl.students.amrita.edu college email.')).toBeVisible();
  await expect(page.getByText('Enter a phone number with 10 to 15 digits.')).toBeVisible();

  // Nothing was sent, so no success state and no reference ID.
  await expect(page.getByRole('heading', { name: 'Application received' })).toHaveCount(0);
  await expect(page.getByText(/Your reference ID is/)).toHaveCount(0);
});

test('recruit: submit -> reference ID -> under review -> duplicate 409', async ({ page }) => {
  const input = applicant('recruit');
  await page.goto('/recruit');

  const form = applicationForm(page);
  await fillApplication(form, { ...input, phone: '+91 98765 43210' });
  await form.getByRole('button', { name: 'Submit application' }).click();

  await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible();
  const referenceLine = page.getByText(/Your reference ID is/);
  await expect(referenceLine).toContainText(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
  );
  await expect(page.getByText('Status: Under review')).toBeVisible();

  // Public status lookup (same email + register ID) resolves to pending.
  const lookup = lookupForm(page);
  await lookup.getByLabel('College email').fill(input.email);
  await lookup.getByLabel('Register ID').fill(input.reg_number);
  await lookup.getByRole('button', { name: 'Check status' }).click();

  await expect(page.getByText('Under review', { exact: true })).toBeVisible();
  await expect(page.getByText(/Your application is under review/)).toBeVisible();

  // A second submit of the same application is rejected by the worker (409);
  // the page surfaces the machine code as human copy instead of crashing.
  const duplicate = await page.context().newPage();
  try {
    await duplicate.goto('/recruit');
    const duplicateForm = applicationForm(duplicate);
    await fillApplication(duplicateForm, { ...input, phone: '+91 98765 43210' });

    const responsePromise = duplicate.waitForResponse(
      (res) => res.url().endsWith('/api/recruit') && res.request().method() === 'POST',
    );
    await duplicateForm.getByRole('button', { name: 'Submit application' }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(409);
    expect((await response.json()) as { error?: string }).toMatchObject({
      error: 'already_applied',
    });
    await expect(duplicate.getByRole('alert')).toContainText(/already applied/i);
    await expect(duplicate.getByRole('heading', { name: 'Application received' })).toHaveCount(0);
  } finally {
    await duplicate.close();
    // Keep the shared local DB tidy for sibling specs / re-runs.
    await deleteRecruitmentApplication(input.email);
  }
});
