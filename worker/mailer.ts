/// <reference types="@cloudflare/workers-types" />

import type { Env } from './auth';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Single seam for outbound email. Phase 5 will replace the console log with a
 * real sender; callers must treat a `{ delivered: false }` result as non-fatal
 * (auth flows deliberately do not reveal delivery status to the client).
 *
 * TODO(Phase 5): send via the Microsoft 365 sender
 * `bl.sc.u4cse25155@bl.students.amrita.edu` (Graph API / SMTP) instead of
 * logging. Keep this signature stable.
 */
export async function sendEmail(
  env: Env,
  msg: EmailMessage,
): Promise<{ delivered: boolean; detail: string }> {
  // `env` is reserved for the future mail binding; intentionally unused today.
  void env;
  console.log(
    '[mailer] not-configured',
    JSON.stringify({ to: msg.to, subject: msg.subject, text: msg.text }),
  );
  return { delivered: false, detail: 'not-configured' };
}
