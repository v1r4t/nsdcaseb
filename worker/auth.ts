/// <reference types="@cloudflare/workers-types" />

// Phase 1 auth router: same-origin JSON API over D1 + KV rate limits.
// Helper modules: ./auth-crypto (hashing), ./auth-helpers (sessions/tokens).

import { sendEmail, type EmailMessage } from './mailer';
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from './auth-crypto';
import {
  json,
  readJsonBody,
  normalizeEmail,
  isStrongPassword,
  mapUser,
  isUniqueViolation,
  clientIp,
  rateLimit,
  sessionCookie,
  clearSessionCookie,
  readCookie,
  createSession,
  getSessionUser,
  requireRole,
  createEmailToken,
  consumeEmailToken,
  SESSION_COOKIE,
  RATE_LIMITS,
  type Env,
  type RouteContext,
  type RouteHandler,
  type Role,
  type User,
  type UserRow,
} from './auth-helpers';
import { sha256Base64Url } from './auth-crypto';

// Re-export shared types so existing imports (`./auth`) keep working,
// e.g. mailer.ts `import type { Env } from './auth'` and staging.ts.
export type { Env, Role, User, UserRow, RouteContext, RouteHandler };
export {
  hashPassword,
  verifyPassword,
  isStrongPassword,
  createSession,
  getSessionUser,
  requireRole,
  rateLimit,
  DUMMY_PASSWORD_HASH,
};

async function trySendEmail(env: Env, msg: EmailMessage): Promise<void> {
  try {
    await sendEmail(env, msg);
  } catch (err) {
    // Delivery is best-effort; auth responses never depend on it.
    console.error('[auth] email send failed', err);
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function loadUserById(env: Env, id: string): Promise<User | null> {
  const row = await env.AUTH_DB
    .prepare('SELECT id, email, role, is_executive, email_verified, created_at FROM users WHERE id = ?')
    .bind(id)
    .first<UserRow>();
  return row ? mapUser(row) : null;
}

async function handleRegister({ request, env }: RouteContext): Promise<Response> {
  const ip = clientIp(request);
  if (
    !(await rateLimit(
      env,
      `register:ip:${ip}`,
      RATE_LIMITS.registerPerIp.limit,
      RATE_LIMITS.registerPerIp.windowSeconds,
    ))
  ) {
    return json({ error: 'rate_limited' }, 429);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const email = normalizeEmail(body.value.email);
  if (!email) return json({ error: 'invalid_email' }, 400);

  const password = body.value.password;
  if (!isStrongPassword(password)) return json({ error: 'weak_password' }, 400);

  // Role is derived ONLY from the boolean flag; any non-boolean value is false.
  // No client-supplied `role` / `is_admin` field is read anywhere.
  const isExecutive = body.value.is_executive === true;
  const role: Role = isExecutive ? 'executive' : 'member';

  const existing = await env.AUTH_DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  if (existing) return json({ error: 'email_taken' }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await env.AUTH_DB
      .prepare('INSERT INTO users (id, email, password_hash, role, is_executive) VALUES (?, ?, ?, ?, ?)')
      .bind(id, email, passwordHash, role, isExecutive ? 1 : 0)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) return json({ error: 'email_taken' }, 409);
    throw err;
  }

  const user = await loadUserById(env, id);
  if (!user) throw new Error('user_missing_after_insert');

  // Best-effort verification email; delivery failure is never surfaced.
  try {
    const verifyToken = await createEmailToken(env, id, 'verify');
    await trySendEmail(env, {
      to: email,
      subject: 'Verify your NSDC account',
      text: `Verify your email: ${new URL(request.url).origin}/verify-email?token=${verifyToken}`,
    });
  } catch (err) {
    console.error('[auth] verification email setup failed', err);
  }

  const { token } = await createSession(env, id, request, false);
  return json({ user }, 201, { 'set-cookie': sessionCookie(token, false) });
}

async function handleLogin({ request, env }: RouteContext): Promise<Response> {
  const ip = clientIp(request);
  if (
    !(await rateLimit(
      env,
      `login:ip:${ip}`,
      RATE_LIMITS.loginPerIp.limit,
      RATE_LIMITS.loginPerIp.windowSeconds,
    ))
  ) {
    return json({ error: 'rate_limited' }, 429);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const email = normalizeEmail(body.value.email);
  if (!email) return json({ error: 'invalid_credentials' }, 401);

  if (
    !(await rateLimit(
      env,
      `login:email:${email}`,
      RATE_LIMITS.loginPerEmail.limit,
      RATE_LIMITS.loginPerEmail.windowSeconds,
    ))
  ) {
    return json({ error: 'rate_limited' }, 429);
  }

  const row = await env.AUTH_DB
    .prepare(
      'SELECT id, email, password_hash, role, is_executive, email_verified, created_at FROM users WHERE email = ?',
    )
    .bind(email)
    .first<UserRow & { password_hash: string }>();

  const password = typeof body.value.password === 'string' ? body.value.password : '';
  const valid = await verifyPassword(password, row ? row.password_hash : DUMMY_PASSWORD_HASH);
  if (!row || !valid) return json({ error: 'invalid_credentials' }, 401);

  const remember = body.value.remember === true;
  const { token, expiresAt } = await createSession(env, row.id, request, remember);
  return json(
    { user: mapUser(row), expires_at: expiresAt },
    200,
    { 'set-cookie': sessionCookie(token, remember) },
  );
}

async function handleLogout({ request, env }: RouteContext): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Base64Url(token);
    await env.AUTH_DB
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .run()
      .catch(() => {});
  }
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearSessionCookie(), 'cache-control': 'no-store' },
  });
}

async function handleMe({ request, env }: RouteContext): Promise<Response> {
  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'unauthenticated' }, 401);
  return json({ user });
}

async function handleForgotPassword({ request, env }: RouteContext): Promise<Response> {
  // Never reveal whether an account exists, and never fail the request: any
  // error (including a mail/KV outage) still yields the uniform 202.
  try {
    const body = await readJsonBody(request);
    if (body.ok) {
      const email = normalizeEmail(body.value.email);
      if (email) {
        const row = await env.AUTH_DB
          .prepare('SELECT id FROM users WHERE email = ?')
          .bind(email)
          .first<{ id: string }>();
        if (row) {
          const token = await createEmailToken(env, row.id, 'reset');
          await trySendEmail(env, {
            to: email,
            subject: 'Reset your NSDC password',
            text: `Reset your password: ${new URL(request.url).origin}/reset-password?token=${token}`,
          });
        }
      }
    }
  } catch (err) {
    console.error('[auth] forgot-password side effect failed', err);
  }
  return json({ ok: true }, 202);
}

async function handleResetPassword({ request, env }: RouteContext): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const password = body.value.password;
  if (!isStrongPassword(password)) return json({ error: 'weak_password' }, 400);

  const token = typeof body.value.token === 'string' ? body.value.token : '';
  const userId = await consumeEmailToken(env, token, 'reset');
  if (!userId) return json({ error: 'invalid_token' }, 400);

  const passwordHash = await hashPassword(password);
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, userId),
    env.AUTH_DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
  ]);
  return json({ ok: true });
}

async function handleVerifyEmail({ request, env }: RouteContext): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const token = typeof body.value.token === 'string' ? body.value.token : '';
  const userId = await consumeEmailToken(env, token, 'verify');
  if (!userId) return json({ error: 'invalid_token' }, 400);

  await env.AUTH_DB
    .prepare('UPDATE users SET email_verified = 1 WHERE id = ?')
    .bind(userId)
    .run();

  // Confirmation mail is best-effort and never affects the response.
  const user = await loadUserById(env, userId);
  if (user) {
    await trySendEmail(env, {
      to: user.email,
      subject: 'Your NSDC email is verified',
      text: 'Your email address has been verified. Welcome to NSDC!',
    });
  }
  return json({ ok: true });
}

async function handleAdminPing({ request, env }: RouteContext): Promise<Response> {
  const user = await getSessionUser(env, request);
  if (!requireRole(user, 'admin')) return json({ error: 'forbidden' }, 403);
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Route table / dispatcher
// ---------------------------------------------------------------------------

const ROUTES: ReadonlyArray<{ method: string; path: string; handler: RouteHandler }> = [
  { method: 'POST', path: '/api/auth/register', handler: handleRegister },
  { method: 'POST', path: '/api/auth/login', handler: handleLogin },
  { method: 'POST', path: '/api/auth/logout', handler: handleLogout },
  { method: 'GET', path: '/api/auth/me', handler: handleMe },
  { method: 'POST', path: '/api/auth/forgot-password', handler: handleForgotPassword },
  { method: 'POST', path: '/api/auth/reset-password', handler: handleResetPassword },
  { method: 'POST', path: '/api/auth/verify-email', handler: handleVerifyEmail },
  { method: 'GET', path: '/api/admin/_ping', handler: handleAdminPing },
];

export async function handleApi(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const matching = ROUTES.filter((route) => route.path === url.pathname);
    if (matching.length === 0) return json({ error: 'not_found' }, 404);

    const route = matching.find((candidate) => candidate.method === request.method);
    if (!route) {
      const allow = matching.map((candidate) => candidate.method).join(', ');
      return json({ error: 'method_not_allowed' }, 405, { Allow: allow });
    }

    return await route.handler({ request, env, url });
  } catch (err) {
    console.error('[auth] unhandled error', err);
    return json({ error: 'internal_error' }, 500);
  }
}
