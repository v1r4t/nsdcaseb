/// <reference types="@cloudflare/workers-types" />

// Password hashing + token primitives for the auth router.
// Split out of worker/auth.ts to keep files focused (<400 lines each).

// NOTE: Cloudflare Workers caps WebCrypto PBKDF2 at 100,000 iterations —
// higher values throw NotSupportedError at runtime. The iteration count is
// stored in each hash, so this constant only affects newly created passwords.
export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_SALT_BYTES = 16;
export const PBKDF2_KEY_BYTES = 32;

// A syntactically valid hash used to equalize timing for unknown accounts.
export const DUMMY_PASSWORD_HASH =
  `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${'A'.repeat(22)}$${'A'.repeat(43)}`;

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    PBKDF2_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function sha256Base64Url(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(digest));
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PBKDF2_SALT_BYTES);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  try {
    const salt = fromBase64Url(parts[2]);
    const expected = fromBase64Url(parts[3]);
    const actual = await pbkdf2(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    // Malformed stored hash (corrupt row): fail closed, never throw.
    return false;
  }
}
