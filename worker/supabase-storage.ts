/// <reference types="@cloudflare/workers-types" />

interface StorageEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export const STORAGE_BUCKET = 'event-posters';

/**
 * Broadcast images live in their own public bucket so mail assets never mix
 * with event posters. Only JPEG and PNG uploads are accepted.
 */
export const EMAIL_BUCKET = 'email-assets';

/**
 * Deterministic poster keys. The original keeps the pre-variant path so
 * existing rows and URLs continue to work unchanged; variants live beside it.
 */
export function posterKeys(eventId: string): { original: string; thumb: string; full: string } {
  return {
    original: `events/${eventId}/poster.webp`,
    thumb: `events/${eventId}/poster-thumb.webp`,
    full: `events/${eventId}/poster-full.webp`,
  };
}

/**
 * Gallery photo keys. Uploaded gallery items share the poster bucket but live
 * under `gallery/`, so an item id is enough to find (or replace) its objects.
 */
export function galleryKeys(itemId: string): { original: string; thumb: string; full: string } {
  return {
    original: `gallery/${itemId}/photo.webp`,
    thumb: `gallery/${itemId}/photo-thumb.webp`,
    full: `gallery/${itemId}/photo-full.webp`,
  };
}

/**
 * Configured Supabase origin with trailing slashes stripped. Without this a
 * `SUPABASE_URL` ending in `/` builds `//storage/v1/...`: the upload still
 * works, but the doubled path separator produces a public URL whose pathname
 * no longer matches our own prefix checks (broadcast asset allowlist, gallery
 * variant derivation).
 */
function storageBase(env: StorageEnv): string | null {
  const raw = env.SUPABASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export function storageConfigured(env: StorageEnv): boolean {
  return storageBase(env) !== null && !!env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function deleteObject(env: StorageEnv, key: string): Promise<boolean> {
  const base = storageBase(env);
  if (!base || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const url = `${base}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Best-effort removal of a gallery item's original + variants. */
export async function deleteGalleryObjects(env: StorageEnv, itemId: string): Promise<void> {
  if (!storageConfigured(env)) return;
  const keys = galleryKeys(itemId);
  await Promise.all(
    [keys.original, keys.thumb, keys.full].map((key) => deleteObject(env, key).catch(() => false)),
  );
}

export async function uploadObject(env: StorageEnv, key: string, data: ArrayBuffer, contentType: string): Promise<boolean> {
  const base = storageBase(env);
  if (!base || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const url = `${base}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: data,
  });
  return res.ok;
}

/** Poster uploads predate gallery uploads; keep the name the events module uses. */
export function uploadPoster(env: StorageEnv, key: string, data: ArrayBuffer, contentType: string): Promise<boolean> {
  return uploadObject(env, key, data, contentType);
}

/**
 * Store a broadcast image under `email/{uuid}.jpg|png` and return its public
 * URL. Returns null when storage is unconfigured or the upload is rejected.
 */
export async function uploadEmailImage(
  env: StorageEnv,
  data: ArrayBuffer,
  contentType: 'image/jpeg' | 'image/png',
): Promise<string | null> {
  const base = storageBase(env);
  if (!base || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  const key = `email/${crypto.randomUUID()}.${extension}`;
  const url = `${base}/storage/v1/object/${EMAIL_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: data,
    });
    if (!res.ok) return null;
  } catch {
    return null;
  }
  return `${base}/storage/v1/object/public/${EMAIL_BUCKET}/${key}`;
}


/** Public URL for any object in the shared bucket (event posters and gallery). */
export function storageUrl(env: StorageEnv, key: string | null): string | null {
  if (!key) return null;
  const base = storageBase(env);
  if (!base) return null;
  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${key}`;
}

/** Alias kept for the events API, whose wire field is `poster_url`. */
export function posterUrl(env: StorageEnv, key: string | null): string | null {
  return storageUrl(env, key);
}

export interface PosterVariantUrls {
  thumb: string;
  full: string;
}

/**
 * Variant URLs for an event poster, derived from the stored original's
 * presence.
 *
 * This is deliberately signal-free: there is no `poster_variant` column and no
 * migration. New uploads always write both variants, so the URLs are valid.
 * Posters uploaded before this pipeline have no variant objects and their URLs
 * 404; the site drops `srcSet` on the image error event and renders the
 * original, so old rows degrade without a schema change. A head request per
 * event was rejected because the list endpoint would pay it N times.
 */
export function posterVariantUrls(
  env: StorageEnv,
  eventId: string,
  posterKey: string | null,
): PosterVariantUrls | null {
  if (!posterKey || !storageBase(env)) return null;
  const keys = posterKeys(eventId);
  return {
    thumb: posterUrl(env, keys.thumb) as string,
    full: posterUrl(env, keys.full) as string,
  };
}

/**
 * Variant URLs for an uploaded gallery item.
 *
 * There is no `variants` column: the presence of a gallery path on our own
 * Supabase host is the signal. The check is deliberately narrow (host and the
 * exact original object path), so URL-based items — including ones that happen
 * to live on the same Supabase project — never gain broken variant URLs.
 */
export function galleryVariantUrls(
  env: StorageEnv,
  itemId: string,
  url: string | null,
): PosterVariantUrls | null {
  const base = storageBase(env);
  if (!url || !base) return null;
  const keys = galleryKeys(itemId);
  const expected = storageUrl(env, keys.original);
  if (!expected) return null;
  let actualUrl: URL;
  let configuredUrl: URL;
  let expectedUrl: URL;
  try {
    actualUrl = new URL(url);
    configuredUrl = new URL(base);
    expectedUrl = new URL(expected);
  } catch {
    return null;
  }
  if (actualUrl.hostname.toLowerCase() !== configuredUrl.hostname.toLowerCase()) return null;
  if (actualUrl.pathname !== expectedUrl.pathname) return null;
  return {
    thumb: storageUrl(env, keys.thumb) as string,
    full: storageUrl(env, keys.full) as string,
  };
}
