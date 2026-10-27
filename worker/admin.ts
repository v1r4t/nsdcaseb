/// <reference types="@cloudflare/workers-types" />

// Phase 5: admin dashboard + content-mutation API. Wired into the staging
// dispatcher by the orchestrator; this module owns every path under
// /api/admin plus the admin-only content mutations.
//
// Auth: unauthenticated -> 401, non-admin -> 403, wrong method -> 405+Allow.
// Broadcasts and every content mutation are recorded in admin_audit_log.
// (Event create/close already live in events.ts — deliberately left
// unaudited here; see Phase 5 report.)

import {
  EMAIL_RE,
  MAX_EMAIL_LENGTH,
  getSessionUser,
  json,
  requireMinRole,
  createEmailToken,
  normalizeRole,
  type Env,
  type User,
} from './auth-helpers';
import { enqueueEmail, isEmailKind, verificationEmail, waitlistPromotionEmail, type EmailKind } from './email';
import { broadcastText, htmlToText, isEmailAssetUrl, plainTextToHtml, renderBroadcastHtml, sanitizeBroadcastHtml } from './email-content';
import { sendEmail } from './mailer';
import { cancelRegistrationAndPromote } from './events';
import { storageConfigured, uploadEmailImage } from './supabase-storage';

const MAX_ADMIN_BODY_BYTES = 32 * 1024;
/** Hard cap for a broadcast image, matching the bucket's 10 MB limit loosely. */
const MAX_EMAIL_IMAGE_BYTES = 8 * 1024 * 1024;
/** Declared-body ceiling before multipart parsing: 8 MB file + envelope slack. */
const MAX_EMAIL_IMAGE_REQUEST_BYTES = 9 * 1024 * 1024;

async function parseJsonObject(
  request: Request,
  allowEmpty: boolean,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  if (buffer.byteLength > MAX_ADMIN_BODY_BYTES) {
    return { ok: false, response: json({ error: 'payload_too_large' }, 413) };
  }
  const text = new TextDecoder().decode(buffer).trim();
  if (text === '') {
    return allowEmpty
      ? { ok: true, value: {} }
      : { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

async function parseJson(
  request: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  return parseJsonObject(request, false);
}

/**
 * Like `parseJson`, but an absent/empty body means `{}`. Used by the email
 * test endpoint, where the only field (`to`) is optional.
 */
async function parseOptionalJson(
  request: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  return parseJsonObject(request, true);
}

async function audit(env: Env, admin: User, action: string, detail: string): Promise<void> {
  try {
    await env.AUTH_DB.prepare(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, detail) VALUES (?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), admin.id, action, detail)
      .run();
  } catch (err) {
    console.error('[admin] audit log write failed', err);
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Optional bearer `links`: array of { label, url } with http(s) URLs only. */
function validLinks(value: unknown): { label: string; url: string }[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > 10) return null;
  const out: { label: string; url: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { label, url } = item as Record<string, unknown>;
    if (typeof label !== 'string' || !label.trim() || label.length > 60) return null;
    if (typeof url !== 'string' || url.length > 500) return null;
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    out.push({ label: label.trim(), url: parsed.toString() });
  }
  return out;
}

function methodNotAllowed(allow: string): Response {
  return json({ error: 'method_not_allowed' }, 405, { Allow: allow });
}

export async function handleAdminApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  const isAdminPath = path === '/api/admin' || path.startsWith('/api/admin/');
  const sectionMatch = /^\/api\/content\/sections\/([^/]+)$/.exec(path);
  const bearerMatch = /^\/api\/content\/bearers(?:\/([^/]+))?$/.exec(path);
  const achievementMatch = /^\/api\/content\/achievements(?:\/([^/]+))?$/.exec(path);
  const isContentMutation =
    (sectionMatch && method === 'PUT') ||
    (bearerMatch && (method === 'POST' || method === 'PATCH' || method === 'DELETE')) ||
    (achievementMatch && (method === 'POST' || method === 'PATCH' || method === 'DELETE'));

  if (!isAdminPath && !isContentMutation) return null;

  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'unauthenticated' }, 401);
  if (!requireMinRole(user, 'ob')) return json({ error: 'forbidden' }, 403);

  // GET /api/admin/stats
  if (path === '/api/admin/stats') {
    if (method !== 'GET') return methodNotAllowed('GET');
    const roleRows = (
      await env.AUTH_DB.prepare(`SELECT role, COUNT(*) AS n FROM users GROUP BY role`).all<{
        role: string;
        n: number;
      }>()
    ).results ?? [];
    const usersByRole = { member: 0, executive: 0, ob: 0 };
    let usersTotal = 0;
    for (const r of roleRows) {
      usersTotal += r.n;
      if (r.role === 'executive') usersByRole.executive += r.n;
      else if (r.role === 'ob' || r.role === 'admin') usersByRole.ob += r.n;
      else usersByRole.member += r.n;
    }
    const eventsTotal =
      (await env.AUTH_DB.prepare(`SELECT COUNT(*) AS n FROM events`).first<{ n: number }>())?.n ?? 0;
    const regRows = (
      await env.AUTH_DB.prepare(`SELECT status, COUNT(*) AS n FROM registrations GROUP BY status`).all<{
        status: string;
        n: number;
      }>()
    ).results ?? [];
    const registrationsByStatus = { registered: 0, waitlisted: 0, cancelled: 0 };
    let registrationsTotal = 0;
    for (const r of regRows) {
      registrationsTotal += r.n;
      if (r.status === 'registered') registrationsByStatus.registered += r.n;
      else if (r.status === 'waitlisted') registrationsByStatus.waitlisted += r.n;
      else if (r.status === 'cancelled') registrationsByStatus.cancelled += r.n;
    }
    const outboxRows = (
      await env.AUTH_DB.prepare(`SELECT status, COUNT(*) AS n FROM email_outbox GROUP BY status`).all<{
        status: string;
        n: number;
      }>()
    ).results ?? [];
    const outbox = { pending: 0, sent: 0, failed: 0 };
    for (const r of outboxRows) {
      if (r.status === 'sent') outbox.sent += r.n;
      else if (r.status === 'failed') outbox.failed += r.n;
      else outbox.pending += r.n;
    }
    return json({ users_total: usersTotal, users_by_role: usersByRole, events_total: eventsTotal, registrations_total: registrationsTotal, registrations_by_status: registrationsByStatus, outbox });
  }

  // GET /api/admin/outbox
  if (path === '/api/admin/outbox') {
    if (method !== 'GET') return methodNotAllowed('GET');
    const status = url.searchParams.get('status') ?? 'pending';
    if (status !== 'pending' && status !== 'sent' && status !== 'failed') {
      return json({ error: 'invalid_status' }, 400);
    }
    const kindParam = url.searchParams.get('kind');
    let kind: EmailKind | null = null;
    if (kindParam) {
      if (!isEmailKind(kindParam)) return json({ error: 'invalid_kind' }, 400);
      kind = kindParam;
    }
    const rows = (
      await env.AUTH_DB.prepare(
        `SELECT id, to_email, subject, status, kind, attempts, created_at, sent_at,
                substr(text, 1, 500) AS preview
         FROM email_outbox WHERE status = ?${kind ? ' AND kind = ?' : ''}
         ORDER BY created_at DESC LIMIT 50`,
      )
        .bind(...(kind ? [status, kind] : [status]))
        .all<{
          id: string;
          to_email: string;
          subject: string;
          status: string;
          kind: string | null;
          attempts: number;
          created_at: string;
          sent_at: string | null;
          preview: string | null;
        }>()
    ).results ?? [];
    return json({ outbox: rows });
  }

  // POST /api/admin/outbox/:id/retry — reset a failed (or stuck pending)
  // entry back to pending with a clean attempt counter so the mailer seam
  // picks it up on its next pass. Audited like every other admin mutation.
  const outboxRetryMatch = /^\/api\/admin\/outbox\/([^/]+)\/retry$/.exec(path);
  if (outboxRetryMatch) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const entryId = decodeURIComponent(outboxRetryMatch[1]);
    const entry = await env.AUTH_DB.prepare(`SELECT id, status FROM email_outbox WHERE id = ?`).bind(entryId).first<{ id: string; status: string }>();
    if (!entry) return json({ error: 'outbox_not_found' }, 404);
    await env.AUTH_DB.prepare(
      `UPDATE email_outbox SET status = 'pending', attempts = 0, sent_at = NULL WHERE id = ?`,
    ).bind(entryId).run();
    await audit(env, user, 'outbox_retry', JSON.stringify({ id: entryId, from: entry.status }));
    return json({ ok: true });
  }

  // POST /api/admin/email/test — send one synchronous message through the
  // Resend seam so an admin can prove the key + sender domain in one click.
  // Deliberately returns 200 with `{ ok, delivered, detail }` even when the
  // worker is not configured or the provider rejects the message: the UI needs
  // that explanation. Only malformed requests get a 4xx.
  if (path === '/api/admin/email/test') {
    if (method !== 'POST') return methodNotAllowed('POST');
    const body = await parseOptionalJson(request);
    if (!body.ok) return body.response;
    const requested = body.value.to;
    let to = user.email;
    if (requested !== undefined) {
      if (typeof requested !== 'string') return json({ error: 'invalid_email' }, 400);
      to = requested.trim();
    }
    if (to.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(to)) {
      return json({ error: 'invalid_email' }, 400);
    }
    const result = await sendEmail(env, {
      to,
      subject: 'NSDC email test',
      text:
        'This is a test email from the NSDC admin console.\n\n' +
        'If you received it, Resend delivery is configured and the sender ' +
        'domain is accepted.\n\n' +
        `Requested by ${user.email} at ${new Date().toISOString()}.`,
    });
    await audit(
      env,
      user,
      'email_test',
      JSON.stringify({ to, delivered: result.delivered, detail: result.detail }),
    );
    return json({ ok: true, delivered: result.delivered, detail: result.detail });
  }

  // POST /api/admin/email/image — store an optional broadcast image in the
  // public `email-assets` bucket. Only JPEG/PNG under 8 MB; the returned URL is
  // the only image host the broadcast endpoint will accept.
  if (path === '/api/admin/email/image') {
    if (method !== 'POST') return methodNotAllowed('POST');
    // Refuse an oversized declared body before buffering the multipart form;
    // the per-file check below still guards chunked or lying clients.
    const declaredLength = request.headers.get('content-length');
    const declaredBytes = declaredLength === null ? Number.NaN : Number(declaredLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_EMAIL_IMAGE_REQUEST_BYTES) {
      return json({ error: 'invalid_image' }, 413);
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'invalid_image' }, 400);
    }
    const uploaded = form.get('image');
    if (!(uploaded instanceof File)) return json({ error: 'invalid_image' }, 400);
    const contentType = (uploaded.type || '').toLowerCase();
    if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
      return json({ error: 'invalid_image' }, 400);
    }
    if (uploaded.size <= 0 || uploaded.size > MAX_EMAIL_IMAGE_BYTES) {
      return json({ error: 'invalid_image' }, 400);
    }
    if (!storageConfigured(env)) return json({ error: 'storage_not_configured' }, 503);

    const typing = contentType === 'image/png' ? 'image/png' : 'image/jpeg';
    const data = await uploaded.arrayBuffer();
    const imageUrl = await uploadEmailImage(env, data, typing);
    if (!imageUrl) return json({ error: 'storage_upload_failed' }, 502);
    // Audit the location only; the bytes never enter the log.
    await audit(env, user, 'email_image_upload', JSON.stringify({ url: imageUrl }));
    return json({ url: imageUrl }, 201);
  }

  // POST /api/admin/broadcast
  if (path === '/api/admin/broadcast') {
    if (method !== 'POST') return methodNotAllowed('POST');
    const body = await parseJson(request);
    if (!body.ok) return body.response;
    const { audience, event_id: eventId, subject } = body.value;
    if (audience !== 'all' && audience !== 'event') return json({ error: 'invalid_audience' }, 400);
    if (!nonEmpty(subject)) return json({ error: 'subject_body_required' }, 400);
    const cleanSubject = subject.trim();
    if (cleanSubject.length > 200) return json({ error: 'invalid_subject' }, 400);

    // Rich body. `body`/`body_text` are the plain-text inputs (the legacy
    // wire field is `body`); `body_html` is the editor output.
    const rawHtml = typeof body.value.body_html === 'string' ? body.value.body_html : '';
    const legacyBody = typeof body.value.body === 'string' ? body.value.body : '';
    const providedText = typeof body.value.body_text === 'string' ? body.value.body_text : '';
    const plainText = providedText.trim() ? providedText : legacyBody;
    if (!rawHtml.trim() && !plainText.trim()) {
      return json({ error: 'subject_body_required' }, 400);
    }
    const bodyHtml = sanitizeBroadcastHtml(rawHtml.trim() ? rawHtml : plainTextToHtml(plainText));
    if (!htmlToText(bodyHtml)) return json({ error: 'subject_body_required' }, 400);
    const bodyText = plainText.trim() ? plainText.trim() : htmlToText(bodyHtml);

    // Optional image: only our own public `email-assets` bucket is accepted.
    let imageUrl: string | null = null;
    const requestedImage = body.value.image_url;
    if (requestedImage !== undefined && requestedImage !== null) {
      if (typeof requestedImage !== 'string') return json({ error: 'invalid_image_url' }, 400);
      const trimmedImage = requestedImage.trim();
      if (trimmedImage) {
        if (!isEmailAssetUrl(trimmedImage, env.SUPABASE_URL ?? '')) {
          return json({ error: 'invalid_image_url' }, 400);
        }
        imageUrl = trimmedImage;
      }
    }
    let imageAlt: string | null = null;
    const requestedAlt = body.value.image_alt;
    if (requestedAlt !== undefined && requestedAlt !== null) {
      if (typeof requestedAlt !== 'string' || requestedAlt.length > 200) {
        return json({ error: 'invalid_image_alt' }, 400);
      }
      imageAlt = requestedAlt.trim() || null;
    }

    const html = renderBroadcastHtml({ bodyHtml, imageUrl, imageAlt });
    const text = broadcastText(bodyText, imageUrl, imageAlt);

    let recipients: { email: string }[];
    if (audience === 'all') {
      recipients = (await env.AUTH_DB.prepare(`SELECT email FROM users ORDER BY email ASC`).all<{ email: string }>())
        .results ?? [];
    } else {
      if (typeof eventId !== 'string' || !eventId) return json({ error: 'event_required' }, 400);
      const event = await env.AUTH_DB.prepare(`SELECT id FROM events WHERE id = ?`).bind(eventId).first<{ id: string }>();
      if (!event) return json({ error: 'event_not_found' }, 404);
      recipients = (
        await env.AUTH_DB.prepare(
          `SELECT DISTINCT u.email AS email FROM registrations r
           JOIN users u ON u.id = r.user_id
           WHERE r.event_id = ? AND r.status IN ('registered', 'waitlisted') ORDER BY u.email ASC`,
        )
          .bind(eventId)
          .all<{ email: string }>()
      ).results ?? [];
    }
    for (const r of recipients) {
      await enqueueEmail(env, r.email, cleanSubject, text, {
        kind: 'broadcast',
        html,
      });
    }
    await audit(
      env,
      user,
      'broadcast',
      JSON.stringify({
        audience,
        event_id: audience === 'event' ? eventId : null,
        queued: recipients.length,
        has_image: imageUrl !== null,
      }),
    );
    return json({ queued: recipients.length }, 201);
  }

  // GET /api/admin/audit-log
  if (path === '/api/admin/audit-log') {
    if (method !== 'GET') return methodNotAllowed('GET');
    const entries = (
      await env.AUTH_DB.prepare(
        `SELECT a.action, a.detail, a.created_at, u.email AS admin_email
         FROM admin_audit_log a JOIN users u ON u.id = a.admin_user_id
         ORDER BY a.created_at DESC LIMIT 50`,
      ).all<{ action: string; detail: string; created_at: string; admin_email: string }>()
    ).results ?? [];
    return json({ entries });
  }

  // ---------------------------------------------------------------------
  // Account management + role assignment + verification (OB-only)
  // ---------------------------------------------------------------------
  if (path === '/api/admin/users') {
    if (method !== 'GET') return methodNotAllowed('GET');
    const search = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    // D1 caps LIKE/GLOB patterns at 50 bytes (SQLITE_LIMIT_LIKE_PATTERN_LENGTH),
    // so `%<full-college-email>%` fails with "LIKE or GLOB pattern too
    // complex" for ordinary addresses. `instr` is a literal substring test
    // with no pattern length limit (and treats `%`/`_` literally).
    const where = search
      ? "WHERE instr(lower(u.email), ?) > 0 OR instr(lower(COALESCE(u.name, '')), ?) > 0"
      : '';
    const args: unknown[] = search ? [search, search] : [];
    const rows = (
      await env.AUTH_DB
        .prepare(
          `SELECT u.id, u.email, u.name, u.mobile, u.reg_number, u.role, u.is_executive,
                  u.email_verified, u.created_at,
                  (SELECT COUNT(*) FROM registrations r WHERE r.user_id = u.id) AS registrations_count
           FROM users u ${where} ORDER BY u.created_at DESC LIMIT 200`,
        )
        .bind(...args)
        .all<{
          id: string; email: string; name: string | null; mobile: string | null; reg_number: string | null;
          role: string; is_executive: number; email_verified: number; created_at: string;
          registrations_count: number;
        }>()
    ).results ?? [];
    return json({
      users: rows.map((r) => ({
        id: r.id, email: r.email,
        name: r.name ?? '',
        mobile: r.mobile ?? '',
        reg_number: r.reg_number ?? null,
        role: normalizeRole(r.role),
        is_executive: !!r.is_executive,
        email_verified: !!r.email_verified,
        created_at: r.created_at,
        registrations_count: r.registrations_count,
      })),
    });
  }

  // DELETE /api/admin/users/:id — remove an account and everything tied to
  // it, freeing every confirmed seat it held. The guarded account delete and
  // the cleanup run in one batch: every dependent statement is gated on the
  // account actually being gone, so a refused guard leaves the database
  // untouched and a failure rolls the whole batch back. Events are never
  // deleted, and sent mail is kept as history.
  const userDeleteMatch = /^\/api\/admin\/users\/([^/]+)$/.exec(path);
  if (userDeleteMatch && method === 'DELETE') {
    const userId = decodeURIComponent(userDeleteMatch[1]);
    const target = await env.AUTH_DB.prepare(`SELECT id, email, role FROM users WHERE id = ?`)
      .bind(userId)
      .first<{ id: string; email: string; role: string }>();
    if (!target) return json({ error: 'user_not_found' }, 404);
    if (target.id === user.id) return json({ error: 'cannot_delete_self' }, 400);
    if (target.role === 'ob' || target.role === 'admin') {
      const count = (await env.AUTH_DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE role IN ('ob','admin')`).first<{ n: number }>())?.n ?? 0;
      if (count <= 1) return json({ error: 'last_ob' }, 400);
    }

    const registrations =
      (await env.AUTH_DB.prepare(`SELECT COUNT(*) AS n FROM registrations WHERE user_id = ?`)
        .bind(target.id)
        .first<{ n: number }>())?.n ?? 0;

    // One seat is freed per event that has not ended yet and where the account
    // held a confirmed spot. Past events are never promoted into.
    const heldEvents = (
      await env.AUTH_DB.prepare(
        `SELECT DISTINCT e.id AS id, e.title AS title, e.starts_at AS starts_at
         FROM registrations r JOIN events e ON e.id = r.event_id
         WHERE r.user_id = ? AND r.status = 'registered'
           AND datetime(e.ends_at) > datetime('now')
         ORDER BY e.starts_at ASC`,
      )
        .bind(target.id)
        .all<{ id: string; title: string; starts_at: string }>()
    ).results ?? [];

    const promotions: { eventId: string; eventTitle: string; id: string; email: string | null }[] = [];
    for (const event of heldEvents) {
      const next = await env.AUTH_DB.prepare(
        `SELECT r.id AS id, u.email AS email
         FROM registrations r LEFT JOIN users u ON u.id = r.user_id
         WHERE r.event_id = ? AND r.status = 'waitlisted'
         ORDER BY r.created_at ASC LIMIT 1`,
      )
        .bind(event.id)
        .first<{ id: string; email: string | null }>();
      if (next) promotions.push({ eventId: event.id, eventTitle: event.title, id: next.id, email: next.email });
    }

    // The OB count is evaluated inside the delete statement, so a concurrent
    // demotion can never leave the club with zero office bearers. All later
    // statements only apply when this delete removed the row (`NOT EXISTS`
    // is true after a successful delete, false when the guard refused).
    const accountGone = `NOT EXISTS (SELECT 1 FROM users WHERE id = ?)`;
    const guardedDelete = env.AUTH_DB.prepare(
      `DELETE FROM users
       WHERE id = ?
         AND (role NOT IN ('ob','admin')
              OR (SELECT COUNT(*) FROM users WHERE role IN ('ob','admin')) > 1)`,
    ).bind(target.id);
    const cleanup = [
      env.AUTH_DB.prepare(
        `DELETE FROM email_outbox WHERE to_email = ? AND status = 'pending' AND ${accountGone}`,
      ).bind(target.email, target.id),
      env.AUTH_DB.prepare(`DELETE FROM recruitment_applications WHERE email = ? AND ${accountGone}`)
        .bind(target.email, target.id),
      env.AUTH_DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND ${accountGone}`).bind(target.id, target.id),
      env.AUTH_DB.prepare(`DELETE FROM email_tokens WHERE user_id = ? AND ${accountGone}`).bind(target.id, target.id),
      env.AUTH_DB.prepare(`DELETE FROM registrations WHERE user_id = ? AND ${accountGone}`).bind(target.id, target.id),
      env.AUTH_DB.prepare(`DELETE FROM admin_audit_log WHERE admin_user_id = ? AND ${accountGone}`)
        .bind(target.id, target.id),
    ];
    const promotionUpdates = promotions.map((p) =>
      env.AUTH_DB.prepare(
        `UPDATE registrations SET status = 'registered'
         WHERE id = ? AND status = 'waitlisted' AND ${accountGone}`,
      ).bind(p.id, target.id),
    );
    const results = await env.AUTH_DB.batch([guardedDelete, ...cleanup, ...promotionUpdates]);

    if (((results[0]?.meta?.changes) ?? 0) === 0) {
      // Re-check to distinguish "someone else already removed it" from
      // "the atomic guard refused because it is the last OB".
      const stillThere = await env.AUTH_DB.prepare(`SELECT id FROM users WHERE id = ?`)
        .bind(target.id)
        .first<{ id: string }>();
      return stillThere ? json({ error: 'last_ob' }, 400) : json({ error: 'user_not_found' }, 404);
    }

    // A promotion whose row changed underneath us (no longer waitlisted) was
    // not applied: do not mail that person or claim it in the audit trail.
    const PROMOTION_OFFSET = 1 + cleanup.length;
    const promoted = promotions.filter(
      (_, i) => ((results[PROMOTION_OFFSET + i]?.meta?.changes) ?? 0) > 0,
    );

    // Delivery hiccups never fail the deletion the admin already made.
    for (const p of promoted) {
      if (!p.email) continue;
      try {
        const template = waitlistPromotionEmail(p.eventTitle);
        await enqueueEmail(env, p.email, template.subject, template.text, { kind: 'waitlist' });
      } catch (err) {
        console.error('[admin] promotion email enqueue failed', p.id, err);
      }
    }

    await audit(
      env,
      user,
      'user_delete',
      JSON.stringify({
        userId: target.id,
        email: target.email,
        role: target.role,
        registrations,
        promotions: promoted.map((p) => ({ eventId: p.eventId, email: p.email })),
      }),
    );
    return json({
      deleted: true,
      registrations,
      promotions: promoted.map((p) => ({ event_id: p.eventId, email: p.email })),
    });
  }

  const userRoleMatch = /^\/api\/admin\/users\/([^/]+)\/role$/.exec(path);
  if (userRoleMatch && method === 'PATCH') {
    const userId = decodeURIComponent(userRoleMatch[1]);
    const body = await parseJson(request);
    if (!body.ok) return body.response;
    const nextRole = body.value.role;
    if (nextRole !== 'member' && nextRole !== 'executive' && nextRole !== 'ob') {
      return json({ error: 'invalid_role' }, 400);
    }
    const target = await env.AUTH_DB.prepare(`SELECT id, role FROM users WHERE id = ?`).bind(userId).first<{ id: string; role: string }>();
    if (!target) return json({ error: 'user_not_found' }, 404);
    if ((target.role === 'ob' || target.role === 'admin') && nextRole !== 'ob') {
      const count = (await env.AUTH_DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE role IN ('ob','admin')`).first<{ n: number }>())?.n ?? 0;
      if (count <= 1) return json({ error: 'last_ob' }, 400);
    }
    await env.AUTH_DB
      .prepare(`UPDATE users SET role = ?, is_executive = ? WHERE id = ?`)
      .bind(nextRole, nextRole === 'executive' || nextRole === 'ob' ? 1 : 0, userId)
      .run();
    await audit(env, user, 'role_update', JSON.stringify({ userId, from: target.role, to: nextRole }));
    return json({ ok: true });
  }

  const userVerifiedMatch = /^\/api\/admin\/users\/([^/]+)\/verified$/.exec(path);
  if (userVerifiedMatch && method === 'PATCH') {
    const userId = decodeURIComponent(userVerifiedMatch[1]);
    const body = await parseJson(request);
    if (!body.ok) return body.response;
    const value = body.value.email_verified;
    if (value !== true && value !== false && value !== 0 && value !== 1) return json({ error: 'invalid_verified' }, 400);
    const target = await env.AUTH_DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first<{ id: string }>();
    if (!target) return json({ error: 'user_not_found' }, 404);
    await env.AUTH_DB
      .prepare(`UPDATE users SET email_verified = ? WHERE id = ?`)
      .bind(value === true || value === 1 ? 1 : 0, userId)
      .run();
    await audit(env, user, 'verified_update', JSON.stringify({ userId, verified: value === true || value === 1 }));
    return json({ ok: true });
  }

  if (path === '/api/admin/users/send-verification' && method === 'POST') {
    const body = await parseJson(request);
    if (!body.ok) return body.response;
    const ids = Array.isArray(body.value.ids) ? body.value.ids.filter((v): v is string => typeof v === 'string') : [];
    const where = ids.length ? `WHERE id IN (${ids.map(() => '?').join(',')}) AND (email_verified = 0 OR email_verified IS NULL)` : 'WHERE email_verified = 0 OR email_verified IS NULL';
    const targets = (await env.AUTH_DB.prepare(
      `SELECT id, email FROM users ${where}`,
    ).bind(...ids).all<{ id: string; email: string }>()).results ?? [];
    let queued = 0;
    const origin = new URL(request.url).origin;
    for (const t of targets) {
      try {
        const token = await createEmailToken(env, t.id, 'verify');
        const template = verificationEmail(origin, token);
        await enqueueEmail(env, t.email, template.subject, template.text, {
          kind: 'verification',
          html: template.html,
        });
        queued += 1;
      } catch (err) {
        console.error('[admin] verification enqueue failed', t.id, err);
      }
    }
    await audit(env, user, 'verification_send', JSON.stringify({ queued }));
    return json({ queued });
  }

  // PUT /api/content/sections/:key
  if (sectionMatch && !bearerMatch && !achievementMatch && path.startsWith('/api/content/sections/')) {
    if (method !== 'PUT') return methodNotAllowed('PUT');
    const key = decodeURIComponent(sectionMatch[1]);
    const body = await parseJson(request);
    if (!body.ok) return body.response;
    const { title, body: sectionBody } = body.value;
    if (title === undefined && sectionBody === undefined) return json({ error: 'nothing_to_update' }, 400);
    if (title !== undefined && typeof title !== 'string') return json({ error: 'invalid_title' }, 400);
    if (sectionBody !== undefined && typeof sectionBody !== 'string') {
      return json({ error: 'invalid_body' }, 400);
    }
    const existing = await env.AUTH_DB.prepare(`SELECT key FROM content_sections WHERE key = ?`).bind(key).first<{ key: string }>();
    if (!existing) return json({ error: 'unknown_section' }, 404);
    const patch: string[] = [];
    const args: unknown[] = [];
    if (title !== undefined) {
      patch.push('title = ?');
      args.push(title);
    }
    if (sectionBody !== undefined) {
      patch.push('body = ?');
      args.push(sectionBody);
    }
    patch.push(`updated_at = datetime('now')`);
    args.push(key);
    await env.AUTH_DB.prepare(`UPDATE content_sections SET ${patch.join(', ')} WHERE key = ?`).bind(...args).run();
    await audit(env, user, 'content_section_update', JSON.stringify({ key }));
    return json({ ok: true });
  }

  // Bearers trio
  if (bearerMatch && path.startsWith('/api/content/bearers')) {
    const bearerId = bearerMatch[1] ? decodeURIComponent(bearerMatch[1]) : null;
    if (method === 'POST' && bearerId === null) {
      const body = await parseJson(request);
      if (!body.ok) return body.response;
      const { name, role, cohort, photo_url: photoUrl, links } = body.value;
      if (!nonEmpty(name) || !nonEmpty(role)) return json({ error: 'name_role_required' }, 400);
      let linksJson = '[]';
      if (links !== undefined) {
        const clean = validLinks(links);
        if (clean === null) return json({ error: 'invalid_links' }, 400);
        linksJson = JSON.stringify(clean);
      }
      const id = crypto.randomUUID();
      await env.AUTH_DB.prepare(
        `INSERT INTO office_bearers (id, name, role, cohort, photo_url, links) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          (name as string).trim(),
          (role as string).trim(),
          typeof cohort === 'string' ? cohort : null,
          typeof photoUrl === 'string' ? photoUrl : null,
          linksJson,
        )
        .run();
      await audit(env, user, 'bearer_create', JSON.stringify({ id }));
      return json({ id }, 201);
    }
    if ((method === 'PATCH' || method === 'DELETE') && bearerId !== null) {
      const existing = await env.AUTH_DB.prepare(`SELECT id FROM office_bearers WHERE id = ?`).bind(bearerId).first<{ id: string }>();
      if (!existing) return json({ error: 'unknown_bearer' }, 404);
      if (method === 'DELETE') {
        await env.AUTH_DB.prepare(`DELETE FROM office_bearers WHERE id = ?`).bind(bearerId).run();
        await audit(env, user, 'bearer_delete', JSON.stringify({ id: bearerId }));
        return json({ deleted: true });
      }
      const body = await parseJson(request);
      if (!body.ok) return body.response;
      const patch: string[] = [];
      const args: unknown[] = [];
      for (const field of ['name', 'role', 'cohort', 'photo_url', 'links'] as const) {
        const value = body.value[field];
        if (value === undefined) continue;
        if (field === 'name' || field === 'role') {
          if (!nonEmpty(value)) return json({ error: `invalid_${field}` }, 400);
          args.push((value as string).trim());
        } else if (field === 'links') {
          const clean = validLinks(value);
          if (clean === null) return json({ error: 'invalid_links' }, 400);
          args.push(JSON.stringify(clean));
        } else {
          if (value !== null && typeof value !== 'string') return json({ error: `invalid_${field}` }, 400);
          args.push(value);
        }
        patch.push(`${field} = ?`);
      }
      if (patch.length === 0) return json({ error: 'nothing_to_update' }, 400);
      args.push(bearerId);
      await env.AUTH_DB.prepare(`UPDATE office_bearers SET ${patch.join(', ')} WHERE id = ?`).bind(...args).run();
      await audit(env, user, 'bearer_update', JSON.stringify({ id: bearerId }));
      return json({ ok: true });
    }
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
      return json({ error: method === 'POST' ? 'not_found' : 'unknown_bearer' }, 404);
    }
    return methodNotAllowed('POST');
  }

  // Achievements trio
  if (achievementMatch && path.startsWith('/api/content/achievements')) {
    const achievementId = achievementMatch[1] ? decodeURIComponent(achievementMatch[1]) : null;
    if (method === 'POST' && achievementId === null) {
      const body = await parseJson(request);
      if (!body.ok) return body.response;
      const { title, description, date } = body.value;
      if (!nonEmpty(title) || !nonEmpty(description)) {
        return json({ error: 'title_description_required' }, 400);
      }
      const id = crypto.randomUUID();
      await env.AUTH_DB.prepare(
        `INSERT INTO achievements (id, title, description, date) VALUES (?, ?, ?, ?)`,
      )
        .bind(id, (title as string).trim(), (description as string).trim(), typeof date === 'string' ? date : null)
        .run();
      await audit(env, user, 'achievement_create', JSON.stringify({ id }));
      return json({ id }, 201);
    }
    if ((method === 'PATCH' || method === 'DELETE') && achievementId !== null) {
      const existing = await env.AUTH_DB.prepare(`SELECT id FROM achievements WHERE id = ?`).bind(achievementId).first<{ id: string }>();
      if (!existing) return json({ error: 'unknown_achievement' }, 404);
      if (method === 'DELETE') {
        await env.AUTH_DB.prepare(`DELETE FROM achievements WHERE id = ?`).bind(achievementId).run();
        await audit(env, user, 'achievement_delete', JSON.stringify({ id: achievementId }));
        return json({ deleted: true });
      }
      const body = await parseJson(request);
      if (!body.ok) return body.response;
      const patch: string[] = [];
      const args: unknown[] = [];
      for (const field of ['title', 'description', 'date'] as const) {
        const value = body.value[field];
        if (value === undefined) continue;
        if (field === 'title' || field === 'description') {
          if (!nonEmpty(value)) return json({ error: `invalid_${field}` }, 400);
          args.push((value as string).trim());
        } else {
          if (value !== null && typeof value !== 'string') return json({ error: 'invalid_date' }, 400);
          args.push(value);
        }
        patch.push(`${field} = ?`);
      }
      if (patch.length === 0) return json({ error: 'nothing_to_update' }, 400);
      args.push(achievementId);
      await env.AUTH_DB.prepare(`UPDATE achievements SET ${patch.join(', ')} WHERE id = ?`).bind(...args).run();
      await audit(env, user, 'achievement_update', JSON.stringify({ id: achievementId }));
      return json({ ok: true });
    }
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
      return json({ error: method === 'POST' ? 'not_found' : 'unknown_achievement' }, 404);
    }
    return methodNotAllowed('POST');
  }

  // POST /api/admin/registrations/:id/cancel — admin-side cancellation. The
  // registration stays in the DB as `cancelled` (nothing is deleted); a
  // confirmed seat promotes the oldest waitlisted row in the same batch.
  const registrationCancelMatch = /^\/api\/admin\/registrations\/([^/]+)\/cancel$/.exec(path);
  if (registrationCancelMatch) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const registrationId = decodeURIComponent(registrationCancelMatch[1]);
    const row = await env.AUTH_DB.prepare(
      `SELECT r.id, r.event_id, r.status, r.user_type, r.student_name, r.reg_number,
              u.email, e.title AS event_title
       FROM registrations r
       LEFT JOIN users u ON u.id = r.user_id
       JOIN events e ON e.id = r.event_id
       WHERE r.id = ?`,
    )
      .bind(registrationId)
      .first<{
        id: string; event_id: string; status: string; user_type: string | null;
        student_name: string | null; reg_number: string | null; email: string | null;
        event_title: string;
      }>();
    if (!row) return json({ error: 'registration_not_found' }, 404);
    if (row.status === 'cancelled') return json({ error: 'already_cancelled' }, 409);

    const promoted = await cancelRegistrationAndPromote(env, {
      id: row.id,
      event_id: row.event_id,
      status: row.status,
    });

    // Delivery hiccups never fail the cancellation the admin already made.
    if (promoted?.email) {
      try {
        const template = waitlistPromotionEmail(row.event_title);
        await enqueueEmail(env, promoted.email, template.subject, template.text, { kind: 'waitlist' });
      } catch (err) {
        console.error('[admin] promotion email enqueue failed', promoted.id, err);
      }
    }

    await audit(
      env,
      user,
      'registration_cancel_admin',
      JSON.stringify({
        registrationId: row.id,
        eventId: row.event_id,
        email: row.email,
        previousStatus: row.status,
        promotedEmail: promoted?.email ?? null,
      }),
    );
    return json({ cancelled: true, promoted_email: promoted?.email ?? null });
  }

  const rosterCsvMatch = /^\/api\/admin\/events\/([^/]+)\/roster\.csv$/.exec(path);
  if (rosterCsvMatch) {
    if (method !== 'GET') return methodNotAllowed('GET');
    const eventId = decodeURIComponent(rosterCsvMatch[1]);
    const rows = (await env.AUTH_DB.prepare(
      `SELECT r.status, r.user_type, r.student_name, r.reg_number, r.answers, r.created_at, u.email
       FROM registrations r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.event_id = ? ORDER BY r.created_at DESC`,
    ).bind(eventId).all<{
      status: string; user_type: string | null; student_name: string | null; reg_number: string | null;
      answers: string; created_at: string; email: string | null;
    }>()).results ?? [];

    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = ['email,type,name,reg_number,status,answers,created_at'];
    for (const r of rows) {
      let answers = '';
      try { answers = JSON.stringify(JSON.parse(r.answers)); } catch { answers = r.answers; }
      lines.push([
        escape(r.email ?? ''),
        escape(r.user_type ?? ''),
        escape(r.student_name ?? ''),
        escape(r.reg_number ?? ''),
        escape(r.status),
        escape(answers),
        escape(r.created_at),
      ].join(','));
    }
    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="roster-${eventId}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }

  // Admin path we don't recognize, or a content path with an unsupported verb.
  if (isAdminPath) return json({ error: 'not_found' }, 404);
  if (sectionMatch) return methodNotAllowed('PUT');
  if (bearerMatch || achievementMatch) return methodNotAllowed('POST');
  return null;
}
