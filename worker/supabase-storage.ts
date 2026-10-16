/// <reference types="@cloudflare/workers-types" />

interface StorageEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export const STORAGE_BUCKET = 'event-posters';

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