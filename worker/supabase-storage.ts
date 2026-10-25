/// <reference types="@cloudflare/workers-types" />

interface StorageEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export const STORAGE_BUCKET = 'event-posters';

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

export function storageConfigured(env: StorageEnv): boolean {
  return !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function uploadPoster(env: StorageEnv, key: string, data: ArrayBuffer, contentType: string): Promise<boolean> {
  if (!storageConfigured(env)) return false;
  const url = `${env.SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
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

export function posterUrl(env: StorageEnv, key: string | null): string | null {
  if (!key) return null;
  if (!env.SUPABASE_URL) return null;
  return `${env.SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${key}`;
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
  if (!posterKey || !env.SUPABASE_URL) return null;
  const keys = posterKeys(eventId);
  return {
    thumb: posterUrl(env, keys.thumb) as string,
    full: posterUrl(env, keys.full) as string,
  };
}
