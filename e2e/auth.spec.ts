import { test, expect, verifyUserEmail, uniqueEmail } from './fixtures';

// Full credential loop with a fresh address per run: register (lands on
// verify-pending since new accounts verify first) -> emulate the
// verify-email click -> sign in -> sign out -> sign back in.
// Needs seeded D1 only for the wrangler CLI; no seeded rows required.

test('register -> verify -> login -> logout -> login', async ({ page }) => {
  const email = uniqueEmail('auth');
  const password = 'E2eTest123456';

  // Register.
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Name').fill('E2E Member');
  await page.getByLabel('Mobile number').fill('+911234567890');
  await page.getByLabel('Email').fill(email);
  // "Password" is a substring of "Confirm password"; match the exact label.
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // A fresh register creates no session: the member must verify first.
  await expect(page).toHaveURL(/\/verify-pending$/);
  await verifyUserEmail(email);

  // Sign in with the verified credentials.
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  // Sign out via the site header.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();

  // Sign back in with the same credentials.
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible();

  // Regression: the session query must return profile fields, not just auth ones.
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  const meBody = (await me.json()) as { user: { name: string; email: string } };
  expect(meBody.user.name).toBe('E2E Member');
  expect(meBody.user.email).toBe(email);
});
