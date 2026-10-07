/// <reference types="@cloudflare/workers-types" />

// Projects + testimonials + site-settings API. Wired into the staging
// dispatcher by the orchestrator; this module owns /api/projects,
// /api/testimonials, and /api/site.
//
// Public reads need no auth. Every mutation is admin-only
// (unauthenticated -> 401, non-admin -> 403) and best-effort audit-logged
// into admin_audit_log, following the pattern in worker/admin.ts.
//
// Returns `null` when the request path is not ours so the dispatcher can
// fall through to the next handler.

import { getSessionUser, json, readJsonBody, requireRole, type Env, type User } from './auth-helpers';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const STATUSES = ['active', 'shipped', 'archived'] as const;

interface ProjectRow {
  id: string;
  title: string;
  summary: string;
  description: string;
  stack: string;
  url: string | null;
  cover_url: string | null;
  status: string;
  event_id: string | null;
  sort_order: number;
}

interface TestimonialRow {
  id: string;
  quote: string;
  name: string;
  role: string;
  sort_order: number;
}

function methodNotAllowed(allow: string): Response {
  return json({ error: 'method_not_allowed' }, 405, { Allow: allow });
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function audit(env: Env, admin: User, action: string, detail: string): Promise<void> {
  try {
    await env.AUTH_DB.prepare(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, detail) VALUES (?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), admin.id, action, detail)
      .run();
  } catch (err) {
    console.error('[projects] audit log write failed', err);
  }
}

/** Stored `stack` is a JSON string; the API always exposes a real string[]. */
function parseStack(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    return [];
  }
}

/** Array of <=12 strings, each <=40 chars. Null = invalid. */
function validateStack(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > 12) return null;
  for (const item of value) {
    if (typeof item !== 'string' || item.length > 40) return null;
  }
  return value as string[];
}

function asText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : null;
}

export async function handleProjectsApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  const projectsMatch = /^\/api\/projects(?:\/([^/]+))?$/.exec(path);
  const testimonialsMatch = /^\/api\/testimonials(?:\/([^/]+))?$/.exec(path);
  const isSite = path === '/api/site';
  if (!projectsMatch && !testimonialsMatch && !isSite) return null;
  // Extra segments (e.g. /api/projects/:id/extra) are not ours.
  if (projectsMatch && path.startsWith('/api/projects/') && projectsMatch[1] === undefined) return null;
  if (testimonialsMatch && path.startsWith('/api/testimonials/') && testimonialsMatch[1] === undefined) return null;

  // ------------------------------------------------------------------ projects
  if (projectsMatch && projectsMatch[1] === undefined) {
    if (method === 'GET') {
      const rows = (
        await env.AUTH_DB.prepare(
          `SELECT id, title, summary, description, stack, url, cover_url, status, event_id, sort_order
           FROM projects ORDER BY sort_order ASC, created_at ASC`,
        ).all<ProjectRow>()
      ).results ?? [];
      return json({
        projects: rows.map((r) => ({
          id: r.id,
          title: r.title,
          summary: r.summary,
          description: r.description,
          stack: parseStack(r.stack),
          url: r.url,
          cover_url: r.cover_url,
          status: r.status,
          event_id: r.event_id,
          sort_order: r.sort_order,
        })),
      });
    }
    if (method === 'POST') {
      const user = await getSessionUser(env, request);
      if (!user) return json({ error: 'unauthenticated' }, 401);
      if (!requireRole(user, 'admin')) return json({ error: 'forbidden' }, 403);
      const body = await readJsonBody(request);
      if (!body.ok) return body.response;
      const v = body.value;
      if (!nonEmpty(v.title)) return json({ error: 'title_required' }, 400);
      const stack = v.stack === undefined ? [] : validateStack(v.stack);
      if (stack === null) return json({ error: 'invalid_stack' }, 400);
      const status = v.status === undefined ? 'active' : v.status;
      if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) {
        return json({ error: 'invalid_status' }, 400);
      }
      const urlText = asText(v.url);
      const coverUrl = asText(v.cover_url);
      if (v.url !== undefined && v.url !== null && urlText === null) return json({ error: 'invalid_url' }, 400);
      if (v.cover_url !== undefined && v.cover_url !== null && coverUrl === null) {
        return json({ error: 'invalid_cover_url' }, 400);
      }
      let eventId: string | null = null;
      if (v.event_id !== undefined && v.event_id !== null && v.event_id !== '') {
        if (typeof v.event_id !== 'string') return json({ error: 'unknown_event' }, 400);
        const event = await env.AUTH_DB.prepare(`SELECT id FROM events WHERE id = ?`)
          .bind(v.event_id)
          .first<{ id: string }>();
        if (!event) return json({ error: 'unknown_event' }, 400);
        eventId = v.event_id;
      }
      const id = crypto.randomUUID();
      await env.AUTH_DB.prepare(
        `INSERT INTO projects (id, title, summary, description, stack, url, cover_url, status, event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          (v.title as string).trim(),
          asText(v.summary) ?? '',
          asText(v.description) ?? '',
          JSON.stringify(stack),
          urlText,
          coverUrl,
          status,
          eventId,
        )
        .run();
      await audit(env, user, 'project.create', JSON.stringify({ id }));
      return json({ id }, 201);
    }
    return methodNotAllowed('GET, POST');
  }

  if (projectsMatch && projectsMatch[1] !== undefined) {
    const id = decodeURIComponent(projectsMatch[1]);
    if (!ID_RE.test(id)) return json({ error: 'unknown_project' }, 404);
    if (method !== 'PATCH' && method !== 'DELETE') return methodNotAllowed('PATCH, DELETE');
    const user = await getSessionUser(env, request);
    if (!user) return json({ error: 'unauthenticated' }, 401);
    if (!requireRole(user, 'admin')) return json({ error: 'forbidden' }, 403);
    const existing = await env.AUTH_DB.prepare(`SELECT id FROM projects WHERE id = ?`)
      .bind(id)
      .first<{ id: string }>();
    if (!existing) return json({ error: 'unknown_project' }, 404);
    if (method === 'DELETE') {
      await env.AUTH_DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
      await audit(env, user, 'project.delete', JSON.stringify({ id }));
      return json({ deleted: true });
    }
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const v = body.value;
    const patch: string[] = [];
    const args: unknown[] = [];
    if (v.title !== undefined) {
      if (!nonEmpty(v.title)) return json({ error: 'title_required' }, 400);
      patch.push('title = ?');
      args.push((v.title as string).trim());
    }
    for (const field of ['summary', 'description'] as const) {
      if (v[field] !== undefined) {
        if (typeof v[field] !== 'string') return json({ error: `invalid_${field}` }, 400);
        patch.push(`${field} = ?`);
        args.push(v[field]);
      }
    }
    if (v.stack !== undefined) {
      const stack = validateStack(v.stack);
      if (stack === null) return json({ error: 'invalid_stack' }, 400);
      patch.push('stack = ?');
      args.push(JSON.stringify(stack));
    }
    if (v.status !== undefined) {
      if (typeof v.status !== 'string' || !(STATUSES as readonly string[]).includes(v.status)) {
        return json({ error: 'invalid_status' }, 400);
      }
      patch.push('status = ?');
      args.push(v.status);
    }
    for (const field of ['url', 'cover_url'] as const) {
      if (v[field] !== undefined) {
        if (v[field] !== null && typeof v[field] !== 'string') {
          return json({ error: `invalid_${field}` }, 400);
        }
        patch.push(`${field} = ?`);
        args.push(v[field]);
      }
    }
    if (v.event_id !== undefined) {
      if (v.event_id === null || v.event_id === '') {
        patch.push('event_id = ?');
        args.push(null);
      } else {
        if (typeof v.event_id !== 'string') return json({ error: 'unknown_event' }, 400);
        const event = await env.AUTH_DB.prepare(`SELECT id FROM events WHERE id = ?`)
          .bind(v.event_id)
          .first<{ id: string }>();
        if (!event) return json({ error: 'unknown_event' }, 400);
        patch.push('event_id = ?');
        args.push(v.event_id);
      }
    }
    if (v.sort_order !== undefined) {
      if (typeof v.sort_order !== 'number' || !Number.isInteger(v.sort_order)) {
        return json({ error: 'invalid_sort_order' }, 400);
      }
      patch.push('sort_order = ?');
      args.push(v.sort_order);
    }
    if (patch.length === 0) return json({ error: 'nothing_to_update' }, 400);
    args.push(id);
    await env.AUTH_DB.prepare(`UPDATE projects SET ${patch.join(', ')} WHERE id = ?`).bind(...args).run();
    await audit(env, user, 'project.update', JSON.stringify({ id }));
    return json({ ok: true });
  }

  // --------------------------------------------------------------- testimonials
  if (testimonialsMatch && testimonialsMatch[1] === undefined) {
    if (method === 'GET') {
      const rows = (
        await env.AUTH_DB.prepare(
          `SELECT id, quote, name, role, sort_order FROM testimonials
           WHERE active = 1 ORDER BY sort_order ASC, created_at ASC`,
        ).all<TestimonialRow>()
      ).results ?? [];
      return json({ testimonials: rows });
    }
    if (method === 'POST') {
      const user = await getSessionUser(env, request);
      if (!user) return json({ error: 'unauthenticated' }, 401);
      if (!requireRole(user, 'admin')) return json({ error: 'forbidden' }, 403);
      const body = await readJsonBody(request);
      if (!body.ok) return body.response;
      const v = body.value;
      if (!nonEmpty(v.quote)) return json({ error: 'quote_required' }, 400);
      if (!nonEmpty(v.name)) return json({ error: 'name_required' }, 400);
      if (v.role !== undefined && typeof v.role !== 'string') return json({ error: 'invalid_role' }, 400);
      const id = crypto.randomUUID();
      await env.AUTH_DB.prepare(`INSERT INTO testimonials (id, quote, name, role) VALUES (?, ?, ?, ?)`)
        .bind(id, (v.quote as string).trim(), (v.name as string).trim(), (v.role as string | undefined) ?? '')
        .run();
      await audit(env, user, 'testimonial.create', JSON.stringify({ id }));
      return json({ id }, 201);
    }
    return methodNotAllowed('GET, POST');
  }

  if (testimonialsMatch && testimonialsMatch[1] !== undefined) {
    const id = decodeURIComponent(testimonialsMatch[1]);
    if (!ID_RE.test(id)) return json({ error: 'unknown_testimonial' }, 404);
    if (method !== 'PATCH' && method !== 'DELETE') return methodNotAllowed('PATCH, DELETE');
    const user = await getSessionUser(env, request);
    if (!user) return json({ error: 'unauthenticated' }, 401);
    if (!requireRole(user, 'admin')) return json({ error: 'forbidden' }, 403);
    const existing = await env.AUTH_DB.prepare(`SELECT id FROM testimonials WHERE id = ?`)
      .bind(id)
      .first<{ id: string }>();
    if (!existing) return json({ error: 'unknown_testimonial' }, 404);
    if (method === 'DELETE') {
      await env.AUTH_DB.prepare(`DELETE FROM testimonials WHERE id = ?`).bind(id).run();
      await audit(env, user, 'testimonial.delete', JSON.stringify({ id }));
      return json({ deleted: true });
    }
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const v = body.value;
    const patch: string[] = [];
    const args: unknown[] = [];
    for (const field of ['quote', 'name', 'role'] as const) {
      if (v[field] !== undefined) {
        if (field !== 'role' && !nonEmpty(v[field])) {
          return json({ error: field === 'quote' ? 'quote_required' : 'name_required' }, 400);
        }
        if (field === 'role' && typeof v[field] !== 'string') return json({ error: 'invalid_role' }, 400);
        patch.push(`${field} = ?`);
        args.push(field === 'role' ? v[field] : (v[field] as string).trim());
      }
    }
    if (v.sort_order !== undefined) {
      if (typeof v.sort_order !== 'number' || !Number.isInteger(v.sort_order)) {
        return json({ error: 'invalid_sort_order' }, 400);
      }
      patch.push('sort_order = ?');
      args.push(v.sort_order);
    }
    if (v.active !== undefined) {
      if (typeof v.active !== 'boolean') return json({ error: 'invalid_active' }, 400);
      patch.push('active = ?');
      args.push(v.active ? 1 : 0);
    }
    if (patch.length === 0) return json({ error: 'nothing_to_update' }, 400);
    args.push(id);
    await env.AUTH_DB.prepare(`UPDATE testimonials SET ${patch.join(', ')} WHERE id = ?`).bind(...args).run();
    await audit(env, user, 'testimonial.update', JSON.stringify({ id }));
    return json({ ok: true });
  }

  // --------------------------------------------------------------------- site
  if (method === 'GET') {
    const rows = (
      await env.AUTH_DB.prepare(`SELECT key, value FROM site_settings`).all<{ key: string; value: string }>()
    ).results ?? [];
    const settings = new Map(rows.map((r) => [r.key, r.value]));
    const active = settings.get('announcement_active') === '1';
    const text = settings.get('announcement_text') ?? '';
    const href = settings.get('announcement_href') ?? '';
    return json({
      announcement: active && text !== '' ? { text, href } : null,
      recruitment_open: settings.get('recruitment_open') === '1',
    });
  }
  if (method === 'PUT') {
    const user = await getSessionUser(env, request);
    if (!user) return json({ error: 'unauthenticated' }, 401);
    if (!requireRole(user, 'admin')) return json({ error: 'forbidden' }, 403);
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const v = body.value;
    const updates = new Map<string, string>();
    if (v.announcement_active !== undefined) {
      if (typeof v.announcement_active !== 'boolean') return json({ error: 'invalid_active' }, 400);
      updates.set('announcement_active', v.announcement_active ? '1' : '0');
    }
    if (v.announcement_text !== undefined) {
      if (typeof v.announcement_text !== 'string') return json({ error: 'invalid_text' }, 400);
      if (v.announcement_text.length > 160) return json({ error: 'text_too_long' }, 400);
      updates.set('announcement_text', v.announcement_text);
    }
    if (v.announcement_href !== undefined) {
      if (typeof v.announcement_href !== 'string') return json({ error: 'invalid_href' }, 400);
      if (v.announcement_href !== '' && !v.announcement_href.startsWith('/')) {
        return json({ error: 'invalid_href' }, 400);
      }
      updates.set('announcement_href', v.announcement_href);
    }
    if (v.recruitment_open !== undefined) {
      if (typeof v.recruitment_open !== 'boolean') return json({ error: 'invalid_active' }, 400);
      updates.set('recruitment_open', v.recruitment_open ? '1' : '0');
    }
    if (updates.size === 0) return json({ error: 'nothing_to_update' }, 400);
    await env.AUTH_DB.batch(
      [...updates].map(([key, value]) =>
        env.AUTH_DB.prepare(
          `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        ).bind(key, value),
      ),
    );
    await audit(env, user, 'site.update', JSON.stringify({ keys: [...updates.keys()] }));
    return json({ ok: true });
  }
  return methodNotAllowed('GET, PUT');
}
