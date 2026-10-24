/// <reference types="@cloudflare/workers-types" />

// Phase 5: email templates + outbox queue + scheduled sweep.
//
// Delivery via Resend (`mailer.ts` -> api.resend.com). Without
// `RESEND_API_KEY` the seam returns `{ delivered: false }` — failures are
// counted, never thrown, so the queue simply waits until the seam goes live.

import type { Env } from './auth-helpers';
import { sendEmail } from './mailer';

export interface EmailTemplate {
  subject: string;
  text: string;
}

/** Shared content shape for auth mails: text mirror always sent with html. */
export interface TemplatedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Single-column dark card; every mail passes action URL + fallback text. */
function mailShell(title: string, intro: string, actionLabel: string | null, actionUrl: string | null, outro: string): string {
  const button =
    actionLabel && actionUrl
      ? `<p style="margin:24px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 24px;background:#e8ff47;color:#111;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(actionLabel)}</a></p>`
      : '';
  const fallback =
    actionUrl
      ? `<p style="font-size:12px;color:#888;word-break:break-all">Button not working? Paste this link:<br>${escapeHtml(actionUrl)}</p>`
      : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0b0b0c;font-family:system-ui,sans-serif;color:#f2f2f0"><div style="max-width:480px;margin:0 auto;background:#151517;border:1px solid #2a2a2e;border-radius:12px;padding:32px"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1><p style="font-size:14px;line-height:1.6;color:#c9c9c6">${escapeHtml(intro)}</p>${button}<p style="font-size:14px;line-height:1.6;color:#c9c9c6">${escapeHtml(outro)}</p>${fallback}</div></body></html>`;
}

export function verificationEmail(origin: string, token: string): TemplatedEmail {
  const url = `${origin}/verify-email?token=${token}`;
  return {
    subject: 'Verify your NSDC account',
    text: `Verify your email: ${url}\n\nThis link works once and expires after an hour.`,
    html: mailShell('Verify your email', 'Confirm this address to activate your NSDC account.', 'Verify email', url, 'This link works once and expires after an hour.'),
  };
}

export function passwordResetEmail(origin: string, token: string): TemplatedEmail {
  const url = `${origin}/reset-password?token=${token}`;
  return {
    subject: 'Reset your NSDC password',
    text: `Reset your password: ${url}\n\nThis link works once and expires after an hour. If you did not ask for this, ignore this mail.`,
    html: mailShell('Reset your password', 'Someone asked to reset the password for this address.', 'Set a new password', url, 'This link works once and expires after an hour. If that was not you, ignore this mail.'),
  };
}

export function verifiedWelcomeEmail(): TemplatedEmail {
  return {
    subject: 'Your NSDC email is verified',
    text: 'Your email address has been verified. Welcome to NSDC! Sign in to register for events.',
    html: mailShell('You are verified', 'Your email address has been verified.', null, null, 'Welcome to NSDC — sign in to register for events.'),
  };
}

/**
 * Final recruitment verdict. Sent once, when an OB selects or rejects a
 * pending application. Both variants say no reply is needed so applicants
 * do not write back to an unmonitored inbox.
 */
export function recruitmentDecisionEmail(
  status: 'selected' | 'rejected',
  name?: string,
): EmailTemplate {
  const greeting = name && name.trim() ? `Hi ${name.trim()},` : 'Hi,';
  if (status === 'selected') {
    return {
      subject: 'NSDC recruitment: you are selected',
      text:
        `${greeting}\n\n` +
        `Good news — your application to join NSDC has been selected. ` +
        `We will follow up by email with onboarding details and next steps.\n\n` +
        `You do not need to reply to this message.\n\n` +
        `— NSDC`,
    };
  }
  return {
    subject: 'NSDC recruitment: application update',
    text:
      `${greeting}\n\n` +
      `Thank you for applying to join NSDC. After reviewing this round's ` +
      `applications, we are unable to offer you a place this time.\n\n` +
      `This is not a reflection of your potential, and we would be glad to ` +
      `see you apply again in a future round. You do not need to reply to ` +
      `this message.\n\n` +
      `— NSDC`,
  };
}

const MAX_ATTEMPTS = 5;

/** Confirmation for a fresh registration, or a waitlist notice with position. */
export function registrationConfirmation(
  eventTitle: string,
  status: 'registered' | 'waitlisted',
  waitlistPosition?: number,
): EmailTemplate {
  if (status === 'waitlisted') {
    const place = waitlistPosition ?? 1;
    return {
      subject: `Waitlisted: ${eventTitle}`,
      text:
        `You're #${place} on the waitlist for "${eventTitle}".\n\n` +
        `We'll email you if a spot opens up — no need to register again.`,
    };
  }
  return {
    subject: `Registered: ${eventTitle}`,
    text:
      `You're registered for "${eventTitle}".\n\n` +
      `We'll email you a reminder the day before it starts. See you there!`,
  };
}

/** Day-before reminder for an upcoming event. */
export function eventReminder(eventTitle: string, startsAt: string): EmailTemplate {
  let when = startsAt;
  const parsed = Date.parse(startsAt);
  if (!Number.isNaN(parsed)) when = new Date(parsed).toLocaleString();
  return {
    subject: `Reminder: ${eventTitle} starts soon`,
    text: `Reminder: "${eventTitle}" starts at ${when}.\n\nWe look forward to seeing you there!`,
  };
}

/** Append one pending row. Delivery happens later via `processOutbox`. */
export async function enqueueEmail(
  env: Env,
  toEmail: string,
  subject: string,
  text: string,
): Promise<void> {
  await env.AUTH_DB.prepare(
    `INSERT INTO email_outbox (id, to_email, subject, text, status) VALUES (?, ?, ?, ?, 'pending')`,
  )
    .bind(crypto.randomUUID(), toEmail, subject, text)
    .run();
}

interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  text: string;
  attempts: number;
}

/**
 * Attempt up to `limit` (default 20) oldest pending rows with attempts < 5.
 * Unconfigured seam (`delivered: false`) increments attempts and leaves the
 * row pending; attempts >= 5 flips it to 'failed'. Always resolves, never
 * throws — a poison row must not wedge the queue.
 */
export async function processOutbox(env: Env, limit = 20): Promise<{ processed: number }> {
  let rows: OutboxRow[] = [];
  try {
    rows =
      (
        await env.AUTH_DB.prepare(
          `SELECT id, to_email, subject, text, attempts FROM email_outbox
           WHERE status = 'pending' AND attempts < ? ORDER BY created_at ASC LIMIT ?`,
        )
          .bind(MAX_ATTEMPTS, limit)
          .all<OutboxRow>()
      ).results ?? [];
  } catch (err) {
    console.error('[email] outbox read failed', err);
    return { processed: 0 };
  }

  let processed = 0;
  for (const row of rows) {
    try {
      const result = await sendEmail(env, { to: row.to_email, subject: row.subject, text: row.text });
      if (result.delivered) {
        await env.AUTH_DB.prepare(
          `UPDATE email_outbox SET status = 'sent', sent_at = datetime('now') WHERE id = ?`,
        )
          .bind(row.id)
          .run();
      } else {
        const attempts = row.attempts + 1;
        await env.AUTH_DB.prepare(
          `UPDATE email_outbox SET attempts = ?, status = ? WHERE id = ?`,
        )
          .bind(attempts, attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', row.id)
          .run();
      }
      processed += 1;
    } catch (err) {
      console.error('[email] outbox row failed', row.id, err);
    }
  }
  return { processed };
}

/**
 * Cron entry point (the orchestrator wires it to scheduled): enqueue
 * reminders for events starting in 24–26h to their registered users —
 * skipping anyone who already has an identical reminder in the outbox —
 * then drain the queue via `processOutbox`. Never throws.
 */
export async function handleScheduled(env: Env): Promise<void> {
  try {
    const now = Date.now();
    const lo = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const hi = new Date(now + 26 * 60 * 60 * 1000).toISOString();
    const events = (
      await env.AUTH_DB.prepare(`SELECT id, title, starts_at FROM events WHERE starts_at >= ? AND starts_at <= ?`)
        .bind(lo, hi)
        .all<{ id: string; title: string; starts_at: string }>()
    ).results ?? [];

    for (const event of events) {
      try {
        const recipients = (
          await env.AUTH_DB.prepare(
            `SELECT u.email AS email FROM registrations r
             JOIN users u ON u.id = r.user_id
             WHERE r.event_id = ? AND r.status = 'registered'`,
          )
            .bind(event.id)
            .all<{ email: string }>()
        ).results ?? [];
        const template = eventReminder(event.title, event.starts_at);
        for (const { email } of recipients) {
          try {
            const existing = await env.AUTH_DB.prepare(
              `SELECT id FROM email_outbox WHERE to_email = ? AND subject = ? LIMIT 1`,
            )
              .bind(email, template.subject)
              .first<{ id: string }>();
            if (!existing) await enqueueEmail(env, email, template.subject, template.text);
          } catch (err) {
            console.error('[email] reminder enqueue failed', event.id, err);
          }
        }
      } catch (err) {
        console.error('[email] reminder sweep failed for event', event.id, err);
      }
    }
  } catch (err) {
    console.error('[email] reminder sweep failed', err);
  }

  try {
    await processOutbox(env);
  } catch (err) {
    console.error('[email] scheduled processOutbox failed', err);
  }
}
