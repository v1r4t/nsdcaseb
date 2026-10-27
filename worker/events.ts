/// <reference types="@cloudflare/workers-types" />

// Phase 3: events + registrations API. Wired into the staging dispatcher by
// the orchestrator; this module owns every path under /api/events.

import { getSessionUser, json, requireMinRole, rateLimit, clientIp } from './auth-helpers';
import {
  uploadPoster,
  posterUrl,
  posterKeys,
  posterVariantUrls,
  storageConfigured,
} from './supabase-storage';
import type { Env } from './auth-helpers';
import { enqueueEmail, waitlistNotice, waitlistPromotionEmail } from './email';

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
  poster_key: string | null;
  // Added by 0016_event_archive. Rows read from a DB that has not applied
  // the migration simply lack the property (SELECT *), which we treat as
  // "not archived" — so old dev DBs keep working.
  archived_at?: string | null;
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
  if (row.archived_at) return false;
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

interface PosterFile {
  data: ArrayBuffer;
  type: string;
}

async function readPosterFile(form: FormData, field: string): Promise<PosterFile | null> {
  const file = form.get(field);
  if (!(file instanceof File)) return null;
  return { data: await file.arrayBuffer(), type: (file.type || 'image/webp').toLowerCase() };
}

/** Variants travel as a pair; one without the other is a client bug. */
function validPosterVariants(thumb: PosterFile | null, full: PosterFile | null): boolean {
  if (!!thumb !== !!full) return false;
  for (const file of [thumb, full]) {
    if (file && file.type !== 'image/webp') return false;
  }
  return true;
}

/**
 * Write the original plus whichever variants were supplied. All keys are
 * deterministic, so a retry simply upserts the same objects.
 */
async function storePosterSet(
  env: Env,
  eventId: string,
  poster: PosterFile,
  thumb: PosterFile | null,
  full: PosterFile | null,
): Promise<boolean> {
  const keys = posterKeys(eventId);
  const files: Array<[string, PosterFile]> = [[keys.original, poster]];
  if (thumb) files.push([keys.thumb, thumb]);
  if (full) files.push([keys.full, full]);
  const results = await Promise.all(
    files.map(([key, file]) => uploadPoster(env, key, file.data, file.type)),
  );
  return results.every(Boolean);
}

async function registeredCounts(env: Env): Promise<Map<string, number>> {
  const rows = await env.AUTH_DB
    .prepare(`SELECT event_id, COUNT(*) AS n FROM registrations WHERE status = 'registered' GROUP BY event_id`)
    .all<{ event_id: string; n: number }>();
  return new Map((rows.results ?? []).map((r) => [r.event_id, r.n]));
}

/**
 * Move the oldest waitlisted registration for an event to `registered` and
 * return it (with the member's email when they have an account). Callers own
 * the notification; a guest row simply has no email and is not mailed.
 */
export async function promoteNextWaitlisted(
  env: Env,
  eventId: string,
): Promise<{ id: string; email: string | null } | null> {
  const next = await env.AUTH_DB.prepare(
    `SELECT r.id AS id, u.email AS email
     FROM registrations r LEFT JOIN users u ON u.id = r.user_id
     WHERE r.event_id = ? AND r.status = 'waitlisted'
     ORDER BY r.created_at ASC LIMIT 1`,
  )
    .bind(eventId)
    .first<{ id: string; email: string | null }>();
  if (!next) return null;
  await env.AUTH_DB.prepare(`UPDATE registrations SET status = 'registered' WHERE id = ?`)
    .bind(next.id)
    .run();
  return next;
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
      // Soft-archive filter: public callers never see archived events.
      // `?include_archived=1` opts in (used by the admin console); the
      // filter is applied in JS rather than SQL so a DB that has not yet
      // applied 0016 (no archived_at column) keeps working — such rows
      // simply have `archived_at` undefined and are treated as live.
      const includeArchived = url.searchParams.get('include_archived') === '1';
      let mine = new Map<string, RegStatus>();
      if (user) {
        const rows = (await env.AUTH_DB.prepare(
          `SELECT event_id, status FROM registrations WHERE user_id = ? AND status != 'cancelled'`,
        ).bind(user.id).all<{ event_id: string; status: string }>()).results ?? [];
        mine = new Map(rows.map((r) => [r.event_id, r.status as RegStatus]));
      }
      return json({
        events: events.filter((e) => includeArchived || !e.archived_at).map((e) => {
          const registered = counts.get(e.id) ?? 0;
          const status = user ? mine.get(e.id) ?? null : null;
          return {
            id: e.id, title: e.title, description: e.description,
            starts_at: e.starts_at, ends_at: e.ends_at,
            reg_opens_at: e.reg_opens_at, reg_closes_at: e.reg_closes_at,
            capacity: e.capacity,
            spots_left: e.capacity === null ? null : Math.max(0, e.capacity - registered),
            registration_open: registrationOpen(e, now),
            archived: !!e.archived_at,
            archived_at: e.archived_at ?? null,
            poster_url: posterUrl(env, e.poster_key),
            poster_variants: posterVariantUrls(env, e.id, e.poster_key),
            mine: status ? { status } : null,
          };
        }),
      });
    }
    if (method === 'POST') {
      const user = await getSessionUser(env, request);
      if (!requireMinRole(user, 'ob')) {
        return user ? json({ error: 'forbidden' }, 403) : json({ error: 'unauthenticated' }, 401);
      }

      const contentType = request.headers.get('content-type') ?? '';
      let v: Record<string, unknown>;
      let posterFile: PosterFile | null = null;
      let posterThumb: PosterFile | null = null;
      let posterFull: PosterFile | null = null;
      if (contentType.includes('multipart/form-data')) {
        const form = await request.formData();
        const raw = form.get('data');
        if (typeof raw !== 'string') return json({ error: 'invalid_json' }, 400);
        try { v = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
        posterFile = await readPosterFile(form, 'poster');
        posterThumb = await readPosterFile(form, 'poster_thumb');
        posterFull = await readPosterFile(form, 'poster_full');
        if (!validPosterVariants(posterThumb, posterFull)) {
          return json({ error: 'invalid_poster_variants' }, 400);
        }
      } else {
        const parsed = await parseJson(request);
        if (!parsed.ok) return parsed.response;
        v = parsed.value;
      }

      if (typeof v.title !== 'string' || !v.title.trim()) return json({ error: 'title_required' }, 400);
      if (!validDate(v.starts_at) || !validDate(v.ends_at) || !validDate(v.reg_opens_at) || !validDate(v.reg_closes_at)) {
        return json({ error: 'invalid_dates' }, 400);
      }
      if (!validCapacity(v.capacity)) return json({ error: 'invalid_capacity' }, 400);
      const questions = v.questions === undefined ? [] : validateQuestions(v.questions);
      if (questions === null) return json({ error: 'invalid_questions' }, 400);

      const id = typeof v.id === 'string' && ID_RE.test(v.id) ? v.id : crypto.randomUUID();
      let posterKey: string | null = null;
      if (posterFile) {
        if (!storageConfigured(env)) {
          // Local dev fallback: no Supabase storage configured, so the event
          // is created without a stored poster rather than failing the request.
          posterKey = null;
        } else {
          posterKey = posterKeys(id).original;
          const ok = await storePosterSet(env, id, posterFile, posterThumb, posterFull);
          if (!ok) return json({ error: 'poster_upload_failed' }, 502);
        }
      } else if (storageConfigured(env)) {
        return json({ error: 'poster_required' }, 400);
      }

      await env.AUTH_DB.prepare(
        `INSERT INTO events (id, title, description, starts_at, ends_at, reg_opens_at, reg_closes_at, capacity, force_closed, questions, poster_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, v.title.trim(), typeof v.description === 'string' ? v.description : '',
        v.starts_at, v.ends_at, v.reg_opens_at, v.reg_closes_at,
        v.capacity ?? null, v.force_closed ? 1 : 0, JSON.stringify(questions), posterKey).run();
      return json({
        id,
        poster_url: posterUrl(env, posterKey),
        poster_variants: posterVariantUrls(env, id, posterKey),
      }, 201);
    }
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
  }

  // /api/events/:id and sub-routes
  const rest = path.slice('/api/events/'.length);
  const [id, sub] = rest.split('/');
  if (!id || !ID_RE.test(id) || (sub !== undefined && !['register', 'my-registration', 'registrations', 'poster'].includes(sub))) {
    if (sub !== undefined && sub !== 'register' && sub !== 'my-registration' && sub !== 'registrations') {
      return null; // not ours — let another handler try
    }
    return json({ error: 'event_not_found' }, 404);
  }
  if (sub !== undefined && rest.split('/').length > 2) return null;

  const event = await env.AUTH_DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first<EventRow>();
  if (!event) return json({ error: 'event_not_found' }, 404);
  const questions = parseQuestions(event.questions);

  if (sub === 'poster') {
    if (method === 'GET') {
      const url = posterUrl(env, event.poster_key);
      if (!url) return json({ error: 'poster_not_found' }, 404);
      return new Response(null, { status: 302, headers: { Location: url, 'cache-control': 'public, max-age=300' } });
    }
    if (method === 'POST') {
      const user = await getSessionUser(env, request);
      if (!requireMinRole(user, 'ob')) return user ? json({ error: 'forbidden' }, 403) : json({ error: 'unauthenticated' }, 401);
      const contentType = request.headers.get('content-type') ?? '';
      let posterFile: PosterFile | null = null;
      let posterThumb: PosterFile | null = null;
      let posterFull: PosterFile | null = null;
      if (contentType.includes('multipart/form-data')) {
        const form = await request.formData();
        posterFile = await readPosterFile(form, 'poster');
        posterThumb = await readPosterFile(form, 'poster_thumb');
        posterFull = await readPosterFile(form, 'poster_full');
      }
      if (!posterFile) return json({ error: 'poster_required' }, 400);
      if (!validPosterVariants(posterThumb, posterFull)) {
        return json({ error: 'invalid_poster_variants' }, 400);
      }
      if (!storageConfigured(env)) return json({ error: 'storage_not_configured' }, 503);
      const key = posterKeys(id).original;
      const ok = await storePosterSet(env, id, posterFile, posterThumb, posterFull);
      if (!ok) return json({ error: 'poster_upload_failed' }, 502);
      await env.AUTH_DB.prepare(`UPDATE events SET poster_key = ? WHERE id = ?`).bind(key, id).run();
      return json({
        poster_url: posterUrl(env, key),
        poster_variants: posterVariantUrls(env, id, key),
      }, 201);
    }
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
  }

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
          // Single-event GET deliberately includes archived events (unlike
          // the list) and flags them, so the admin edit panel can load an
          // archived event for review or unarchiving.
          archived: !!event.archived_at,
          archived_at: event.archived_at ?? null,
          poster_url: posterUrl(env, event.poster_key),
          poster_variants: posterVariantUrls(env, event.id, event.poster_key),
          mine, questions,
        },
      });
    }
    if (method === 'PATCH') {
      const user = await getSessionUser(env, request);
      if (!requireMinRole(user, 'ob')) {
        return user ? json({ error: 'forbidden' }, 403) : json({ error: 'unauthenticated' }, 401);
      }
      const contentType = request.headers.get('content-type') ?? '';
      let v: Record<string, unknown>;
      let posterFile: PosterFile | null = null;
      let posterThumb: PosterFile | null = null;
      let posterFull: PosterFile | null = null;
      if (contentType.includes('multipart/form-data')) {
        const form = await request.formData();
        const raw = form.get('data');
        if (typeof raw === 'string') {
          try { v = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
        } else {
          v = {};
        }
        posterFile = await readPosterFile(form, 'poster');
        posterThumb = await readPosterFile(form, 'poster_thumb');
        posterFull = await readPosterFile(form, 'poster_full');
        if (!validPosterVariants(posterThumb, posterFull)) {
          return json({ error: 'invalid_poster_variants' }, 400);
        }
      } else {
        const parsed = await parseJson(request);
        if (!parsed.ok) return parsed.response;
        v = parsed.value;
      }

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
      if (v.archived !== undefined) {
        if (typeof v.archived !== 'boolean') return json({ error: 'invalid_archived' }, 400);
        // Soft archive: timestamp the archival so rosters/history survive;
        // unarchive clears it. Uses SQL datetime so the worker clock wins.
        if (v.archived) patch.push(`archived_at = datetime('now')`);
        else patch.push(`archived_at = NULL`);
      }
      if (v.questions !== undefined) {
        const q = validateQuestions(v.questions);
        if (q === null) return json({ error: 'invalid_questions' }, 400);
        patch.push('questions = ?'); args.push(JSON.stringify(q));
      }
      let posterKey = event.poster_key;
      if (posterFile) {
        if (!storageConfigured(env)) {
          // Storage is not configured; ignore upload in local dev.
        } else {
          posterKey = posterKeys(id).original;
          const ok = await storePosterSet(env, id, posterFile, posterThumb, posterFull);
          if (!ok) return json({ error: 'poster_upload_failed' }, 502);
          patch.push('poster_key = ?'); args.push(posterKey);
        }
      }
      if (patch.length === 0) return json({ error: 'nothing_to_update' }, 400);
      args.push(id);
      await env.AUTH_DB.prepare(`UPDATE events SET ${patch.join(', ')} WHERE id = ?`).bind(...args).run();
      return json({
        ok: true,
        poster_url: posterUrl(env, posterKey),
        poster_variants: posterVariantUrls(env, id, posterKey),
      });
    }
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, PATCH' });
  }

  if (sub === 'registrations') {
    if (method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
    const user = await getSessionUser(env, request);
    if (!requireMinRole(user, 'ob')) {
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
  const isGuest = !user;
  if (method === 'POST') {
    const ip = clientIp(request);
    if (
      !(await rateLimit(env, `event-register:${id}:ip:${ip}`, 10, 15 * 60))
    ) {
      return json({ error: 'rate_limited' }, 429);
    }
    if (!registrationOpen(event, now)) return json({ error: 'event_closed' }, 403);
    const body = await parseJson(request);
    if (!body.ok) return body.response;

    let studentName = '';
    let regNumber = '';
    if (user) {
      const dbUser = await env.AUTH_DB.prepare(`SELECT name, reg_number FROM users WHERE id = ?`).bind(user.id).first<{ name: string | null; reg_number: string | null }>();
      studentName = (dbUser?.name ?? user.name ?? '').trim();
      regNumber = (dbUser?.reg_number ?? user.reg_number ?? '').trim();
      if (body.value.name && typeof body.value.name === 'string') studentName = body.value.name.trim();
      if (body.value.reg_number && typeof body.value.reg_number === 'string') regNumber = body.value.reg_number.trim();
      if (!studentName) studentName = user.email;
      if (!regNumber) return json({ error: 'reg_number_required' }, 400);
    } else {
      studentName = typeof body.value.name === 'string' ? body.value.name.trim() : '';
      regNumber = typeof body.value.reg_number === 'string' ? body.value.reg_number.trim() : '';
      if (!studentName) return json({ error: 'name_required' }, 400);
      if (!regNumber) return json({ error: 'reg_number_required' }, 400);
    }

    const answers = validateAnswers(questions, (body.value as { answers?: unknown }).answers);
    if (answers === null) return json({ error: 'answers_invalid' }, 400);

    const duplicateParams = user ? [id, user.id] : [id, regNumber];
    const duplicateSql = user
      ? `SELECT id FROM registrations WHERE event_id = ? AND user_id = ? AND status != 'cancelled'`
      : `SELECT id FROM registrations WHERE event_id = ? AND reg_number = ? AND user_type = 'guest' AND status != 'cancelled'`;
    const existing = await env.AUTH_DB.prepare(duplicateSql).bind(...duplicateParams).first<{ id: string }>();
    if (existing) return json({ error: 'already_registered' }, 409);

    // Determine status inside the INSERT so capacity checks stay
    // consistent with the transactional batch boundary.
    const registrationId = crypto.randomUUID();
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(
        `INSERT INTO registrations (id, event_id, user_id, status, answers, student_name, reg_number, user_type)
         VALUES (?, ?, ?, CASE WHEN ? IS NULL OR (SELECT COUNT(*) FROM registrations WHERE event_id = ? AND status = 'registered') < ? THEN 'registered' ELSE 'waitlisted' END, ?, ?, ?, ?)`,
      ).bind(
        registrationId,
        id,
        user?.id ?? null,
        event.capacity,
        id,
        event.capacity ?? 0,
        JSON.stringify(answers),
        studentName,
        regNumber,
        user ? 'member' : 'guest',
      ),
    ]);
    const insertedStatus = (await env.AUTH_DB.prepare(`SELECT status FROM registrations WHERE id = ?`).bind(registrationId).first<{ status: string }>())?.status;
    const status: RegStatus = insertedStatus === 'waitlisted' ? 'waitlisted' : 'registered';

    if (status === 'waitlisted' && user?.email) {
      try {
        const position =
          (await env.AUTH_DB.prepare(
            `SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND status = 'waitlisted'`,
          )
            .bind(id)
            .first<{ n: number }>())?.n ?? 1;
        const template = waitlistNotice(event.title, Math.max(1, position));
        await enqueueEmail(env, user.email, template.subject, template.text, { kind: 'waitlist' });
      } catch (err) {
        console.error('[events] waitlist email enqueue failed', err);
      }
    }
    // Confirmed registrations are deliberately silent: the confirmation
    // screen and the on-site roster already say everything.
    return json({ status, account_prompt: !user }, 201);
  }
  if (method === 'DELETE') {
    if (!user) return json({ error: 'unauthenticated' }, 401);
    const own = await env.AUTH_DB.prepare(
      `SELECT id FROM registrations WHERE event_id = ? AND user_id = ? AND status != 'cancelled'`,
    ).bind(id, user.id).first<{ id: string }>();
    if (!own) return json({ error: 'not_registered' }, 404);
    await env.AUTH_DB.prepare(`UPDATE registrations SET status = 'cancelled' WHERE id = ?`)
      .bind(own.id)
      .run();
    // Free seat goes to the oldest waiter. The canceller gets no mail; the
    // promoted member does (when we have their address).
    const promoted = await promoteNextWaitlisted(env, id);
    if (promoted?.email) {
      try {
        const template = waitlistPromotionEmail(event.title);
        await enqueueEmail(env, promoted.email, template.subject, template.text, { kind: 'waitlist' });
      } catch (err) {
        console.error('[events] promotion email enqueue failed', promoted.id, err);
      }
    }
    return json({ cancelled: true });
  }
  return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST, DELETE' });
}
