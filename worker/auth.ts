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
  requireMinRole,
  normalizeRole,
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
import { verificationEmail, passwordResetEmail, verifiedWelcomeEmail } from './email';

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
    .prepare('SELECT id, email, name, mobile, reg_number, role, is_executive, email_verified, created_at FROM users WHERE id = ?')
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

  // Only college addresses may hold accounts.
  if (!email.endsWith('@bl.students.amrita.edu')) return json({ error: 'invalid_email' }, 400);

  const name = typeof body.value.name === 'string' ? body.value.name.trim() : '';
  if (!name || name.length > 120) return json({ error: 'invalid_name' }, 400);

  const mobile = typeof body.value.mobile === 'string' ? body.value.mobile.trim() : '';
  if (!mobile || mobile.length > 32) return json({ error: 'invalid_mobile' }, 400);

  const password = body.value.password;
  if (!isStrongPassword(password)) return json({ error: 'weak_password' }, 400);

  // Office bearer comes from a shared entry code, never from client-claimed
  // role. Everyone else registers as a member; admins can promote later.
  const obCode = typeof body.value.admin_code === 'string' ? body.value.admin_code : '';
  const role: Role =
    obCode && env.ADMIN_ENTRY_CODE && obCode === env.ADMIN_ENTRY_CODE ? 'ob' : 'member';
  // College registration numbers are not collected yet.
  const reg_number: string | null = null;

  const existing = await env.AUTH_DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  if (existing) return json({ error: 'email_taken' }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const isExecutive = role === 'ob' ? 1 : 0;
  try {
    await env.AUTH_DB
      .prepare('INSERT INTO users (id, email, name, mobile, reg_number, password_hash, role, is_executive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, email, name, mobile, reg_number, passwordHash, role, isExecutive)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) return json({ error: 'email_taken' }, 409);
    throw err;
  }

  const user = await loadUserById(env, id);
  if (!user) throw new Error('user_missing_after_insert');

  try {
    const verifyToken = await createEmailToken(env, id, 'verify');
    await trySendEmail(env, { to: email, ...verificationEmail(new URL(request.url).origin, verifyToken) });
  } catch (err) {
    console.error('[auth] verification email setup failed', err);
  }

  return json({ user, verify_pending: true }, 201);
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

  // Non-college addresses can hold no account; fail closed without revealing.
  if (!email.endsWith('@bl.students.amrita.edu')) return json({ error: 'invalid_credentials' }, 401);

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
      'SELECT id, email, name, mobile, reg_number, password_hash, role, is_executive, email_verified, created_at FROM users WHERE email = ?',
    )
    .bind(email)
    .first<UserRow & { password_hash: string }>();

  const password = typeof body.value.password === 'string' ? body.value.password : '';
  const valid = await verifyPassword(password, row ? row.password_hash : DUMMY_PASSWORD_HASH);
  if (!row || !valid) return json({ error: 'invalid_credentials' }, 401);

  if (!row.email_verified) return json({ error: 'email_unverified' }, 403);

  if (normalizeRole(row.role) === 'ob' && env.ADMIN_ENTRY_CODE) {
    const adminCode = typeof body.value.admin_code === 'string' ? body.value.admin_code : '';
    if (adminCode !== env.ADMIN_ENTRY_CODE) {
      return json({ error: 'invalid_admin_code' }, 403);
    }
  }

  const remember = body.value.remember === true;
  const { token, expiresAt } = await createSession(env, row.id, request, remember);
  return json(
    { user: mapUser(row), expires_at: expiresAt },
    200,
    { 'set-cookie': sessionCookie(token, remember) },
  );
}

async function handleResendVerification({ request, env }: RouteContext): Promise<Response> {
  const ip = clientIp(request);
  if (
    !(await rateLimit(
      env,
      `resend-verify:ip:${ip}`,
      RATE_LIMITS.resendVerificationPerIp.limit,
      RATE_LIMITS.resendVerificationPerIp.windowSeconds,
    ))
  ) {
    return json({ error: 'rate_limited' }, 429);
  }

  // Never reveal whether an account exists: every path yields the same 202.
  try {
    const body = await readJsonBody(request);
    if (body.ok) {
      const email = normalizeEmail(body.value.email);
      if (email) {
        const row = await env.AUTH_DB
          .prepare('SELECT id, email_verified FROM users WHERE email = ?')
          .bind(email)
          .first<{ id: string; email_verified: number }>();
        if (row && !row.email_verified) {
          const token = await createEmailToken(env, row.id, 'verify');
          await trySendEmail(env, { to: email, ...verificationEmail(new URL(request.url).origin, token) });
        }
      }
    }
  } catch (err) {
    console.error('[auth] resend-verification side effect failed', err);
  }
  return json({ ok: true }, 202);
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
          await trySendEmail(env, { to: email, ...passwordResetEmail(new URL(request.url).origin, token) });
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
    await trySendEmail(env, { to: user.email, ...verifiedWelcomeEmail() });
  }
  return json({ ok: true });
}

async function handleAdminPing({ request, env }: RouteContext): Promise<Response> {
  const user = await getSessionUser(env, request);
  if (!requireMinRole(user, 'ob')) return json({ error: 'forbidden' }, 403);
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
  { method: 'POST', path: '/api/auth/resend-verification', handler: handleResendVerification },
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
