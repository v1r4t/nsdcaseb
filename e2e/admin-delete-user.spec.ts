import {
  clearEventRegistrations,
  deleteUserByEmail,
  expect,
  registerObViaApi,
  registerViaApi,
  test,
  uniqueEmail,
} from './fixtures';
import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test';

// Admin account deletion through the Accounts tab: member A holds the only
// seat, B is waitlisted, an OB deletes A with the typed confirmation. The
// account, its registration and pending mail are gone; B is promoted and
// mailed. The same endpoint refuses to delete the acting OB.

const PASSWORD = 'E2eTest123456';

interface OutboxRow {
  to_email: string;
  subject: string;
  kind: string;
  preview?: string | null;
}

async function signedInMember(
  browser: Browser,
  baseURL: string,
  name: string,
  prefix: string,
  mobile: string,
): Promise<{ context: BrowserContext; email: string }> {
  const context = await browser.newContext({ baseURL });
  const email = uniqueEmail(prefix);
  await registerViaApi(context.request, { name, email, mobile, password: PASSWORD });
  return { context, email };
}

async function registerForEvent(
  request: APIRequestContext,
  eventId: string,
  name: string,
  regNumber: string,
): Promise<string> {
  const res = await request.post(`/api/events/${encodeURIComponent(eventId)}/register`, {
    data: { name, reg_number: regNumber, answers: {} },
  });
  const text = await res.text();
  expect(res.status(), text).toBe(201);
  return (JSON.parse(text) as { status: string }).status;
}

async function pendingOutbox(request: APIRequestContext, kind: string): Promise<OutboxRow[]> {
  const res = await request.get(`/api/admin/outbox?kind=${encodeURIComponent(kind)}`);
  const text = await res.text();
  expect(res.status(), text).toBe(200);
  return (JSON.parse(text) as { outbox: OutboxRow[] }).outbox;
}

test('admin delete account removes registrations and promotes the waiter', async ({
  browser,
  page,
  request,
  tinyEvent,
}) => {
  const baseURL = test.info().project.use.baseURL as string;
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const contexts: BrowserContext[] = [];
  const emailsToDelete: string[] = [];
  const adminEmail = uniqueEmail('delete-ob');
  emailsToDelete.push(adminEmail);

  await clearEventRegistrations(tinyEvent.id);

  try {
    // Member A takes the only seat; member B is waitlisted behind them.
    const first = await signedInMember(browser, baseURL, 'E2E Delete First', 'delete-first', '+919000000201');
    contexts.push(first.context);
    emailsToDelete.push(first.email);
    const second = await signedInMember(browser, baseURL, 'E2E Delete Second', 'delete-second', '+919000000202');
    contexts.push(second.context);
    emailsToDelete.push(second.email);

    expect(
      await registerForEvent(first.context.request, tinyEvent.id, 'E2E Delete First', `E2ED1-${stamp}`),
    ).toBe('registered');
    expect(
      await registerForEvent(second.context.request, tinyEvent.id, 'E2E Delete Second', `E2ED2-${stamp}`),
    ).toBe('waitlisted');

    const pageB = await second.context.newPage();
    await pageB.goto(`/registrations/${tinyEvent.id}`);
    await expect(pageB.getByRole('heading', { name: /YOU’RE ON THE WAITLIST\./ })).toBeVisible();

    // The OB is the test's own page, so page.request carries its session.
    await registerObViaApi(page.request, {
      name: 'E2E Delete Admin',
      email: adminEmail,
      mobile: '+919000000203',
      password: PASSWORD,
    });

    await page.goto('/admin');
    await page.getByRole('button', { name: 'Open admin console' }).click();
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
    await page.getByRole('tab', { name: 'Accounts' }).click();

    const accounts = page.getByRole('region', { name: 'Accounts and roles' });
    await expect(accounts).toBeVisible();
    // A full college address is longer than D1's 50-byte LIKE-pattern limit;
    // this search also guards the worker's `instr` fix for that 500.
    await accounts.getByLabel('Search accounts by email or name').fill(first.email);

    const deleteButton = page.getByRole('button', { name: `Delete ${first.email}` });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    const dialog = page.getByRole('alertdialog', { name: `Delete account ${first.email}` });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(first.email);
    const confirm = dialog.getByLabel('Confirm email');
    await confirm.fill(first.email);

    const deleteAccount = dialog.getByRole('button', { name: 'Delete account' });
    await expect(deleteAccount).toBeEnabled();
    await deleteAccount.click();

    // The row leaves the account list and the panel closes.
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('table').getByText(first.email, { exact: true })).toHaveCount(0);
    await expect(page.locator('p[role="status"]').first()).toContainText('Deleted');

    // A's registration is gone from the roster; B now holds the seat.
    await page.getByRole('tab', { name: 'Registrations' }).click();
    const roster = page.getByRole('region', { name: 'Roster' });
    await expect(roster).toBeVisible();
    await roster.getByLabel('Event').selectOption(tinyEvent.id);

    const table = roster.getByRole('table');
    await expect(table.getByText(first.email, { exact: true })).toHaveCount(0);
    const rowB = table.getByRole('row').filter({ hasText: second.email });
    await expect(rowB).toBeVisible();
    await expect(rowB.getByText('registered', { exact: true })).toBeVisible();

    // B sees the promotion on their own event page...
    await pageB.reload();
    await expect(pageB.getByRole('heading', { name: /YOU’RE IN\./ })).toBeVisible();

    // ...and the promotion mail is queued.
    const waitlistMail = await pendingOutbox(page.request, 'waitlist');
    const promotion = waitlistMail.find(
      (row) => row.to_email === second.email && row.subject.startsWith("You're in:"),
    );
    expect(promotion, JSON.stringify(waitlistMail)).toBeTruthy();
    expect(promotion?.preview ?? '').toContain('A seat opened up');

    // The deleted account can no longer authenticate.
    const login = await request.post('/api/auth/login', {
      data: { email: first.email, password: PASSWORD },
    });
    expect(login.status()).toBe(401);

    // Self-delete is refused before the last-OB guard.
    const meRes = await page.request.get('/api/auth/me');
    expect(meRes.status()).toBe(200);
    const me = (await meRes.json()) as { user: { id: string; role: string } };
    expect(me.user.role).toBe('ob');
    const selfDelete = await page.request.delete(`/api/admin/users/${encodeURIComponent(me.user.id)}`);
    const selfDeleteBody = (await selfDelete.json()) as { error: string };
    expect(selfDelete.status()).toBe(400);
    expect(selfDeleteBody.error).toBe('cannot_delete_self');
  } finally {
    for (const context of contexts) {
      await context.close().catch(() => {});
    }
    for (const email of emailsToDelete) {
      await deleteUserByEmail(email).catch(() => {});
    }
    await clearEventRegistrations(tinyEvent.id).catch(() => {});
  }
});
