/// <reference types="@cloudflare/workers-types" />

// Phase 4: media gallery API (albums + items). Items are either URL-based or
// uploaded photos stored in Supabase Storage (original + WebP thumb/full
// variants, mirroring the event-poster pipeline). This module owns every
// /api/media path. GET is public; mutations are admin-only (401 unauth, 403
// non-admin, 404 unknown id, 405 + Allow on a wrong method).

import { getSessionUser, json, requireMinRole } from './auth-helpers';
import type { Env, User } from './auth-helpers';
import {
  deleteGalleryObjects,
  galleryKeys,
  galleryVariantUrls,
  storageConfigured,
  storageUrl,
  uploadObject,
} from './supabase-storage';
import type { PosterVariantUrls } from './supabase-storage';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// auth-helpers' readJsonBody caps bodies at 2KB (tuned for auth); captions here can exceed that.
const MAX_MEDIA_BODY_BYTES = 32 * 1024;
const MAX_TITLE = 160;
const MAX_TEXT = 2000;
const MAX_URL = 2048;
const MAX_ID_REF = 64;
// Cap on the uploaded source photo. Variant files are client-generated and
// tiny, but the same limit is applied to them so a malformed request cannot
// push an oversized object into storage.
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

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
type ItemOut = {
  id: string;
  type: 'image' | 'video';
  url: string;
  title: string;
  caption: string;
  sort_order: number;
  /** Present only for items uploaded through the multipart pipeline. */
  variants?: PosterVariantUrls;
};
type ParseResult = { ok: true; value: Record<string, unknown> } | { ok: false; response: Response };
type ReadResult = { ok: true; values: Record<string, string | null> } | { ok: false; code: string };
type FormResult = { ok: true; form: FormData } | { ok: false; response: Response };

interface UploadFile {
  data: ArrayBuffer;
  /** Lowercased MIME type; '' when the client omitted it. */
  type: string;
  /** Size in bytes as reported by the File, before reading it into memory. */
  size: number;
}

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

async function parseForm(request: Request): Promise<FormResult> {
  try {
    return { ok: true, form: await request.formData() };
  } catch {
    return { ok: false, response: json({ error: 'invalid_form' }, 400) };
  }
}

async function requireAdmin(env: Env, request: Request): Promise<{ user: User } | { response: Response }> {
  const user = await getSessionUser(env, request);
  if (!user) return { response: json({ error: 'unauthenticated' }, 401) };
  if (!requireMinRole(user, 'ob')) return { response: json({ error: 'forbidden' }, 403) };
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

/** Multipart text fields arrive as strings, so sort_order needs its own parse. */
function formSort(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed === '') return { ok: true, value: null };
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || Math.abs(parsed) > 1_000_000) return { ok: false };
  return { ok: true, value: parsed };
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

async function readUpload(form: FormData, field: string): Promise<UploadFile | null> {
  const value = form.get(field);
  if (!(value instanceof File)) return null;
  return { data: await value.arrayBuffer(), type: (value.type || '').toLowerCase(), size: value.size };
}

/** Raw text field; absent fields stay `undefined` so PATCH semantics are kept. */
function formText(form: FormData, field: string): unknown {
  const value = form.get(field);
  return value === null ? undefined : value;
}

/** Read an ASCII range from the file header without allocating a copy. */
function headerAscii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * Magic-byte sniff for the image formats a browser can actually produce.
 * MIME types are client-controlled, so the source must also look like an
 * image: JPEG, PNG, WebP, GIF, or an AVIF/HEIF ISO-BMFF container.
 */
function isSupportedImage(data: ArrayBuffer): boolean {
  const b = new Uint8Array(data);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b.length >= 8 && b[0] === 0x89 && headerAscii(b, 1, 4) === 'PNG'
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return true; // PNG
  if (b.length >= 12 && headerAscii(b, 0, 4) === 'RIFF' && headerAscii(b, 8, 12) === 'WEBP') return true;
  if (b.length >= 6) {
    const gif = headerAscii(b, 0, 6);
    if (gif === 'GIF87a' || gif === 'GIF89a') return true;
  }
  if (b.length >= 12 && headerAscii(b, 4, 8) === 'ftyp') {
    const brand = headerAscii(b, 8, 12);
    if (brand === 'avif' || brand === 'avis' || brand === 'heic' || brand === 'heix'
      || brand === 'mif1' || brand === 'msf1') return true;
  }
  return false;
}

/**
 * Sources must be images. An empty MIME type is treated as WebP (mirrors the
 * poster upload path); anything non-image — video included — is rejected.
 * The MIME check is not enough on its own; callers also sniff the header.
 */
function originalContentType(file: UploadFile): string | null {
  if (!file.type) return 'image/webp';
  return file.type.startsWith('image/') ? file.type : null;
}

/** Variants travel as a WebP pair; one without the other is a client bug. */
function validVariants(thumb: UploadFile | null, full: UploadFile | null): boolean {
  if (!!thumb !== !!full) return false;
  for (const file of [thumb, full]) {
    if (file && file.type !== 'image/webp') return false;
  }
  return true;
}

function tooLarge(files: ReadonlyArray<UploadFile | null>): boolean {
  return files.some((file) => file !== null && file.size > MAX_PHOTO_BYTES);
}

/** Write the original plus whichever variants were supplied, all deterministic keys. */
async function storePhotoSet(
  env: Env,
  itemId: string,
  photo: UploadFile,
  thumb: UploadFile | null,
  full: UploadFile | null,
): Promise<boolean> {
  const keys = galleryKeys(itemId);
  const files: Array<[string, UploadFile]> = [[keys.original, photo]];
  if (thumb) files.push([keys.thumb, thumb]);
  if (full) files.push([keys.full, full]);
  const results = await Promise.all(
    files.map(([key, file]) => uploadObject(env, key, file.data, file.type || 'image/webp')),
  );
  return results.every(Boolean);
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
    const item: ItemOut = {
      id: row.id, type: row.type === 'video' ? 'video' : 'image', url: row.url,
      title: row.title, caption: row.caption, sort_order: row.sort_order,
    };
    // URL-based rows (and rows whose URL left our storage host) carry no variants.
    const variants = galleryVariantUrls(env, row.id, row.url);
    if (variants) item.variants = variants;
    const bucket = byAlbum.get(row.album_id) ?? [];
    bucket.push(item);
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

/**
 * Multipart create: the photo is the item. `type` is optional and inferred as
 * image (the only upload kind); an explicit non-image value is a client bug.
 */
async function createItemUpload(env: Env, admin: User, request: Request): Promise<Response> {
  const parsed = await parseForm(request);
  if (!parsed.ok) return parsed.response;
  const form = parsed.form;

  const albumId = form.get('album_id');
  if (typeof albumId !== 'string' || !(await albumExists(env, albumId))) {
    return json({ error: 'unknown_album' }, 400);
  }
  const rawType = form.get('type');
  if (rawType !== null && rawType !== 'image') return json({ error: 'invalid_type' }, 400);

  const photo = await readUpload(form, 'photo');
  if (!photo) return json({ error: 'photo_required' }, 400);
  const thumb = await readUpload(form, 'photo_thumb');
  const full = await readUpload(form, 'photo_full');
  // Size is checked before sniffing so an oversized upload always gets the
  // documented 413 even when its header is not a valid image.
  if (tooLarge([photo, thumb, full])) return json({ error: 'photo_too_large' }, 413);

  const contentType = originalContentType(photo);
  if (contentType === null || !isSupportedImage(photo.data)) {
    return json({ error: 'invalid_file_type' }, 400);
  }

  if (!validVariants(thumb, full)) return json({ error: 'invalid_variants' }, 400);

  const read = readFields({ title: formText(form, 'title'), caption: formText(form, 'caption') }, ITEM_TEXT);
  if (!read.ok) return json({ error: read.code }, 400);
  const sort = formSort(formText(form, 'sort_order'));
  if (!sort.ok) return json({ error: 'invalid_sort_order' }, 400);

  if (!storageConfigured(env)) return json({ error: 'storage_not_configured' }, 503);

  const id = crypto.randomUUID();
  const ok = await storePhotoSet(env, id, { ...photo, type: contentType }, thumb, full);
  if (!ok) return json({ error: 'photo_upload_failed' }, 502);
  const url = storageUrl(env, galleryKeys(id).original) as string;

  const c = read.values;
  await env.AUTH_DB.prepare(
    `INSERT INTO media_items (id, album_id, type, source, url, title, caption, sort_order) VALUES (?, ?, 'image', 'storage', ?, ?, ?, ?)`,
  ).bind(id, albumId, url, c.title ?? '', c.caption ?? '', sort.value ?? 0).run();
  await audit(env, admin, 'media.item.create', JSON.stringify({ id, album_id: albumId, type: 'image' }));
  return json({ id, url, variants: galleryVariantUrls(env, id, url) }, 201);
}

async function albumById(env: Env, admin: User, request: Request, id: string, method: string): Promise<Response> {
  const row = await env.AUTH_DB.prepare(`SELECT id FROM albums WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!row) return json({ error: 'unknown_album' }, 404);
  if (method === 'DELETE') {
    // Collect item ids first: deleting the album cascades them away.
    const items = (await env.AUTH_DB.prepare(`SELECT id FROM media_items WHERE album_id = ?`).bind(id).all<{ id: string }>())
      .results ?? [];
    // Children go explicitly rather than via the FK cascade: correct either way.
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(`DELETE FROM media_items WHERE album_id = ?`).bind(id),
      env.AUTH_DB.prepare(`DELETE FROM albums WHERE id = ?`).bind(id),
    ]);
    // Best-effort: storage cleanup must not fail the delete after D1 committed.
    await Promise.all(items.map((item) => deleteGalleryObjects(env, item.id).catch(() => {})));
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

type ItemRef = { id: string; album_id: string; type: string };

/**
 * Multipart PATCH: field edits plus an optional replacement photo/variant set.
 * Without a photo this behaves exactly like the JSON patch path.
 */
async function itemPatchUpload(env: Env, admin: User, request: Request, id: string, row: ItemRef): Promise<Response> {
  const parsed = await parseForm(request);
  if (!parsed.ok) return parsed.response;
  const form = parsed.form;

  const v: Record<string, unknown> = {
    title: formText(form, 'title'),
    caption: formText(form, 'caption'),
  };
  const albumId = form.get('album_id');
  if (albumId !== null) {
    if (typeof albumId !== 'string' || !(await albumExists(env, albumId))) {
      return json({ error: 'unknown_album' }, 400);
    }
    v.album_id = albumId;
  }
  const rawType = form.get('type');
  if (rawType !== null) {
    if (rawType !== 'image' && rawType !== 'video') return json({ error: 'invalid_type' }, 400);
    v.type = rawType;
  }
  const sort = formSort(formText(form, 'sort_order'));
  if (!sort.ok) return json({ error: 'invalid_sort_order' }, 400);
  if (sort.value !== null) v.sort_order = sort.value;

  const photo = await readUpload(form, 'photo');
  const thumb = await readUpload(form, 'photo_thumb');
  const full = await readUpload(form, 'photo_full');
  if (tooLarge([photo, thumb, full])) return json({ error: 'photo_too_large' }, 413);
  if (!validVariants(thumb, full)) return json({ error: 'invalid_variants' }, 400);
  // Variants replace objects beside an original; without one there is nothing
  // to attach them to.
  if (!photo && (thumb || full)) return json({ error: 'invalid_variants' }, 400);

  let contentType: string | null = null;
  if (photo) {
    contentType = originalContentType(photo);
    if (contentType === null || !isSupportedImage(photo.data)) {
      return json({ error: 'invalid_file_type' }, 400);
    }
    if (v.type === 'video') return json({ error: 'invalid_type' }, 400);
  }

  const patch: string[] = [];
  const args: unknown[] = [];
  if (v.album_id !== undefined) { patch.push('album_id = ?'); args.push(v.album_id); }
  // A photo always makes the item an image; otherwise an explicit type is respected.
  if (!photo && v.type !== undefined) { patch.push('type = ?'); args.push(v.type); }
  const code = patchFields(patch, args, v, ITEM_TEXT);
  if (code !== null) return json({ error: code }, 400);

  let url: string | null = null;
  let variants: PosterVariantUrls | null = null;
  if (photo) {
    if (!storageConfigured(env)) return json({ error: 'storage_not_configured' }, 503);
    const ok = await storePhotoSet(env, id, { ...photo, type: contentType as string }, thumb, full);
    if (!ok) return json({ error: 'photo_upload_failed' }, 502);
    url = storageUrl(env, galleryKeys(id).original) as string;
    patch.push(`type = ?`); args.push('image');
    patch.push(`source = ?`); args.push('storage');
    patch.push(`url = ?`); args.push(url);
    variants = galleryVariantUrls(env, id, url);
  }

  if (patch.length === 0) return json({ error: 'nothing_to_update' }, 400);
  await env.AUTH_DB.prepare(`UPDATE media_items SET ${patch.join(', ')} WHERE id = ?`).bind(...args, id).run();
  await audit(env, admin, 'media.item.update', JSON.stringify({ id, album_id: row.album_id }));
  if (!photo) return json({ ok: true });
  return json({ ok: true, id, url, variants });
}

async function itemById(env: Env, admin: User, request: Request, id: string, method: string): Promise<Response> {
  const row = await env.AUTH_DB.prepare(`SELECT id, album_id, type FROM media_items WHERE id = ?`).bind(id)
    .first<ItemRef>();
  if (!row) return json({ error: 'unknown_item' }, 404);
  if (method === 'DELETE') {
    await env.AUTH_DB.prepare(`DELETE FROM media_items WHERE id = ?`).bind(id).run();
    // Best-effort storage cleanup; the D1 row is already gone either way.
    await deleteGalleryObjects(env, id).catch(() => {});
    await audit(env, admin, 'media.item.delete', JSON.stringify({ id, album_id: row.album_id }));
    return json({ deleted: true });
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) return itemPatchUpload(env, admin, request, id, row);
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
    if (collection === 'items' && (request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      return createItemUpload(env, auth.user, request);
    }
    const body = await parseJson(request);
    if (!body.ok) return body.response;
    return collection === 'albums' ? createAlbum(env, auth.user, body.value) : createItem(env, auth.user, body.value);
  }

  if (method !== 'PATCH' && method !== 'DELETE') return methodNotAllowed('PATCH, DELETE');
  const auth = await requireAdmin(env, request);
  if ('response' in auth) return auth.response;
  return collection === 'albums' ? albumById(env, auth.user, request, id, method) : itemById(env, auth.user, request, id, method);
}
