import { test, expect, uniqueEmail } from './fixtures';

// Full credential loop with a fresh address per run: register (auto sign-in)
// -> sign out -> sign back in. Needs no seeded data.

test('register -> logout -> login', async ({ page }) => {
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

  // A successful register signs the member in and leaves the form behind.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  // Sign out via the site header.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();

  // Sign back in with the same credentials.
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});
