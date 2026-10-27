import {
  clearEventRegistrations,
  deleteUserByEmail,
  expect,
  registerObViaApi,
  registerViaApi,
  test,
  uniqueEmail,
} from './fixtures';
import { completeRegistrationFlow } from './registration-flow';
import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test';

// Admin cancel through the real console: two signed-in members fill a
// capacity-1 event through the UI, a third lands on the waitlist, and an OB
// cancels from the roster. The confirmed seat promotes the oldest waiter, the
// promotion mail is queued, and cancelling a waitlisted row changes nothing.
// Serialised with the other capacity specs by playwright.config.ts (one local
// D1 + one single-seat event).

// Two full three-step registrations plus the admin console flow take roughly
// twice as long under WebKit; the global 60s budget expires mid-assertion.
test.setTimeout(120_000);

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

/** Register through the member API path (a real session is already present). */
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

test('admin cancel: confirmed row is cancelled and promotes the oldest waiter', async ({
  browser,
  tinyEvent,
}) => {
  const baseURL = test.info().project.use.baseURL as string;
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const members: { context: BrowserContext; email: string }[] = [];
  const emailsToDelete: string[] = [];
  let adminContext: BrowserContext | null = null;

  // Shared local D1: start from a clean seat count.
  await clearEventRegistrations(tinyEvent.id);

  try {
    const first = await signedInMember(browser, baseURL, 'E2E Cancel First', 'cancel-first', '+919000000101');
    members.push(first);
    emailsToDelete.push(first.email);
    const second = await signedInMember(browser, baseURL, 'E2E Cancel Second', 'cancel-second', '+919000000102');
    members.push(second);
    emailsToDelete.push(second.email);
    const third = await signedInMember(browser, baseURL, 'E2E Cancel Third', 'cancel-third', '+919000000103');
    members.push(third);
    emailsToDelete.push(third.email);

    const pageA = await first.context.newPage();
    const pageB = await second.context.newPage();

    // First member takes the only seat through the real UI.
    await pageA.goto(`/registrations/${tinyEvent.id}`);
    await completeRegistrationFlow(pageA, 'E2E Cancel First', `E2EC1-${stamp}`);
    await expect(pageA.getByRole('heading', { name: /YOU’RE IN\./ })).toBeVisible();

    // Second member lands on the waitlist through the real UI.
    await pageB.goto(`/registrations/${tinyEvent.id}`);
    await completeRegistrationFlow(pageB, 'E2E Cancel Second', `E2EC2-${stamp}`);
    await expect(pageB.getByRole('heading', { name: /YOU’RE ON THE WAITLIST\./ })).toBeVisible();

    // Third member is also waitlisted, behind the second (API registration path).
    expect(
      await registerForEvent(third.context.request, tinyEvent.id, 'E2E Cancel Third', `E2EC3-${stamp}`),
    ).toBe('waitlisted');

    // Office bearer in its own context, so the admin session is isolated too.
    adminContext = await browser.newContext({ baseURL });
    const adminEmail = uniqueEmail('cancel-ob');
    emailsToDelete.push(adminEmail);
    await registerObViaApi(adminContext.request, {
      name: 'E2E Cancel Admin',
      email: adminEmail,
      mobile: '+919000000104',
      password: PASSWORD,
    });
    const admin = await adminContext.newPage();

    await admin.goto('/admin');
    await admin.getByRole('button', { name: 'Open admin console' }).click();
    await expect(admin.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
    await admin.getByRole('tab', { name: 'Registrations' }).click();

    const roster = admin.getByRole('region', { name: 'Roster' });
    await expect(roster).toBeVisible();
    await roster.getByLabel('Event').selectOption(tinyEvent.id);

    const table = roster.getByRole('table');
    const rowA = table.getByRole('row').filter({ hasText: first.email });
    await expect(rowA).toBeVisible();
    await expect(rowA.getByText('registered', { exact: true })).toBeVisible();

    // Regression: the server CSV is newline-delimited (header + data rows),
    // not one line joined with a literal "\n" sequence.
    const csvRes = await admin.request.get(
      `/api/admin/events/${encodeURIComponent(tinyEvent.id)}/roster.csv`,
    );
    const csvBody = await csvRes.text();
    expect(csvRes.status(), csvBody).toBe(200);
    const csvLines = csvBody.split(/\r?\n/).filter((line) => line.trim().length > 0);
    expect(csvLines.length).toBeGreaterThan(1);
    expect(csvLines[0]).toContain('email,type,name,reg_number,status');

    // Confirmation is a native dialog: capture its copy and accept it.
    let cancelPrompt = '';
    admin.once('dialog', (dialog) => {
      cancelPrompt = dialog.message();
      void dialog.accept();
    });
    await rowA.getByRole('button', { name: 'Cancel' }).click();
    expect(cancelPrompt).toContain(first.email);
    expect(cancelPrompt).toContain('promote');

    // Nothing is deleted: the same roster row is back as cancelled.
    await expect(rowA.getByText('cancelled', { exact: true })).toBeVisible();
    const notice = admin.locator('p[role="status"]').first();
    await expect(notice).toContainText('Promoted');
    await expect(notice).toContainText(second.email);

    // The oldest waiter is promoted and gets the promotion mail.
    await pageB.reload();
    await expect(pageB.getByRole('heading', { name: /YOU’RE IN\./ })).toBeVisible();

    const waitlistMail = await pendingOutbox(admin.request, 'waitlist');
    const promotion = waitlistMail.find(
      (row) => row.to_email === second.email && row.subject.startsWith("You're in:"),
    );
    expect(promotion, JSON.stringify(waitlistMail)).toBeTruthy();
    expect(promotion?.preview ?? '').toContain('A seat opened up');

    // Cancelling a waitlisted row frees no seat: nobody else is promoted and
    // the second member stays confirmed.
    const rowC = table.getByRole('row').filter({ hasText: third.email });
    await expect(rowC.getByText('waitlisted', { exact: true })).toBeVisible();

    let waitlistCancelPrompt = '';
    admin.once('dialog', (dialog) => {
      waitlistCancelPrompt = dialog.message();
      void dialog.accept();
    });
    await rowC.getByRole('button', { name: 'Cancel' }).click();
    expect(waitlistCancelPrompt).toContain(third.email);
    await expect(rowC.getByText('cancelled', { exact: true })).toBeVisible();
    await expect(notice).not.toContainText('Promoted');

    const rowB = table.getByRole('row').filter({ hasText: second.email });
    await expect(rowB.getByText('registered', { exact: true })).toBeVisible();
    const afterWaitlistCancel = await pendingOutbox(admin.request, 'waitlist');
    const promotions = afterWaitlistCancel.filter(
      (row) =>
        (row.to_email === second.email || row.to_email === third.email) &&
        row.subject.startsWith("You're in:"),
    );
    expect(promotions).toHaveLength(1);
    expect(promotions[0].to_email).toBe(second.email);
  } finally {
    await adminContext?.close().catch(() => {});
    for (const member of members) {
      await member.context.close().catch(() => {});
    }
    for (const email of emailsToDelete) {
      await deleteUserByEmail(email).catch(() => {});
    }
    await clearEventRegistrations(tinyEvent.id).catch(() => {});
  }
});
