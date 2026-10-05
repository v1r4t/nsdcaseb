/// <reference types="@cloudflare/workers-types" />

// Shared auth types, validation, sessions, rate limiting, and email tokens.
// Split out of worker/auth.ts to keep files focused (<400 lines each).

import {
  randomBytes,
  toBase64Url,
  sha256Base64Url,
  DUMMY_PASSWORD_HASH,
} from './auth-crypto';

export { DUMMY_PASSWORD_HASH };

export interface Env {
  AUTH_DB: D1Database;
  RATELIMIT_KV: KVNamespace;
  ASSETS: Fetcher;
}

export type Role = 'member' | 'executive' | 'admin';

export interface User {
  id: string;
  email: string;
  role: Role;
  is_executive: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface UserRow {
  id: string;
  email: string;
  role: string;
  is_executive: number;
  email_verified: number;
  created_at: string;
}

export interface RouteContext {
  request: Request;
  env: Env;
  url: URL;
}

export type RouteHandler = (ctx: RouteContext) => Promise<Response>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MAX_BODY_BYTES = 2048;
export const MAX_EMAIL_LENGTH = 254;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

export const SESSION_COOKIE = 'nsdc_session';
export const SESSION_TTL_REMEMBER_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_TTL_DEFAULT_SECONDS = 60 * 60 * 12; // 12 hours
export const EMAIL_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

export const RATE_LIMITS = {
  registerPerIp: { limit: 5, windowSeconds: 60 * 60 },
  loginPerIp: { limit: 10, windowSeconds: 60 * 15 },
  loginPerEmail: { limit: 5, windowSeconds: 60 * 15 },
} as const;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export function json(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export type JsonBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response };

export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: 'payload_too_large' }, 413) };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  if (buffer.byteLength > MAX_BODY_BYTES) {
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

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return null;
  return email;
}

export function isStrongPassword(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    password.length >= PASSWORD_MIN &&
    password.length <= PASSWORD_MAX &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export function normalizeRole(role: string): Role {
  return role === 'admin' || role === 'executive' ? role : 'member';
}

export function toIso(value: string): string {
  // D1 datetime('now') yields 'YYYY-MM-DD HH:MM:SS' — normalize to ISO 8601.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(' ', 'T') + 'Z';
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    role: normalizeRole(row.role),
    is_executive: !!row.is_executive,
    email_verified: !!row.email_verified,
    created_at: toIso(row.created_at),
  };
}

export function isUniqueViolation(err: unknown): boolean {
  return /unique/i.test(String(err));
}

export function clientIp(request: Request): string {
  const cf = request.headers.get('CF-Connecting-IP');
  if (cf && cf.trim()) return cf.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Rate limiting (KV, fail-open)
// ---------------------------------------------------------------------------

export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const current = Number((await env.RATELIMIT_KV.get(bucket)) ?? '0');
    if (current >= limit) return false;
    await env.RATELIMIT_KV.put(bucket, String(current + 1), { expirationTtl: windowSeconds });
    return true;
  } catch (err) {
    // Fail open: a KV outage must never take down the auth path.
    console.error('[auth] rate limit KV failure (failing open)', err);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Cookies and sessions
// ---------------------------------------------------------------------------

export function sessionCookie(token: string, remember: boolean): string {
  const parts = [`${SESSION_COOKIE}=${token}`, 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'];
  if (remember) parts.push(`Max-Age=${SESSION_TTL_REMEMBER_SECONDS}`);
  return parts.join('; ');
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

export async function createSession(
  env: Env,
  userId: string,
  request: Request,
  remember: boolean,
): Promise<{ token: string; expiresAt: string }> {
  const token = toBase64Url(randomBytes(32));
  const tokenHash = await sha256Base64Url(token);
  const ttl = remember ? SESSION_TTL_REMEMBER_SECONDS : SESSION_TTL_DEFAULT_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 180);
  await env.AUTH_DB
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, expiresAt, userAgent)
    .run();
  return { token, expiresAt };
}

export async function getSessionUser(env: Env, request: Request): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Base64Url(token);
  const row = await env.AUTH_DB
    .prepare(
      `SELECT u.id, u.email, u.role, u.is_executive, u.email_verified, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<UserRow & { expires_at: string }>();
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await env.AUTH_DB
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .run()
      .catch(() => {});
    return null;
  }
  return mapUser(row);
}

export function requireRole(user: User | null, role: Role): user is User {
  return user !== null && user.role === role;
}

// ---------------------------------------------------------------------------
// Email tokens
// ---------------------------------------------------------------------------

export async function createEmailToken(
  env: Env,
  userId: string,
  purpose: 'verify' | 'reset',
): Promise<string> {
  const token = toBase64Url(randomBytes(32));
  const tokenHash = await sha256Base64Url(token);
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_SECONDS * 1000).toISOString();
  await env.AUTH_DB
    .prepare('INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, purpose, expiresAt)
    .run();
  return token;
}

export async function consumeEmailToken(
  env: Env,
  token: string,
  purpose: 'verify' | 'reset',
): Promise<string | null> {
  if (!token) return null;
  const tokenHash = await sha256Base64Url(token);
  const row = await env.AUTH_DB
    .prepare('SELECT user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND purpose = ?')
    .bind(tokenHash, purpose)
    .first<{ user_id: string; expires_at: string; used_at: string | null }>();
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) return null;

  const claimed = await env.AUTH_DB
    .prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL')
    .bind(new Date().toISOString(), tokenHash)
    .run();
  if (!claimed.meta.changes) return null;
  return row.user_id;
}
