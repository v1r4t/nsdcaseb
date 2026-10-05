/// <reference types="@cloudflare/workers-types" />

// Phase 5: admin dashboard + content-mutation API. Wired into the staging
// dispatcher by the orchestrator; this module owns every path under
// /api/admin plus the admin-only content mutations.
//
// Auth: unauthenticated -> 401, non-admin -> 403, wrong method -> 405+Allow.
// Broadcasts and every content mutation are recorded in admin_audit_log.
// (Event create/close already live in events.ts — deliberately left
// unaudited here; see Phase 5 report.)

import { getSessionUser, json, requireRole, type Env, type User } from './auth-helpers';
import { enqueueEmail } from './email';

const MAX_ADMIN_BODY_BYTES = 32 * 1024;

async function parseJson(
  request: Request,
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
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
  if (!requireRole(user, 'admin')) return json({ error: 'forbidden' }, 403);

  // GET /api/admin/stats
  if (path === '/api/admin/stats') {
    if (method !== 'GET') return methodNotAllowed('GET');
    const roleRows = (
      await env.AUTH_DB.prepare(`SELECT role, COUNT(*) AS n FROM users GROUP BY role`).all<{
        role: string;
        n: number;
      }>()
    ).results ?? [];
    const usersByRole = { member: 0, executive: 0, admin: 0 };
    let usersTotal = 0;
    for (const r of roleRows) {
      usersTotal += r.n;
      if (r.role === 'executive') usersByRole.executive += r.n;
      else if (r.role === 'admin') usersByRole.admin += r.n;
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
    const rows = (
      await env.AUTH_DB.prepare(
        `SELECT id, to_email, subject, status, attempts, created_at, sent_at
         FROM email_outbox WHERE status = ? ORDER BY created_at DESC LIMIT 50`,
      )
        .bind(status)
        .all<{
          id: string;
          to_email: string;
          subject: string;
          status: string;
          attempts: number;
          created_at: string;
          sent_at: string | null;
        }>()
    ).results ?? [];
    return json({ outbox: rows });
  }

  // POST /api/admin/broadcast
  if (path === '/api/admin/broadcast') {
    if (method !== 'POST') return methodNotAllowed('POST');
    const body = await parseJson(request);
    if (!body.ok) return body.response;
    const { audience, event_id: eventId, subject, body: text } = body.value;
    if (!nonEmpty(subject) || !nonEmpty(text)) return json({ error: 'subject_body_required' }, 400);
    if (audience !== 'all' && audience !== 'event') return json({ error: 'invalid_audience' }, 400);
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
      await enqueueEmail(env, r.email, (subject as string).trim(), (text as string).trim());
    }
    await audit(
      env,
      user,
      'broadcast',
      JSON.stringify({ audience, event_id: audience === 'event' ? eventId : null, queued: recipients.length }),
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
      const { name, role, cohort, photo_url: photoUrl } = body.value;
      if (!nonEmpty(name) || !nonEmpty(role)) return json({ error: 'name_role_required' }, 400);
      const id = crypto.randomUUID();
      await env.AUTH_DB.prepare(
        `INSERT INTO office_bearers (id, name, role, cohort, photo_url) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          (name as string).trim(),
          (role as string).trim(),
          typeof cohort === 'string' ? cohort : null,
          typeof photoUrl === 'string' ? photoUrl : null,
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
      for (const field of ['name', 'role', 'cohort', 'photo_url'] as const) {
        const value = body.value[field];
        if (value === undefined) continue;
        if (field === 'name' || field === 'role') {
          if (!nonEmpty(value)) return json({ error: `invalid_${field}` }, 400);
          args.push((value as string).trim());
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

  // Admin path we don't recognize, or a content path with an unsupported verb.
  if (isAdminPath) return json({ error: 'not_found' }, 404);
  if (sectionMatch) return methodNotAllowed('PUT');
  if (bearerMatch || achievementMatch) return methodNotAllowed('POST');
  return null;
}
