import {
  clearEventRegistrations,
  deleteUserByEmail,
  expect,
  galleryTestPng,
  registerObViaApi,
  registerViaApi,
  test,
  uniqueEmail,
} from './fixtures';
import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test';

// Email policy + composer through the admin console:
//   - "What we send" shows exactly the enabled and retired kinds.
//   - A confirmed registration queues no confirmation mail; a waitlisted one
//     queues the waitlist notice.
//   - The TipTap composer queues a rich broadcast with the subject visible in
//     the outbox, and (when local Supabase storage is configured) the optional
//     image is uploaded to `email-assets` and announced in the text mirror.
// Local Resend is unconfigured, so nothing is delivered; rows stay pending.

const PASSWORD = 'E2eTest123456';
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

interface OutboxRow {
  to_email: string;
  subject: string;
  kind: string;
  status: string;
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

test('admin email: policy panel, silent confirmations, waitlist notice, rich broadcast', async ({
  browser,
  page,
  tinyEvent,
}) => {
  const baseURL = test.info().project.use.baseURL as string;
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const subject = `E2E broadcast ${stamp}`;
  const imageSubject = `E2E broadcast image ${stamp}`;
  const contexts: BrowserContext[] = [];
  const emailsToDelete: string[] = [];
  const adminEmail = uniqueEmail('email-ob');
  emailsToDelete.push(adminEmail);

  await clearEventRegistrations(tinyEvent.id);

  try {
    const confirmed = await signedInMember(browser, baseURL, 'E2E Mail Confirmed', 'mail-confirmed', '+919000000301');
    contexts.push(confirmed.context);
    emailsToDelete.push(confirmed.email);
    const waitlisted = await signedInMember(browser, baseURL, 'E2E Mail Waitlisted', 'mail-waitlisted', '+919000000302');
    contexts.push(waitlisted.context);
    emailsToDelete.push(waitlisted.email);

    expect(
      await registerForEvent(confirmed.context.request, tinyEvent.id, 'E2E Mail Confirmed', `E2EM1-${stamp}`),
    ).toBe('registered');
    expect(
      await registerForEvent(waitlisted.context.request, tinyEvent.id, 'E2E Mail Waitlisted', `E2EM2-${stamp}`),
    ).toBe('waitlisted');

    await registerObViaApi(page.request, {
      name: 'E2E Mail Admin',
      email: adminEmail,
      mobile: '+919000000303',
      password: PASSWORD,
    });

    await page.goto('/admin');
    await page.getByRole('button', { name: 'Open admin console' }).click();
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
    await page.getByRole('tab', { name: 'Email' }).click();

    const panel = page.getByRole('region', { name: 'Email and audit' });
    await expect(panel).toBeVisible();

    // The policy panel lists both sides of the policy, not just one.
    const policy = panel.getByRole('note', { name: 'What we send' });
    await expect(policy).toBeVisible();
    for (const enabled of [
      'Verification',
      'Password reset',
      'Waitlist join',
      'Waitlist promotion',
      'Recruitment decision',
      'Broadcast',
      'Delivery test',
    ]) {
      await expect(policy.getByText(enabled, { exact: true })).toBeVisible();
    }
    for (const disabled of ['Welcome', 'Registration confirmation', 'Event reminder']) {
      await expect(policy.getByText(disabled, { exact: true })).toBeVisible();
    }

    // A confirmed seat is silent: no registration_confirmation row exists.
    const confirmations = await pendingOutbox(page.request, 'registration_confirmation');
    expect(
      confirmations.some((row) => row.to_email === confirmed.email),
      JSON.stringify(confirmations),
    ).toBe(false);

    // A waitlisted seat still gets the separate waitlist notice.
    const waitlistRows = await pendingOutbox(page.request, 'waitlist');
    const notice = waitlistRows.find(
      (row) => row.to_email === waitlisted.email && row.subject.startsWith('Waitlisted:'),
    );
    expect(notice, JSON.stringify(waitlistRows)).toBeTruthy();
    expect(notice?.preview ?? '').toContain('on the waitlist');

    // --- Text broadcast, through the real composer -------------------------
    await panel.getByRole('radio', { name: 'Per-event' }).click();
    await panel.getByLabel('Broadcast event').selectOption(tinyEvent.id);
    await panel.getByLabel('Subject').fill(subject);

    const editor = panel.getByRole('textbox', { name: 'Broadcast message body' });
    await expect(panel.getByRole('button', { name: 'Bold' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Bulleted list' })).toBeVisible();
    await editor.click();
    await page.keyboard.press(`${MOD}+b`);
    await page.keyboard.type(`Hello members — ${stamp}`);
    await page.keyboard.press(`${MOD}+b`);

    const queue = panel.getByRole('button', { name: 'Queue broadcast' });
    await expect(queue).toBeEnabled();
    await queue.click();
    await expect(page.locator('p[role="status"]').first()).toContainText('Queued');

    const broadcasts = await pendingOutbox(page.request, 'broadcast');
    const queued = broadcasts.find(
      (row) => row.subject === subject && row.to_email === confirmed.email,
    );
    expect(queued, JSON.stringify(broadcasts)).toBeTruthy();
    expect(queued?.kind).toBe('broadcast');

    // --- Optional image, through the same composer -------------------------
    await panel.getByLabel('Subject').fill(imageSubject);
    await editor.click();
    await page.keyboard.type(`Image edition — ${stamp}`);
    await panel
      .getByLabel('Broadcast image')
      .setInputFiles({ name: 'e2e-broadcast.png', mimeType: 'image/png', buffer: galleryTestPng() });
    await panel.getByLabel('Image description').fill('E2E broadcast image');

    const uploadPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/admin/email/image') &&
        response.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await panel.getByRole('button', { name: 'Queue broadcast' }).click();
    const upload = await uploadPromise;

    if (upload.status() === 201) {
      await expect(page.locator('p[role="status"]').first()).toContainText('Queued');
      const withImage = await pendingOutbox(page.request, 'broadcast');
      const imageRow = withImage.find(
        (row) => row.subject === imageSubject && row.to_email === confirmed.email,
      );
      expect(imageRow, JSON.stringify(withImage)).toBeTruthy();
      expect(imageRow?.preview ?? '').toContain('[Image: E2E broadcast image]');
      expect(imageRow?.preview ?? '').toContain('email-assets');
    } else if (upload.status() === 503) {
      // Local storage is optional; skip only the image content assertion.
      test.info().annotations.push({
        type: 'note',
        description:
          'Broadcast image assertion skipped: local worker returned 503 storage_not_configured.',
      });
      await expect(page.locator('p[role="status"]').first()).toContainText('storage_not_configured');
      const afterFailedUpload = await pendingOutbox(page.request, 'broadcast');
      expect(afterFailedUpload.some((row) => row.subject === imageSubject)).toBe(false);
    } else {
      const body = await upload.text().catch(() => '');
      expect(upload.status(), body).toBe(201);
    }
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
