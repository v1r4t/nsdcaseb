/**
 * Typed client for the media gallery API.
 *
 * Same-origin relative paths with `credentials: 'include'`, mirroring the
 * ApiError pattern from ./api and ./events. Media is URL-based: every item
 * points at an external https URL, videos at YouTube.
 */

export type MediaType = 'image' | 'video';

export interface MediaItem {
  id: string;
  type: MediaType;
  url: string;
  title: string;
  caption: string;
  sort_order: number;
}

export interface MediaAlbum {
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  event_id: string | null;
  sort_order: number;
  items: MediaItem[];
}

export interface MediaListResponse {
  albums: MediaAlbum[];
}

/** One slide in the landing Archive carousel. */
export interface ArchiveSlide {
  url: string;
  title: string;
  caption: string;
  albumId: string;
  albumTitle: string;
  eventId: string | null;
}

/**
 * Flatten albums into carousel slides, keeping at most `perAlbum` images per
 * event/album (owner's current archive policy: six photos per event). Videos
 * and empty URLs are skipped; album order is preserved.
 */
export function archiveSlides(albums: MediaAlbum[], perAlbum = 6): ArchiveSlide[] {
  const slides: ArchiveSlide[] = [];
  for (const album of albums) {
    let taken = 0;
    for (const item of album.items ?? []) {
      if (taken >= perAlbum) break;
      if (item.type !== 'image') continue;
      if (typeof item.url !== 'string' || item.url.length === 0) continue;
      slides.push({
        url: item.url,
        title: item.title || album.title,
        caption: item.caption,
        albumId: album.id,
        albumTitle: album.title,
        eventId: album.event_id,
      });
      taken += 1;
    }
  }
  return slides;
}

export interface CreatedResponse {
  id: string;
}

export interface OkResponse {
  ok: true;
}

export interface DeletedResponse {
  deleted: true;
}

/** Fields accepted when creating an album. `title` is the only required one. */
export interface AlbumInput {
  title: string;
  description?: string;
  /** `null` clears the cover. Images only — the server does not check it. */
  cover_url?: string | null;
  /** Loose label reference; no foreign key is enforced. */
  event_id?: string | null;
  sort_order?: number;
}

/** Partial album patch; every field is optional. */
export type AlbumPatch = Partial<AlbumInput>;

export interface ItemInput {
  album_id: string;
  type: MediaType;
  /** https only. Videos must live on youtube.com / youtu.be / youtube-nocookie.com. */
  url: string;
  title?: string;
  caption?: string;
  sort_order?: number;
}

/** URL pair returned after a gallery photo upload. */
export interface GalleryPhotoVariants {
  thumb: string;
  full: string;
}

/** Response of the multipart item create/update endpoints. */
export interface ItemPhotoResponse {
  id: string;
  url: string;
  variants: GalleryPhotoVariants | null;
}

/** Metadata fields carried alongside a gallery photo. `type` is always image. */
export interface ItemPhotoInput {
  album_id: string;
  title?: string;
  caption?: string;
  sort_order?: number;
}

/** Browser-generated photo bytes for the multipart item endpoints. */
export interface ItemPhotoFiles {
  photo: Blob;
  /** Optional pair; send both or neither. */
  thumb?: Blob | null;
  full?: Blob | null;
}


/** Partial item patch, including a move to another album. */
export interface ItemPatch {
  album_id?: string;
  type?: MediaType;
  url?: string;
  title?: string;
  caption?: string;
  sort_order?: number;
}

/** Every failure surfaces as an ApiError, so callers can branch on `.error`. */
export class ApiError extends Error {
  readonly status: number;
  /** Machine code from the `{ error }` envelope, or a client-side fallback. */
  readonly error: string;

  constructor(status: number, error: string) {
    super(error);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Hang-risk guard: a stalled connection must surface as `network_error`
 * (which every caller already renders as a friendly empty/error state)
 * instead of hanging the page forever.
 */
const REQUEST_TIMEOUT_MS = 15_000;

function errorCode(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const code = (payload as { error?: unknown }).error;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  if (status === 401) return 'unauthenticated';
  if (status === 429) return 'rate_limited';
  return 'request_failed';
}

async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network_error');
  } finally {
    clearTimeout(timer);
  }
  const raw = await response.text().catch(() => '');
  let payload: unknown = null;
  try {
    payload = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new ApiError(response.status, errorCode(payload, response.status));
  return payload as T;
}

/**
 * Multipart uploads carry a photo up to 10 MB plus variants, so the JSON
 * request timeout is too aggressive. Everything else (credentials, error
 * envelope) matches `request`.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

async function uploadRequest<T>(path: string, method: 'POST' | 'PATCH', form: FormData): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      body: form,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network_error');
  } finally {
    clearTimeout(timer);
  }
  const raw = await response.text().catch(() => '');
  let payload: unknown = null;
  try {
    payload = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new ApiError(response.status, errorCode(payload, response.status));
  return payload as T;
}

function appendItemFields(form: FormData, input: ItemPhotoInput): void {
  form.append('album_id', input.album_id);
  form.append('type', 'image');
  form.append('title', input.title ?? '');
  form.append('caption', input.caption ?? '');
  // Blank/undefined means the server default on create and unchanged on patch.
  if (input.sort_order !== undefined) form.append('sort_order', String(input.sort_order));
}

function appendItemPhoto(form: FormData, files: ItemPhotoFiles): void {
  const name = files.photo instanceof File && files.photo.name ? files.photo.name : 'photo';
  form.append('photo', files.photo, name);
  if (files.thumb && files.full) {
    form.append('photo_thumb', files.thumb, 'photo-thumb.webp');
    form.append('photo_full', files.full, 'photo-full.webp');
  }
}

// Reads ----------------------------------------------------------------------

/** Public: albums ordered by sort_order, each with its items ordered too. */
export function listMedia(): Promise<MediaListResponse> {
  return request<MediaListResponse>('/api/media');
}

// Admin mutations ------------------------------------------------------------
// Every one of these requires an admin session; a member gets a 403.

export function createAlbum(input: AlbumInput): Promise<CreatedResponse> {
  return request<CreatedResponse>('/api/media/albums', 'POST', input);
}

export function updateAlbum(id: string, patch: AlbumPatch): Promise<OkResponse> {
  return request<OkResponse>(`/api/media/albums/${encodeURIComponent(id)}`, 'PATCH', patch);
}

/** Deletes the album and, by cascade, every item inside it. */
export function deleteAlbum(id: string): Promise<DeletedResponse> {
  return request<DeletedResponse>(`/api/media/albums/${encodeURIComponent(id)}`, 'DELETE');
}

export function createItem(input: ItemInput): Promise<CreatedResponse> {
  return request<CreatedResponse>('/api/media/items', 'POST', input);
}

export function updateItem(id: string, patch: ItemPatch): Promise<OkResponse> {
  return request<OkResponse>(`/api/media/items/${encodeURIComponent(id)}`, 'PATCH', patch);
}

/**
 * Create an image item with a multipart body: metadata fields, the `photo`
 * original, and the optional `photo_thumb` / `photo_full` WebP pair.
 */
export function createItemPhoto(input: ItemPhotoInput, files: ItemPhotoFiles): Promise<ItemPhotoResponse> {
  const form = new FormData();
  appendItemFields(form, input);
  appendItemPhoto(form, files);
  return uploadRequest<ItemPhotoResponse>('/api/media/items', 'POST', form);
}

/**
 * Replace an image item's photo (and optionally move/edit its metadata).
 * Omitting `files` is not supported here — use `updateItem` for metadata-only
 * patches so the existing URL is preserved.
 */
export function updateItemPhoto(
  id: string,
  input: ItemPhotoInput,
  files: ItemPhotoFiles,
): Promise<ItemPhotoResponse> {
  const form = new FormData();
  appendItemFields(form, input);
  appendItemPhoto(form, files);
  return uploadRequest<ItemPhotoResponse>(`/api/media/items/${encodeURIComponent(id)}`, 'PATCH', form);
}

export function deleteItem(id: string): Promise<DeletedResponse> {
  return request<DeletedResponse>(`/api/media/items/${encodeURIComponent(id)}`, 'DELETE');
}
