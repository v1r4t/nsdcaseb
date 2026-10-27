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

/**
 * Every queued mail is tagged with one of these kinds. The tag drives the
 * admin console filter and lets a migration delete rows for retired sends.
 */
export type EmailKind =
  | 'verification'
  | 'password_reset'
  | 'waitlist'
  | 'recruitment_decision'
  | 'broadcast'
  | 'test'
  | 'registration_confirmation'
  | 'event_reminder'
  | 'other';

/** Runtime mirror of `EmailKind`, used to validate the admin filter. */
export const EMAIL_KINDS: readonly EmailKind[] = [
  'verification',
  'password_reset',
  'waitlist',
  'recruitment_decision',
  'broadcast',
  'test',
  'registration_confirmation',
  'event_reminder',
  'other',
];

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === 'string' && (EMAIL_KINDS as readonly string[]).includes(value);
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

/**
 * Waitlist notice with the member's place in line. This is the only
 * registration-time mail we still send: confirmed registrations are silent
 * (the confirmation screen already tells the member they are in).
 */
export function waitlistNotice(eventTitle: string, position: number): EmailTemplate {
  const place = Math.max(1, position);
  return {
    subject: `Waitlisted: ${eventTitle}`,
    text:
      `You're #${place} on the waitlist for "${eventTitle}".\n\n` +
      `We'll email you if a spot opens up — no need to register again.`,
  };
}

/** Sent when a cancellation frees a seat and the oldest waiter is promoted. */
export function waitlistPromotionEmail(eventTitle: string): EmailTemplate {
  return {
    subject: `You're in: ${eventTitle}`,
    text: `A seat opened up — you're registered for "${eventTitle}". See you there!`,
  };
}

/** Append one pending row. Delivery happens later via `processOutbox`. */
export async function enqueueEmail(
  env: Env,
  toEmail: string,
  subject: string,
  text: string,
  opts: { kind: EmailKind; html?: string | null } = { kind: 'other' },
): Promise<void> {
  await env.AUTH_DB.prepare(
    `INSERT INTO email_outbox (id, to_email, subject, text, html, kind, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
  )
    .bind(crypto.randomUUID(), toEmail, subject, text, opts.html ?? null, opts.kind)
    .run();
}

interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  text: string;
  html: string | null;
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
          `SELECT id, to_email, subject, text, html, attempts FROM email_outbox
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
      const result = await sendEmail(env, {
        to: row.to_email,
        subject: row.subject,
        text: row.text,
        ...(row.html ? { html: row.html } : {}),
      });
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
 * Cron entry point (the orchestrator wires it to scheduled): drain the
 * queue via `processOutbox`. Event reminders are no longer generated — the
 * only scheduled work left is delivery. Never throws.
 */
export async function handleScheduled(env: Env): Promise<void> {
  try {
    await processOutbox(env);
  } catch (err) {
    console.error('[email] scheduled processOutbox failed', err);
  }
}
