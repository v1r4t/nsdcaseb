/// <reference types="@cloudflare/workers-types" />

// Bearer portrait uploads. Portraits share the public `event-posters` bucket
// with event and gallery photos but live under a `people/` prefix, so no new
// Supabase bucket or migration is required. The admin console uploads the
// bytes here and then stores the returned public URL as `photo_url`.

import { storageConfigured, storageUrl, uploadObject } from './supabase-storage';

/** Portraits render at card size; 5 MB leaves room for a phone photo. */
export const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;
/** Declared-body ceiling before multipart parsing: 5 MB file + envelope slack. */
export const MAX_PORTRAIT_REQUEST_BYTES = 6 * 1024 * 1024;

export type PortraitContentType = 'image/jpeg' | 'image/png' | 'image/webp';

const EXTENSIONS: Record<PortraitContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Only the formats every browser renders and we can reliably sniff. SVG is
 * deliberately absent: it is scriptable and never belongs in an <img> upload.
 */
export function isPortraitContentType(value: string): value is PortraitContentType {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

/** Read an ASCII range from the file header without allocating a copy. */
function headerAscii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * Magic-byte sniff. The declared MIME comes from the client, so the bytes must
 * also look like an image before they are written to public storage.
 */
export function detectPortraitType(data: ArrayBuffer): PortraitContentType | null {
  const b = new Uint8Array(data);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 8 &&
    b[0] === 0x89 && headerAscii(b, 1, 4) === 'PNG' &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (b.length >= 12 && headerAscii(b, 0, 4) === 'RIFF' && headerAscii(b, 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** Filesystem-safe, human-readable stem: `portrait-k-shanmuga-priya.webp`. */
function portraitSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug || 'bearer';
}

export interface StoredPortrait {
  /** Public URL to persist as `photo_url`. */
  url: string;
  /** Object/file name, useful for confirmations and support. */
  name: string;
  /** Alt text suggestion derived from the bearer's name. */
  alt: string;
}

/**
 * Validate nothing here: callers pass bytes already checked against
 * `detectPortraitType`. Returns null when storage is unconfigured or the
 * upload is rejected, so the route can answer 503/502 without inventing a URL.
 */
export async function uploadPortrait(
  env: { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string },
  data: ArrayBuffer,
  contentType: PortraitContentType,
  personName: string,
): Promise<StoredPortrait | null> {
  if (!storageConfigured(env)) return null;
  const cleanName = personName.trim().slice(0, 120);
  const name = `portrait-${portraitSlug(cleanName || 'office-bearer')}.${EXTENSIONS[contentType]}`;
  const key = `people/${crypto.randomUUID()}/${name}`;
  const ok = await uploadObject(env, key, data, contentType);
  if (!ok) return null;
  const url = storageUrl(env, key);
  if (!url) return null;
  return {
    url,
    name,
    alt: `Portrait of ${cleanName || 'an office bearer'}`,
  };
}
