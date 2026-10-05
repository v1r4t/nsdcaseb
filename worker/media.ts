/// <reference types="@cloudflare/workers-types" />

// Phase 4: media gallery API (albums + items). URL-based only — no object
// storage binding yet; media_items.source keeps room for R2 later. This module
// owns every /api/media path. GET is public; mutations are admin-only
// (401 unauth, 403 non-admin, 404 unknown id, 405 + Allow on a wrong method).

import { getSessionUser, json, requireRole } from './auth-helpers';
import type { Env, User } from './auth-helpers';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// auth-helpers' readJsonBody caps bodies at 2KB (tuned for auth); captions here can exceed that.
const MAX_MEDIA_BODY_BYTES = 32 * 1024;
const MAX_TITLE = 160;
const MAX_TEXT = 2000;
const MAX_URL = 2048;
const MAX_ID_REF = 64;

// Videos render in an iframe, so the host allow-list is narrow. Image URLs are
// any https URL — aiming an album at something broken is the admin's call.
const VIDEO_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'youtube-nocookie.com']);

/** [column, max length, error code, value used when the field is absent or null]. */
type FieldSpec = readonly [string, number, string, string | null];
const ALBUM_TEXT: readonly FieldSpec[] = [
  ['description', MAX_TEXT, 'invalid_description', ''],
  ['cover_url', MAX_URL, 'invalid_cover_url', null],
  ['event_id', MAX_ID_REF, 'invalid_event_id', null],
];
const ITEM_TEXT: readonly FieldSpec[] = [
  ['title', MAX_TITLE, 'invalid_title', ''],
  ['caption', MAX_TEXT, 'invalid_caption', ''],
];
type AlbumRow = { id: string; title: string; description: string; cover_url: string | null; event_id: string | null; sort_order: number };
type ItemRow = { id: string; album_id: string; type: string; url: string; title: string; caption: string; sort_order: number };
/** Wire shape of one item inside GET /api/media. */
type ItemOut = { id: string; type: 'image' | 'video'; url: string; title: string; caption: string; sort_order: number };
type ParseResult = { ok: true; value: Record<string, unknown> } | { ok: false; response: Response };
type ReadResult = { ok: true; values: Record<string, string | null> } | { ok: false; code: string };

async function parseJson(request: Request): Promise<ParseResult> {
  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  if (buffer.byteLength > MAX_MEDIA_BODY_BYTES) {
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

async function requireAdmin(env: Env, request: Request): Promise<{ user: User } | { response: Response }> {
  const user = await getSessionUser(env, request);
  if (!user) return { response: json({ error: 'unauthenticated' }, 401) };
  if (!requireRole(user, 'admin')) return { response: json({ error: 'forbidden' }, 403) };
  return { user };
}

/** Best effort: an audit-log outage must never fail the mutation. */
async function audit(env: Env, admin: User, action: string, detail: string): Promise<void> {
  try {
    await env.AUTH_DB.prepare(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, detail) VALUES (?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), admin.id, action, detail).run();
  } catch (err) {
    console.error('[media] audit log write failed', err);
  }
}

function methodNotAllowed(allow: string): Response {
  return json({ error: 'method_not_allowed' }, 405, { Allow: allow });
}

/** `undefined` in = field absent, `null` in = clear the column. */
function optString(value: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string' || value.length > max) return { ok: false };
  return { ok: true, value };
}

function optSort(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isInteger(value) || Math.abs(value) > 1_000_000) return { ok: false };
  return { ok: true, value };
}

/** Validate every optional text column at once, filling in the defaults. */
function readFields(v: Record<string, unknown>, fields: readonly FieldSpec[]): ReadResult {
  const values: Record<string, string | null> = {};
  for (const [field, max, code, empty] of fields) {
    const parsed = optString(v[field], max);
    if (!parsed.ok) return { ok: false, code };
    values[field] = parsed.value ?? empty;
  }
  return { ok: true, values };
}

/** Append `column = ?` for every field the body carries, sort_order included. */
function patchFields(patch: string[], args: unknown[], v: Record<string, unknown>, fields: readonly FieldSpec[]): string | null {
  for (const [field, max, code, empty] of fields) {
    if (v[field] === undefined) continue;
    const parsed = optString(v[field], max);
    if (!parsed.ok) return code;
    patch.push(`${field} = ?`);
    args.push(parsed.value ?? empty);
  }
  if (v.sort_order === undefined) return null;
  const sort = optSort(v.sort_order);
  if (!sort.ok) return 'invalid_sort_order';
  patch.push('sort_order = ?');
  args.push(sort.value);
  return null;
}

/** https only; videos are additionally restricted to the YouTube hosts. */
function validUrl(value: unknown, type: string): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL) return null;
  let parsed: URL | null = null;
  try { parsed = new URL(trimmed); } catch { /* not a URL */ }
  if (!parsed || parsed.protocol !== 'https:') return null;
  if (type === 'video' && !VIDEO_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  return trimmed;
}

async function albumExists(env: Env, id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || !ID_RE.test(id)) return false;
  const row = await env.AUTH_DB.prepare(`SELECT id FROM albums WHERE id = ?`).bind(id).first<{ id: string }>();
  return row !== null;
}

/** Apply a patch, audit it, answer 200. The table name always comes from a literal. */
async function runPatch(
  env: Env, admin: User, table: 'albums' | 'media_items', id: string,
  patch: string[], args: unknown[], action: string, detail: Record<string, unknown>,
): Promise<Response> {
  if (patch.length === 0) return json({ error: 'nothing_to_update' }, 400);
  await env.AUTH_DB.prepare(`UPDATE ${table} SET ${patch.join(', ')} WHERE id = ?`).bind(...args, id).run();
  await audit(env, admin, action, JSON.stringify({ id, ...detail }));
  return json({ ok: true });
}

async function listAll(env: Env): Promise<Response> {
  const albums = (await env.AUTH_DB.prepare(
    `SELECT id, title, description, cover_url, event_id, sort_order FROM albums ORDER BY sort_order ASC, created_at ASC`,
  ).all<AlbumRow>()).results ?? [];
  const items = (await env.AUTH_DB.prepare(
    `SELECT id, album_id, type, url, title, caption, sort_order FROM media_items ORDER BY album_id ASC, sort_order ASC, created_at ASC`,
  ).all<ItemRow>()).results ?? [];
  const byAlbum = new Map<string, ItemOut[]>();
  for (const row of items) {
    const bucket = byAlbum.get(row.album_id) ?? [];
    bucket.push({ id: row.id, type: row.type === 'video' ? 'video' : 'image', url: row.url, title: row.title, caption: row.caption, sort_order: row.sort_order });
    byAlbum.set(row.album_id, bucket);
  }
  return json({
    albums: albums.map((a) => ({ id: a.id, title: a.title, description: a.description,
      cover_url: a.cover_url, event_id: a.event_id, sort_order: a.sort_order, items: byAlbum.get(a.id) ?? [] })),
  });
}

async function createAlbum(env: Env, admin: User, v: Record<string, unknown>): Promise<Response> {
  const title = typeof v.title === 'string' ? v.title.trim() : '';
  if (!title || title.length > MAX_TITLE) return json({ error: 'title_required' }, 400);
  const read = readFields(v, ALBUM_TEXT);
  if (!read.ok) return json({ error: read.code }, 400);
  const sort = optSort(v.sort_order);
  if (!sort.ok) return json({ error: 'invalid_sort_order' }, 400);
  const id = crypto.randomUUID();
  const c = read.values;
  await env.AUTH_DB.prepare(`INSERT INTO albums (id, title, description, cover_url, event_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, title, c.description ?? '', c.cover_url ?? null, c.event_id ?? null, sort.value ?? 0).run();  await audit(env, admin, 'media.album.create', JSON.stringify({ id, title }));
  return json({ id }, 201);
}

async function createItem(env: Env, admin: User, v: Record<string, unknown>): Promise<Response> {
  if (!(await albumExists(env, v.album_id))) return json({ error: 'unknown_album' }, 400);
  const type = v.type === 'video' ? 'video' : v.type === 'image' ? 'image' : null;
  if (!type) return json({ error: 'invalid_type' }, 400);
  const url = validUrl(v.url, type);
  if (url === null) return json({ error: 'invalid_url' }, 400);
  const read = readFields(v, ITEM_TEXT);
  if (!read.ok) return json({ error: read.code }, 400);
  const sort = optSort(v.sort_order);
  if (!sort.ok) return json({ error: 'invalid_sort_order' }, 400);
  const id = crypto.randomUUID();
  const c = read.values;
  await env.AUTH_DB.prepare(`INSERT INTO media_items (id, album_id, type, source, url, title, caption, sort_order) VALUES (?, ?, ?, 'url', ?, ?, ?, ?)`)
    .bind(id, v.album_id as string, type, url, c.title ?? '', c.caption ?? '', sort.value ?? 0).run();
  await audit(env, admin, 'media.item.create', JSON.stringify({ id, album_id: v.album_id, type }));
  return json({ id }, 201);
}

async function albumById(env: Env, admin: User, request: Request, id: string, method: string): Promise<Response> {
  const row = await env.AUTH_DB.prepare(`SELECT id FROM albums WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!row) return json({ error: 'unknown_album' }, 404);
  if (method === 'DELETE') {
    // Children go explicitly rather than via the FK cascade: correct either way.
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(`DELETE FROM media_items WHERE album_id = ?`).bind(id),
      env.AUTH_DB.prepare(`DELETE FROM albums WHERE id = ?`).bind(id),
    ]);
    await audit(env, admin, 'media.album.delete', JSON.stringify({ id }));
    return json({ deleted: true });
  }
  const body = await parseJson(request);
  if (!body.ok) return body.response;
  const v = body.value;
  const patch: string[] = [];
  const args: unknown[] = [];
  if (v.title !== undefined) {
    const title = typeof v.title === 'string' ? v.title.trim() : '';
    if (!title || title.length > MAX_TITLE) return json({ error: 'title_required' }, 400);
    patch.push('title = ?'); args.push(title);
  }
  const code = patchFields(patch, args, v, ALBUM_TEXT);
  if (code !== null) return json({ error: code }, 400);
  return runPatch(env, admin, 'albums', id, patch, args, 'media.album.update', {});
}

async function itemById(env: Env, admin: User, request: Request, id: string, method: string): Promise<Response> {
  const row = await env.AUTH_DB.prepare(`SELECT id, album_id, type FROM media_items WHERE id = ?`).bind(id)
    .first<{ id: string; album_id: string; type: string }>();
  if (!row) return json({ error: 'unknown_item' }, 404);
  if (method === 'DELETE') {
    await env.AUTH_DB.prepare(`DELETE FROM media_items WHERE id = ?`).bind(id).run();
    await audit(env, admin, 'media.item.delete', JSON.stringify({ id, album_id: row.album_id }));
    return json({ deleted: true });
  }
  const body = await parseJson(request);
  if (!body.ok) return body.response;
  const v = body.value;
  const patch: string[] = [];
  const args: unknown[] = [];
  if (v.type !== undefined) {
    if (v.type !== 'image' && v.type !== 'video') return json({ error: 'invalid_type' }, 400);
    patch.push('type = ?'); args.push(v.type);
  }
  if (v.url !== undefined) {
    // A type change in the same PATCH applies before the url is validated.
    const type = v.type === 'video' || v.type === 'image' ? v.type : row.type;
    const url = validUrl(v.url, type);
    if (url === null) return json({ error: 'invalid_url' }, 400);
    patch.push('url = ?'); args.push(url);
  }
  if (v.album_id !== undefined) {
    if (!(await albumExists(env, v.album_id))) return json({ error: 'unknown_album' }, 400);
    patch.push('album_id = ?'); args.push(v.album_id);
  }
  const code = patchFields(patch, args, v, ITEM_TEXT);
  if (code !== null) return json({ error: code }, 400);
  return runPatch(env, admin, 'media_items', id, patch, args, 'media.item.update', { album_id: row.album_id });
}

export async function handleMediaApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/api/media' && !path.startsWith('/api/media/')) return null;
  const method = request.method.toUpperCase();

  if (path === '/api/media') {
    if (method !== 'GET') return methodNotAllowed('GET');
    return listAll(env);
  }

  const parts = path.slice('/api/media/'.length).split('/');
  if (parts.length > 2) return null;
  const collection = parts[0];
  if (collection !== 'albums' && collection !== 'items') return null;
  const id: string | undefined = parts[1];
  // A malformed id is indistinguishable from a missing one.
  if (id !== undefined && !ID_RE.test(id)) {
    return json({ error: collection === 'albums' ? 'unknown_album' : 'unknown_item' }, 404);
  }

  if (id === undefined) {
    if (method !== 'POST') return methodNotAllowed('POST');
    const auth = await requireAdmin(env, request);
    if ('response' in auth) return auth.response;
    const body = await parseJson(request);
    if (!body.ok) return body.response;
    return collection === 'albums' ? createAlbum(env, auth.user, body.value) : createItem(env, auth.user, body.value);
  }

  if (method !== 'PATCH' && method !== 'DELETE') return methodNotAllowed('PATCH, DELETE');
  const auth = await requireAdmin(env, request);
  if ('response' in auth) return auth.response;
  return collection === 'albums' ? albumById(env, auth.user, request, id, method) : itemById(env, auth.user, request, id, method);
}
