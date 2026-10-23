/// <reference types="@cloudflare/workers-types" />

import type { Env } from './auth';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Single seam for outbound email via Resend.
 * Callers must treat a `{ delivered: false }` result as non-fatal
 * (auth flows deliberately do not reveal delivery status to the client).
 *
 * Config (Cloudflare secrets/vars, never committed):
 * - `RESEND_API_KEY` (secret via `wrangler secret put`)
 * - `MAIL_FROM` (var, e.g. `NSDC <noreply@mail.nsdcaseb.xyz>`)
 *
 * Missing key/from behaves as not-configured so the outbox queue simply
 * waits instead of throwing.
 */
export async function sendEmail(
  env: Env,
  msg: EmailMessage,
): Promise<{ delivered: boolean; detail: string }> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim() || 'NSDC <noreply@mail.nsdcaseb.xyz>';
  if (!apiKey) {
    console.log(
      '[mailer] not-configured',
      JSON.stringify({ to: msg.to, subject: msg.subject }),
    );
    return { delivered: false, detail: 'not-configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      }),
    });
    if (res.ok) {
      let detail = 'sent';
      try {
        const data = (await res.json()) as { id?: string };
        if (data?.id) detail = data.id;
      } catch {
        // Keep default detail; id is best-effort.
      }
      return { delivered: true, detail };
    }
    const body = (await res.text()).slice(0, 300);
    console.error('[mailer] resend rejected', res.status, body);
    return { delivered: false, detail: `resend:${res.status}` };
  } catch (err) {
    console.error('[mailer] resend send failed', err);
    return { delivered: false, detail: 'send-failed' };
  }
}
