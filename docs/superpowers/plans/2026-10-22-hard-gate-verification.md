# Hard-Gate Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce email verification before any site use: no session at register, `403` at login until verified, plus the missing verify/reset pages and HTML auth mails.

**Architecture:** Worker owns enforcement (session issuance + a session-validity guard), site owns the new pages and redirects, email builders stay pure functions in `worker/email.ts` consumed by `auth.ts`. Task 1 defines the API contract; Tasks 2 and 3 run in parallel after it.

**Tech Stack:** Cloudflare Workers + D1 (worker), React 19 + react-router-dom + Vite (site), Resend via existing `sendEmail` seam.

**Spec:** `docs/superpowers/specs/2026-10-22-hard-gate-verification-design.md`

## Global Constraints

- Auth responses never depend on mail delivery: all sends go through `trySendEmail` in `worker/auth.ts:53` (best-effort, failures logged not thrown).
- Never reveal account existence: `resend-verification` and `forgot-password` always answer `202` with the same body.
- `email_verified` reads: `users.email_verified` is `0`/`1` integer in D1, boolean on `User`.
- Resend `From` stays `MAIL_FROM` var (`NSDC <noreply@mail.nsdcaseb.xyz>`); `RESEND_API_KEY` stays a secret, never in code.
- Correction to spec §2: forgot-password request UI already exists inline in `site/src/pages/Login.tsx` (`mode='forgot'`), so only the `/reset-password` token page is new.

## Review Focus

- Login with wrong password on an unverified account must answer `invalid_credentials` (401), not `email_unverified` — credential check runs first; pinned in Task 1.
- A verify token is single-use: second `POST /api/auth/verify-email` with the same token answers `400 invalid_token`; pinned in Task 1.
- Resend requested for an already-verified address sends nothing and still answers `202`; pinned in Task 1.
- Register with a taken email still answers `409 email_taken` with no mail sent; pinned in Task 1.
- `/verify-email` opened with no `?token=` makes no request and shows the resend path; pinned in Task 2.

---

### Task 1: Worker hard gate

**Files:**
- Modify: `worker/auth.ts` (`handleRegister`, `handleLogin`, new `handleResendVerification`, `ROUTES`)
- Modify: `worker/auth-helpers.ts` (`RATE_LIMITS`, `getSessionUser`)
- Test: typecheck + staging curl pass (no worker unit framework exists in this repo)

**Interfaces:**
- Consumes: `sendEmail`/`EmailMessage` from `./mailer`, `createEmailToken`/`consumeEmailToken` (existing), `verificationEmail` builders from Task 3 (same `{subject,text,html}` shape spread into `EmailMessage`; until Task 3 lands, call sites keep sending text-only — do not block on it).
- Produces (contract Task 2 builds against):
  - `POST /api/auth/register` → `201 { user, verify_pending: true }`, no `set-cookie`
  - `POST /api/auth/login` → `403 { error: 'email_unverified' }` when unverified, no session
  - `POST /api/auth/resend-verification` `{email}` → always `202 { ok: true }`
  - `POST /api/auth/verify-email` / `POST /api/auth/reset-password` unchanged

- [ ] **Step 1: Add the rate-limit bucket in `worker/auth-helpers.ts`**

```ts
export const RATE_LIMITS = {
  registerPerIp: { limit: 5, windowSeconds: 60 * 60 },
  loginPerIp: { limit: 10, windowSeconds: 60 * 15 },
  loginPerEmail: { limit: 5, windowSeconds: 60 * 15 },
  resendVerificationPerIp: { limit: 5, windowSeconds: 60 * 60 },
} as const;
```

- [ ] **Step 2: Guard `getSessionUser` against unverified users**

In `worker/auth-helpers.ts`, after the expiry check inside `getSessionUser` (before `return mapUser(row)`), insert:

```ts
if (!row.email_verified) {
  await env.AUTH_DB
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .run()
    .catch(() => {});
  return null;
}
```

`row.email_verified` is already selected by that query (`worker/auth-helpers.ts:276`) — no SELECT change needed.

- [ ] **Step 3: Register issues no session in `worker/auth.ts`**

Replace (current lines ~139-140):

```ts
const { token } = await createSession(env, id, request, false);
return json({ user }, 201, { 'set-cookie': sessionCookie(token, false) });
```

with:

```ts
return json({ user, verify_pending: true }, 201);
```

Leave token creation + verify mail in place. `createSession`/`sessionCookie` imports stay (login still uses them).

- [ ] **Step 4: Login rejects unverified accounts in `worker/auth.ts`**

In `handleLogin`, after the password check (`if (!row || !valid) ...`) and before the `admin_code` block, insert:

```ts
if (!row.email_verified) return json({ error: 'email_unverified' }, 403);
```

Order matters: wrong password on an unverified account must still answer `invalid_credentials`, never `email_unverified`.

- [ ] **Step 5: Add `handleResendVerification` + route in `worker/auth.ts`**

```ts
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
          await trySendEmail(env, {
            to: email,
            subject: 'Verify your NSDC account',
            text: `Verify your email: ${new URL(request.url).origin}/verify-email?token=${token}`,
          });
        }
      }
    }
  } catch (err) {
    console.error('[auth] resend-verification side effect failed', err);
  }
  return json({ ok: true }, 202);
}
```

Add to `ROUTES`:

```ts
{ method: 'POST', path: '/api/auth/resend-verification', handler: handleResendVerification },
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p worker/tsconfig.json`
Expected: clean, no output.

- [ ] **Step 7: Verify against staging**

One-time cleanup first (kills sessions minted before the gate — staging is
currently empty after the test wipe, so expect zero changes):

```bash
npx wrangler d1 execute nsdc-auth --remote -c wrangler.staging.jsonc --command "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email_verified = 0);"
```

Deploy staging (`npm run build:site` then `npx wrangler deploy -c wrangler.staging.jsonc`), then:
  - Register a fresh address → `201`, response contains `verify_pending: true`, no `set-cookie` header.
  - Login with it → `403 { error: 'email_unverified' }`.
  - Login with wrong password on it → `401 { error: 'invalid_credentials' }`.
  - `POST /api/auth/resend-verification` for verified, unverified, and nonexistent addresses → `202 { ok: true }` all three; mail only arrives for the unverified one.
  - Consume a verify token twice → first `200`, second `400 { error: 'invalid_token' }`.

- [ ] **Step 8: Commit**

```bash
git add worker/auth.ts worker/auth-helpers.ts
git commit -m "feat: hard-gate auth on email verification"
```

---

### Task 2: Site verify/reset pages + redirects

**Files:**
- Modify: `site/src/lib/api.ts` (new client functions + `RegisterResponse`)
- Modify: `site/src/lib/auth.tsx` (`register` no longer sets a session user)
- Modify: `site/src/pages/Register.tsx` (navigate to verify-pending)
- Modify: `site/src/pages/Login.tsx` (`email_unverified` → verify-pending)
- Modify: `site/src/App.tsx` (three new routes)
- Create: `site/src/pages/VerifyPending.tsx`, `site/src/pages/VerifyEmail.tsx`, `site/src/pages/ResetPassword.tsx`
- Test: `npm test` (42 tests) + `npm run build` (typecheck + bundle)

**Interfaces:**
- Consumes: Task 1 contract (`201 {user, verify_pending}`, `403 email_unverified`, resend/verify/reset endpoints). If Task 1 is not yet deployed, develop against its documented status codes.
- Produces: routes `/verify-pending`, `/verify-email`, `/reset-password`.

- [ ] **Step 1: Extend `site/src/lib/api.ts`**

```ts
export interface RegisterResponse {
  user: User;
  verify_pending: true;
}

export interface VerifyEmailResponse {
  ok: true;
}

export function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return request<VerifyEmailResponse>('/api/auth/verify-email', { method: 'POST', body: { token } });
}

export function resetPassword(token: string, password: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: { token, password } });
}

export function resendVerification(email: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/auth/resend-verification', { method: 'POST', body: { email } });
}
```

- [ ] **Step 2: Stop `register()` from setting a session user in `site/src/lib/auth.tsx`**

Change the interface and implementation:

```ts
register: (input: { name: string; email: string; mobile: string; password: string }) => Promise<RegisterResponse>;
```

```ts
import type { RegisterResponse } from './api';

const register = useCallback(async (input: { name: string; email: string; mobile: string; password: string }) => {
  const response = await apiRegister(input);
  // No session exists until the email is verified — deliberately not setUser.
  return response;
}, []);
```

- [ ] **Step 3: Route Register to verify-pending in `site/src/pages/Register.tsx`**

Add `useNavigate` to the `react-router-dom` import, call `const navigate = useNavigate();`, and replace the `await register(...)` line plus its comment with:

```ts
await register({ name: name.trim(), email: email.trim(), mobile: mobile.trim(), password });
navigate('/verify-pending', { state: { email: email.trim() }, replace: true });
```

- [ ] **Step 4: Redirect unverified logins in `site/src/pages/Login.tsx`**

In `signInMessage`, add:

```ts
case 'email_unverified':
  return 'Verify your email first — check your inbox for the link.';
```

In `handleSignIn`'s catch, before `setError`:

```ts
if (err instanceof ApiError && err.error === 'email_unverified') {
  navigate('/verify-pending', { state: { email }, replace: true });
  return;
}
```

(`navigate` is already imported and in scope.)

- [ ] **Step 5: Create `site/src/pages/VerifyPending.tsx`**

```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, resendVerification } from '../lib/api';

function presetEmail(state: unknown): string {
  if (state && typeof state === 'object') {
    const email = (state as { email?: unknown }).email;
    if (typeof email === 'string') return email;
  }
  return '';
}

export default function VerifyPending() {
  const location = useLocation();
  const [email, setEmail] = useState(() => presetEmail(location.state));
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await resendVerification(email.trim());
      // Neutral: the endpoint never reveals whether the address exists.
      setNotice("If that email is registered and unverified, we've re-sent the link.");
    } catch (err) {
      setError(err instanceof ApiError ? 'Could not reach the server. Check your connection and try again.' : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="shell py-12 md:py-16">
      <div className="rule max-w-md pt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a verification link to your email. Open it within an hour to activate your account,
          then sign in.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleResend} aria-busy={pending}>
          <div>
            <label htmlFor="pending-email" className="label">Email</label>
            <input id="pending-email" name="email" type="email" autoComplete="email" required disabled={pending}
              value={email} onChange={(event) => setEmail(event.target.value)} className="field" placeholder="you@amrita.edu" />
          </div>
          {error && (<p role="alert" aria-live="assertive" className="error-text"><span aria-hidden="true">! </span>{error}</p>)}
          {notice && (<p role="status" aria-live="polite" className="hint">{notice}</p>)}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? 'Sending...' : 'Re-send verification link'}
          </button>
        </form>
        <p className="pt-4 text-sm text-muted">
          Verified already?{' '}<Link to="/login" className="link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `site/src/pages/VerifyEmail.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../lib/api';

type Status = 'missing' | 'verifying' | 'done' | 'invalid';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'missing');

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyEmail(token)
      .then(() => { if (active) setStatus('done'); })
      .catch(() => { if (active) setStatus('invalid'); });
    return () => { active = false; };
  }, [token]);

  return (
    <div className="shell py-12 md:py-16">
      <div className="rule max-w-md pt-8">
        {status === 'verifying' && (
          <p role="status" aria-live="polite" className="font-mono text-[11px] uppercase tracking-wide text-muted">
            Verifying your email...
          </p>
        )}
        {status === 'done' && (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Email verified</h1>
            <p className="mt-2 text-sm text-muted">Your account is active. Sign in to continue.</p>
            <p className="pt-4 text-sm"><Link to="/login" className="link">Sign in</Link></p>
          </>
        )}
        {(status === 'invalid' || status === 'missing') && (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Link invalid or expired</h1>
            <p className="mt-2 text-sm text-muted">
              Verification links work once and expire after an hour. Request a fresh one below.
            </p>
            <p className="pt-4 text-sm"><Link to="/verify-pending" className="link">Re-send verification link</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
```

No `?token=` makes no request (`missing` renders immediately) — the Review Focus case.

- [ ] **Step 7: Create `site/src/pages/ResetPassword.tsx`**

```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, resetPassword } from '../lib/api';

function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter.';
  if (!/[0-9]/.test(password)) return 'Include at least one number.';
  return null;
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) { setError(problem); return; }
    if (confirm !== password) { setError('Passwords do not match.'); return; }
    setError(null);
    setPending(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError && err.error === 'invalid_token'
        ? 'This reset link is invalid or expired. Request a fresh one from the sign-in page.'
        : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="shell py-12 md:py-16">
        <div className="rule max-w-md pt-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Reset link missing</h1>
          <p className="mt-2 text-sm text-muted">Open the link from your reset email to set a new password.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell py-12 md:py-16">
      <div className="rule max-w-md pt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-paper">Set a new password</h1>
        {done ? (
          <p className="mt-2 text-sm text-muted">Done — sign in with your new password.{' '}
            <Link to="/login" className="link">Sign in</Link></p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit} aria-busy={pending}>
            <div>
              <label htmlFor="reset-password" className="label">New password</label>
              <input id="reset-password" name="password" type="password" autoComplete="new-password" required
                disabled={pending} value={password} onChange={(event) => setPassword(event.target.value)} className="field" />
              <p className="hint">At least 10 characters, including a letter and a number.</p>
            </div>
            <div>
              <label htmlFor="reset-confirm" className="label">Confirm password</label>
              <input id="reset-confirm" name="confirm" type="password" autoComplete="new-password" required
                disabled={pending} value={confirm} onChange={(event) => setConfirm(event.target.value)} className="field" />
            </div>
            {error && (<p role="alert" aria-live="assertive" className="error-text"><span aria-hidden="true">! </span>{error}</p>)}
            <button type="submit" disabled={pending} className="btn-primary w-full">
              {pending ? 'Saving...' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Register routes in `site/src/App.tsx`**

Add imports and routes:

```tsx
import VerifyPending from './pages/VerifyPending';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';
```

```tsx
<Route path="/verify-pending" element={<VerifyPending />} />
<Route path="/verify-email" element={<VerifyEmail />} />
<Route path="/reset-password" element={<ResetPassword />} />
```

- [ ] **Step 9: Run tests + build**

Run: `npm test`
Expected: 3 files, 42 tests, all pass.

Run: `npm run build:site` (or `npm run build` for the teaser + `tsc -p site` equivalent the repo uses)
Expected: typecheck clean, bundle succeeds.

- [ ] **Step 10: Commit**

```bash
git add site/src/lib/api.ts site/src/lib/auth.tsx site/src/pages/Register.tsx site/src/pages/Login.tsx site/src/App.tsx site/src/pages/VerifyPending.tsx site/src/pages/VerifyEmail.tsx site/src/pages/ResetPassword.tsx
git commit -m "feat: verify-pending, verify-email and reset-password pages"
```

---

### Task 3: HTML auth-mail templates

**Files:**
- Modify: `worker/email.ts` (builders returning `{ subject, text, html }`)
- Modify: `worker/auth.ts` (three `trySendEmail` call sites spread the builders)
- Test: typecheck + staging Resend Logs show HTML+text parts

**Interfaces:**
- Consumes: `EmailMessage` (`{to, subject, text, html?}`) from `./mailer` — `html` already forwarded, no mailer change.
- Produces: `verificationEmail(origin, token)`, `passwordResetEmail(origin, token)`, `verifiedWelcomeEmail()` in `worker/email.ts`, each returning `{ subject, text, html }`. Task 1's resend handler adopts `verificationEmail` too.

- [ ] **Step 1: Add builders to `worker/email.ts`**

```ts
/** Shared content shape for auth mails: text mirror always sent with html. */
export interface TemplatedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Single-column dark card; every mail passes action URL + fallback text. */
function mailShell(title: string, intro: string, actionLabel: string | null, actionUrl: string | null, outro: string): string {
  const button =
    actionLabel && actionUrl
      ? `<p style="margin:24px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 24px;background:#e8ff47;color:#111;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(actionLabel)}</a></p>`
      : '';
  const fallback =
    actionUrl
      ? `<p style="font-size:12px;color:#888;word-break:break-all">Button not working? Paste this link:<br>${escapeHtml(actionUrl)}</p>`
      : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0b0b0c;font-family:system-ui,sans-serif;color:#f2f2f0"><div style="max-width:480px;margin:0 auto;background:#151517;border:1px solid #2a2a2e;border-radius:12px;padding:32px"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1><p style="font-size:14px;line-height:1.6;color:#c9c9c6">${escapeHtml(intro)}</p>${button}<p style="font-size:14px;line-height:1.6;color:#c9c9c6">${escapeHtml(outro)}</p>${fallback}</div></body></html>`;
}

export function verificationEmail(origin: string, token: string): TemplatedEmail {
  const url = `${origin}/verify-email?token=${token}`;
  return {
    subject: 'Verify your NSDC account',
    text: `Verify your email: ${url}\n\nThis link works once and expires after an hour.`,
    html: mailShell('Verify your email', 'Confirm this address to activate your NSDC account.', 'Verify email', url, 'This link works once and expires after an hour.'),
  };
}

export function passwordResetEmail(origin: string, token: string): TemplatedEmail {
  const url = `${origin}/reset-password?token=${token}`;
  return {
    subject: 'Reset your NSDC password',
    text: `Reset your password: ${url}\n\nThis link works once and expires after an hour. If you did not ask for this, ignore this mail.`,
    html: mailShell('Reset your password', 'Someone asked to reset the password for this address.', 'Set a new password', url, 'This link works once and expires after an hour. If that was not you, ignore this mail.'),
  };
}

export function verifiedWelcomeEmail(): TemplatedEmail {
  return {
    subject: 'Your NSDC email is verified',
    text: 'Your email address has been verified. Welcome to NSDC! Sign in to register for events.',
    html: mailShell('You are verified', 'Your email address has been verified.', null, null, 'Welcome to NSDC — sign in to register for events.'),
  };
}
```

Keep the existing text-only builders (`registrationConfirmation`, `eventReminder`) untouched.

- [ ] **Step 2: Switch the three auth send sites in `worker/auth.ts`**

Register handler — replace:

```ts
await trySendEmail(env, {
  to: email,
  subject: 'Verify your NSDC account',
  text: `Verify your email: ${new URL(request.url).origin}/verify-email?token=${verifyToken}`,
});
```

with:

```ts
await trySendEmail(env, { to: email, ...verificationEmail(new URL(request.url).origin, verifyToken) });
```

Forgot-password handler — replace its `trySendEmail` object with:

```ts
await trySendEmail(env, { to: email, ...passwordResetEmail(new URL(request.url).origin, token) });
```

Verify-email handler — replace its confirmation `trySendEmail` object with:

```ts
await trySendEmail(env, { to: user.email, ...verifiedWelcomeEmail() });
```

Apply the same `verificationEmail(...)` replacement in `handleResendVerification` from Task 1. Import the three builders from `./email` at the top of `worker/auth.ts`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p worker/tsconfig.json`
Expected: clean, no output.

- [ ] **Step 4: Verify delivery**

Deploy staging, trigger register + forgot-password for a test address, confirm in Resend Logs that each message carries both html and text parts and renders the dark card.

- [ ] **Step 5: Commit**

```bash
git add worker/email.ts worker/auth.ts
git commit -m "feat: HTML templates for auth mails"
```
