/// <reference types="@cloudflare/workers-types" />

// Phase 3: events + registrations API. Wired into the staging dispatcher by
// the orchestrator; this module owns every path under /api/events.

import { getSessionUser, json, requireRole } from './auth-helpers';
import type { Env } from './auth-helpers';
import { enqueueEmail, registrationConfirmation } from './email';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// auth-helpers' readJsonBody caps bodies at 2KB (tuned for auth); answers can
// legitimately exceed that, so events routes parse with a roomier limit.
const MAX_EVENT_BODY_BYTES = 32 * 1024;

export interface EventQuestion {
  id: string;
  label: string;
  required: boolean;
  maxLength: number;
}

interface EventRow {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  reg_opens_at: string;
  reg_closes_at: string;
  capacity: number | null;
  force_closed: number;
  questions: string;
}

type RegStatus = 'registered' | 'waitlisted' | 'cancelled';

async function parseJson(request: Request): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  if (buffer.byteLength > MAX_EVENT_BODY_BYTES) {
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

function registrationOpen(row: EventRow, now: number): boolean {
  if (row.force_closed) return false;
  const opens = Date.parse(row.reg_opens_at);
  const closes = Date.parse(row.reg_closes_at);
  if (Number.isNaN(opens) || Number.isNaN(closes)) return false;
  return opens <= now && now <= closes;
}

function parseQuestions(raw: string): EventQuestion[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q): q is EventQuestion =>
        !!q && typeof q === 'object' && typeof (q as EventQuestion).id === 'string',
    );
  } catch {
    return [];
  }
}

function validateQuestions(value: unknown): EventQuestion[] | null {
  if (!Array.isArray(value)) return null;
  const out: EventQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const q = item as Record<string, unknown>;
    if (typeof q.id !== 'string' || !ID_RE.test(q.id)) return null;
    if (typeof q.label !== 'string' || !q.label.trim() || q.label.length > 200) return null;
    const maxLength =
      q.maxLength === undefined ? 500 : typeof q.maxLength === 'number' ? Math.floor(q.maxLength) : NaN;
    if (!Number.isFinite(maxLength) || maxLength < 1 || maxLength > 500) return null;
    out.push({ id: q.id, label: q.label, required: q.required === true, maxLength });
  }
  if (out.length > 20) return null;
  return out;
}

/** Required answers present; every answer a string within its (capped) limit. */
function validateAnswers(questions: EventQuestion[], answers: unknown): Record<string, string> | null {
  if (answers === undefined) answers = {};
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) return null;
  const record = answers as Record<string, unknown>;
  const clean: Record<string, string> = {};
  for (const q of questions) {
    const raw = record[q.id];
    if (raw === undefined || raw === null || raw === '') {
      if (q.required) return null;
      continue;
    }
    if (typeof raw !== 'string' || raw.length > Math.min(500, q.maxLength)) return null;
    clean[q.id] = raw;
  }
  return clean;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validCapacity(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

async function registeredCounts(env: Env): Promise<Map<string, number>> {
  const rows = await env.AUTH_DB
    .prepare(`SELECT event_id, COUNT(*) AS n FROM registrations WHERE status = 'registered' GROUP BY event_id`)
    .all<{ event_id: string; n: number }>();
  return new Map((rows.results ?? []).map((r) => [r.event_id, r.n]));
}

export async function handleEventsApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/api/events' && !path.startsWith('/api/events/')) return null;
  const method = request.method.toUpperCase();
  const now = Date.now();

  // POST /api/events (admin create)
  if (path === '/api/events') {
    if (method === 'GET') {
      const user = await getSessionUser(env, request);
      const events = (await env.AUTH_DB.prepare(`SELECT * FROM events ORDER BY starts_at ASC`).all<EventRow>()).results ?? [];
      const counts = await registeredCounts(env);
      let mine = new Map<string, RegStatus>();
      if (user) {
        const rows = (await env.AUTH_DB.prepare(
          `SELECT event_id, status FROM registrations WHERE user_id = ? AND status != 'cancelled'`,
        ).bind(user.id).all<{ event_id: string; status: string }>()).results ?? [];
        mine = new Map(rows.map((r) => [r.event_id, r.status as RegStatus]));
      }
      return json({
        events: events.map((e) => {
          const registered = counts.get(e.id) ?? 0;
          const status = user ? mine.get(e.id) ?? null : null;
          return {
            id: e.id, title: e.title, description: e.description,
            starts_at: e.starts_at, ends_at: e.ends_at,
            reg_opens_at: e.reg_opens_at, reg_closes_at: e.reg_closes_at,
            capacity: e.capacity,
            spots_left: e.capacity === null ? null : Math.max(0, e.capacity - registered),
            registration_open: registrationOpen(e, now),
            mine: status ? { status } : null,
          };
        }),
      });
    }
    if (method === 'POST') {
      const user = await getSessionUser(env, request);
      if (!requireRole(user, 'admin')) {
        return user ? json({ error: 'forbidden' }, 403) : json({ error: 'unauthenticated' }, 401);
      }
      const body = await parseJson(request);
      if (!body.ok) return body.response;
      const v = body.value;
      if (typeof v.title !== 'string' || !v.title.trim()) return json({ error: 'title_required' }, 400);
      if (!validDate(v.starts_at) || !validDate(v.ends_at) || !validDate(v.reg_opens_at) || !validDate(v.reg_closes_at)) {
        return json({ error: 'invalid_dates' }, 400);
      }
      if (!validCapacity(v.capacity)) return json({ error: 'invalid_capacity' }, 400);
      const questions = v.questions === undefined ? [] : validateQuestions(v.questions);
      if (questions === null) return json({ error: 'invalid_questions' }, 400);
      const id = typeof v.id === 'string' && ID_RE.test(v.id) ? v.id : crypto.randomUUID();
      await env.AUTH_DB.prepare(
        `INSERT INTO events (id, title, description, starts_at, ends_at, reg_opens_at, reg_closes_at, capacity, force_closed, questions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, v.title.trim(), typeof v.description === 'string' ? v.description : '',
        v.starts_at, v.ends_at, v.reg_opens_at, v.reg_closes_at,
        v.capacity ?? null, v.force_closed ? 1 : 0, JSON.stringify(questions)).run();
      return json({ id }, 201);
    }
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
  }

  // /api/events/:id and sub-routes
  const rest = path.slice('/api/events/'.length);
  const [id, sub] = rest.split('/');
  if (!id || !ID_RE.test(id) || (sub !== undefined && !['register', 'my-registration', 'registrations'].includes(sub))) {
    if (sub !== undefined && sub !== 'register' && sub !== 'my-registration' && sub !== 'registrations') {
      return null; // not ours — let another handler try
    }
    return json({ error: 'event_not_found' }, 404);
  }
  if (sub !== undefined && rest.split('/').length > 2) return null;

  const event = await env.AUTH_DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first<EventRow>();
  if (!event) return json({ error: 'event_not_found' }, 404);
  const questions = parseQuestions(event.questions);

  if (!sub) {
    if (method === 'GET') {
      const user = await getSessionUser(env, request);
      let mine: { status: RegStatus } | null = null;
      if (user) {
        const row = await env.AUTH_DB.prepare(
          `SELECT status FROM registrations WHERE event_id = ? AND user_id = ? AND status != 'cancelled'`,
        ).bind(id, user.id).first<{ status: string }>();
        if (row) mine = { status: row.status as RegStatus };
      }
      const count = await env.AUTH_DB.prepare(
        `SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'registered'`,
      ).bind(id).first<{ n: number }>();
      const registered = count?.n ?? 0;
      return json({
        event: {
          id: event.id, title: event.title, description: event.description,
          starts_at: event.starts_at, ends_at: event.ends_at,
          reg_opens_at: event.reg_opens_at, reg_closes_at: event.reg_closes_at,
          capacity: event.capacity,
          spots_left: event.capacity === null ? null : Math.max(0, event.capacity - registered),
          registration_open: registrationOpen(event, now),
          mine, questions,
        },
      });
    }
    if (method === 'PATCH') {
      const user = await getSessionUser(env, request);
      if (!requireRole(user, 'admin')) {
        return user ? json({ error: 'forbidden' }, 403) : json({ error: 'unauthenticated' }, 401);
      }
      const body = await parseJson(request);
      if (!body.ok) return body.response;
      const v = body.value;
      const patch: string[] = [];
      const args: unknown[] = [];
      if (v.title !== undefined) {
        if (typeof v.title !== 'string' || !v.title.trim()) return json({ error: 'title_required' }, 400);
        patch.push('title = ?'); args.push(v.title.trim());
      }
      if (v.description !== undefined) {
        if (typeof v.description !== 'string') return json({ error: 'invalid_description' }, 400);
        patch.push('description = ?'); args.push(v.description);
      }
      for (const field of ['starts_at', 'ends_at', 'reg_opens_at', 'reg_closes_at']) {
        if (v[field] !== undefined) {
          if (!validDate(v[field])) return json({ error: 'invalid_dates' }, 400);
          patch.push(`${field} = ?`); args.push(v[field]);
        }
      }
      if (v.capacity !== undefined) {
        if (!validCapacity(v.capacity)) return json({ error: 'invalid_capacity' }, 400);
        patch.push('capacity = ?'); args.push(v.capacity ?? null);
      }
      if (v.force_closed !== undefined) {
        patch.push('force_closed = ?'); args.push(v.force_closed ? 1 : 0);
      }
      if (v.questions !== undefined) {
        const q = validateQuestions(v.questions);
        if (q === null) return json({ error: 'invalid_questions' }, 400);
        patch.push('questions = ?'); args.push(JSON.stringify(q));
      }
      if (patch.length === 0) return json({ error: 'nothing_to_update' }, 400);
      args.push(id);
      await env.AUTH_DB.prepare(`UPDATE events SET ${patch.join(', ')} WHERE id = ?`).bind(...args).run();
      return json({ ok: true });
    }
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, PATCH' });
  }

  if (sub === 'registrations') {
    if (method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
    const user = await getSessionUser(env, request);
    if (!requireRole(user, 'admin')) {
      return user ? json({ error: 'forbidden' }, 403) : json({ error: 'unauthenticated' }, 401);
    }
    const rows = (await env.AUTH_DB.prepare(
      `SELECT r.status, r.answers, r.created_at, u.email
       FROM registrations r JOIN users u ON u.id = r.user_id
       WHERE r.event_id = ? ORDER BY r.created_at DESC`,
    ).bind(id).all<{ status: string; answers: string; created_at: string; email: string }>()).results ?? [];
    return json({
      registrations: rows.map((r) => {
        let answers: Record<string, string> = {};
        try { answers = JSON.parse(r.answers); } catch { /* keep {} */ }
        return { email: r.email, status: r.status, answers, created_at: r.created_at };
      }),
    });
  }

  if (sub === 'my-registration') {
    if (method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
    const user = await getSessionUser(env, request);
    if (!user) return json({ error: 'unauthenticated' }, 401);
    const row = await env.AUTH_DB.prepare(
      `SELECT status, answers, created_at FROM registrations
       WHERE event_id = ? AND user_id = ? AND status != 'cancelled'`,
    ).bind(id, user.id).first<{ status: string; answers: string; created_at: string }>();
    if (!row) return json({ registration: null });
    let answers: Record<string, string> = {};
    try { answers = JSON.parse(row.answers); } catch { /* keep {} */ }
    return json({ registration: { status: row.status, answers, created_at: row.created_at } });
  }

  // sub === 'register'
  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'unauthenticated' }, 401);
  if (method === 'POST') {
    if (!registrationOpen(event, now)) return json({ error: 'event_closed' }, 403);
    const existing = await env.AUTH_DB.prepare(
      `SELECT id FROM registrations WHERE event_id = ? AND user_id = ? AND status != 'cancelled'`,
    ).bind(id, user.id).first<{ id: string }>();
    if (existing) return json({ error: 'already_registered' }, 409);
    const body = await parseJson(request);
    if (!body.ok) return body.response;
    const answers = validateAnswers(questions, (body.value as { answers?: unknown }).answers);
    if (answers === null) return json({ error: 'answers_invalid' }, 400);
    const count = await env.AUTH_DB.prepare(
      `SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'registered'`,
    ).bind(id).first<{ n: number }>();
    const full = event.capacity !== null && (count?.n ?? 0) >= event.capacity;
    const status: RegStatus = full ? 'waitlisted' : 'registered';
    // Capacity re-check + insert issued as one batch so they land atomically.
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(
        `INSERT INTO registrations (id, event_id, user_id, status, answers) VALUES (?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), id, user.id, status, JSON.stringify(answers)),
    ]);
    // Phase 5: enqueue a confirmation / waitlist email. Must never fail the
    // registration, so any enqueue error is swallowed after logging.
    try {
      if (status === 'registered') {
        const template = registrationConfirmation(event.title, status);
        await enqueueEmail(env, user.email, template.subject, template.text);
      } else {
        const position =
          (await env.AUTH_DB.prepare(
            `SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'waitlisted'`,
          )
            .bind(id)
            .first<{ n: number }>())?.n ?? 1;
        const template = registrationConfirmation(event.title, 'waitlisted', Math.max(1, position));
        await enqueueEmail(env, user.email, template.subject, template.text);
      }
    } catch (err) {
      console.error('[events] confirmation email enqueue failed', err);
    }
    return json({ status }, 201);
  }
  if (method === 'DELETE') {
    const own = await env.AUTH_DB.prepare(
      `SELECT id FROM registrations WHERE event_id = ? AND user_id = ? AND status != 'cancelled'`,
    ).bind(id, user.id).first<{ id: string }>();
    if (!own) return json({ error: 'not_registered' }, 404);
    const next = await env.AUTH_DB.prepare(
      `SELECT id FROM registrations WHERE event_id = ? AND status = 'waitlisted' ORDER BY created_at ASC LIMIT 1`,
    ).bind(id).first<{ id: string }>();
    const statements = [
      env.AUTH_DB.prepare(`UPDATE registrations SET status = 'cancelled' WHERE id = ?`).bind(own.id),
    ];
    if (next) {
      statements.push(env.AUTH_DB.prepare(`UPDATE registrations SET status = 'registered' WHERE id = ?`).bind(next.id));
    }
    await env.AUTH_DB.batch(statements);
    return json({ cancelled: true });
  }
  return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST, DELETE' });
}
