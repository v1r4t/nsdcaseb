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
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error');
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

export function deleteItem(id: string): Promise<DeletedResponse> {
  return request<DeletedResponse>(`/api/media/items/${encodeURIComponent(id)}`, 'DELETE');
}

/** Human-readable message for the codes the media API returns. */
export function mediaErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (err.error) {
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.';
    case 'unauthenticated':
      return 'Sign in as an admin to manage the gallery.';
    case 'forbidden':
      return 'Only admins can manage the gallery.';
    case 'unknown_album':
      return 'That album no longer exists.';
    case 'unknown_item':
      return 'That item no longer exists.';
    case 'title_required':
      return 'An album needs a title.';
    case 'invalid_type':
      return 'Type must be image or video.';
    case 'invalid_url':
      return 'Use an https URL. Videos must be a YouTube link.';
    default:
      return 'Could not save. Please try again.';
  }
}
