import { test, expect, registerViaApi, uniqueEmail } from './fixtures';

// Member stepped flow on an event with a required question: an empty answer
// cannot advance past step 2 (native required validation), a filled answer
// completes the registration. Skips on an empty dev DB (see fixtures).

test('required event questions block empty answers, accept filled ones', async ({
  page,
  qEvent,
}) => {
  const required = qEvent.questions.filter((q) => q.required);
  expect(required.length, 'seeded event must have a required question').toBeGreaterThan(0);

  // NOTE: page.request shares cookies with the page, so the member session
  // created here is visible to the stepped flow below. The standalone
  // `request` fixture uses a separate context and would leave the page
  // logged out (guest form has no Continue button).
  await registerViaApi(page.request, {
    name: 'E2E Questions',
    email: uniqueEmail('questions'),
    mobile: '+911234567890',
    password: 'E2eTest123456',
  });

  await page.goto(`/registrations/${qEvent.id}`);
  await expect(page.getByRole('heading', { name: qEvent.title })).toBeVisible();

  // Step 1: member details (reg_number is not derived from e2e addresses).
  await page.getByPlaceholder('Your full name').fill('E2E Questions');
  await page.getByPlaceholder('Registration number').fill(`E2E-${Date.now().toString(36)}`);
  await page.getByRole('button', { name: 'Continue →' }).click();

  // Step 2: submitting with the required answer empty must not advance.
  const form = page.locator('form[aria-label="Event questions"]');
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Continue →' }).click();
  await expect(page.getByRole('heading', { name: '02 / Event questions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '03 / Confirm' })).toHaveCount(0);

  // Fill every required answer, then the flow completes through confirm.
  for (const q of required) {
    await page.getByLabel(q.label, { exact: false }).fill('I want to learn with the club.');
  }
  await form.getByRole('button', { name: 'Continue →' }).click();
  await expect(page.getByRole('heading', { name: '03 / Confirm' })).toBeVisible();
  await page.getByRole('button', { name: 'Register →' }).click();

  await expect(
    page.getByRole('heading', { name: /YOU’RE IN\.|YOU’RE ON THE WAITLIST\./ }),
  ).toBeVisible();
});
