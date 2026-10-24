import { test as base, type APIRequestContext, type APIResponse } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// Shared e2e helpers. Selectors in the specs use roles/labels only — never
// CSS internals — so product refactors that keep accessible names stay green.

export interface SeedQuestion {
  id: string;
  label: string;
  required: boolean;
  maxLength: number;
}

export interface SeedEvent {
  id: string;
  title: string;
  capacity: number | null;
  registration_open: boolean;
  questions: SeedQuestion[];
}

interface EventSummaryRow {
  id: string;
  title: string;
  capacity: number | null;
  registration_open: boolean;
}

async function readJson<T>(res: APIResponse): Promise<T> {
  return (await res.json()) as T;
}

/** Full event detail (the list endpoint omits `questions`). */
export async function getEventDetail(
  request: APIRequestContext,
  id: string,
): Promise<SeedEvent | null> {
  const res = await request.get(`/api/events/${encodeURIComponent(id)}`);
  if (!res.ok()) return null;
  const body = await readJson<{ event: SeedEvent }>(res);
  return body.event ?? null;
}

/** Open events with their questions attached; [] when the API is down. */
export async function getOpenEvents(request: APIRequestContext): Promise<SeedEvent[]> {
  const res = await request.get('/api/events');
  if (!res.ok()) return [];
  const body = await readJson<{ events: EventSummaryRow[] }>(res);
  const open = (body.events ?? []).filter((e) => e.registration_open);
  const detailed = await Promise.all(open.map((e) => getEventDetail(request, e.id)));
  return detailed.filter((e): e is SeedEvent => e !== null && e.registration_open);
}

/** Unique address per run so re-runs never hit `email_taken`. Uses the college
 * domain because the server gates registration to `@bl.students.amrita.edu`. */
export function uniqueEmail(prefix: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${stamp}@bl.students.amrita.edu`;
}

/**
 * Register a member through the API and sign them in, so the caller's
 * storage state holds a live session. Registration itself creates no
 * session (verify-pending gate), so this emulates the verify-email click
 * via local D1, then performs a real login — the login and every step after
 * it exercise genuine product paths.
 */
export async function registerViaApi(
  request: APIRequestContext,
  input: { name: string; email: string; mobile: string; password: string },
): Promise<void> {
  const res = await request.post('/api/auth/register', { data: input });
  if (!res.ok()) {
    const text = await res.text().catch(() => '');
    throw new Error(`registerViaApi failed for ${input.email}: ${res.status()} ${text}`);
  }
  await verifyUserEmail(input.email);
  const login = await request.post('/api/auth/login', {
    data: { email: input.email, password: input.password },
  });
  if (!login.ok()) {
    const text = await login.text().catch(() => '');
    throw new Error(`registerViaApi login failed for ${input.email}: ${login.status()} ${text}`);
  }
}

/**
 * Mark a freshly registered address verified, emulating the
 * verify-email link click (email delivery is unavailable in e2e).
 * Local D1 only — never touches staging/prod. Requires cwd = repo root,
 * which is how `npm run test:e2e` and the CI job invoke Playwright.
 */
export async function verifyUserEmail(email: string): Promise<void> {
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    throw new Error(`verifyUserEmail refused suspicious address: ${email}`);
  }
  const repoRoot = path.resolve(process.cwd());
  // The SQL travels via a temp file, not --command: with shell:true Node
  // concatenates args unquoted on Windows, so any spaced value would split
  // (DEP0190). A quoted --file path groups correctly in both cmd and sh.
  const dir = mkdtempSync(path.join(tmpdir(), 'nsdc-e2e-verify-'));
  const sqlFile = path.join(dir, 'verify.sql');
  writeFileSync(sqlFile, `UPDATE users SET email_verified = 1 WHERE email = '${email}';\n`);
  try {
    // Local D1 is a single SQLite file shared with the running dev server:
    // concurrent writers can hit SQLITE_BUSY, so retry transient failures.
    // (Serial workers in playwright.config.ts keep this rare, not impossible.)
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await execFileAsync(
          'npx',
          ['wrangler', 'd1', 'execute', 'nsdc-auth', '--local', '--file', `"${sqlFile}"`, '-c', 'wrangler.staging.jsonc'],
          { cwd: repoRoot, timeout: 90_000, shell: process.platform === 'win32' },
        );
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    if (lastErr) throw lastErr;
  } catch (err) {
    throw new Error(`verifyUserEmail failed for ${email}: ${(err as Error).message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Local D1 mutations (staging DB only)
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function safeEmail(email: string, caller: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    throw new Error(`${caller} refused suspicious address: ${email}`);
  }
  return normalized;
}

/**
 * Run SQL against the local staging D1 (same file the dev server uses).
 * Values interpolated into `sql` are the caller's responsibility; all helpers
 * below validate their inputs first. Serial workers keep contention rare but
 * the dev server writes concurrently, so retry SQLITE_BUSY a few times.
 */
async function executeLocalD1(sql: string, label: string): Promise<void> {
  const repoRoot = path.resolve(process.cwd());
  const dir = mkdtempSync(path.join(tmpdir(), 'nsdc-e2e-d1-'));
  const sqlFile = path.join(dir, 'e2e.sql');
  writeFileSync(sqlFile, sql.endsWith('\n') ? sql : `${sql}\n`);
  try {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await execFileAsync(
          'npx',
          ['wrangler', 'd1', 'execute', 'nsdc-auth', '--local', '--file', `"${sqlFile}"`, '-c', 'wrangler.staging.jsonc'],
          { cwd: repoRoot, timeout: 90_000, shell: process.platform === 'win32' },
        );
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    if (lastErr) throw lastErr;
  } catch (err) {
    throw new Error(`${label} failed: ${(err as Error).message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Promote (or demote) an account for admin e2e flows. Local D1 only. */
export async function setUserRole(
  email: string,
  role: 'member' | 'executive' | 'ob',
): Promise<void> {
  const address = safeEmail(email, 'setUserRole');
  await executeLocalD1(
    `UPDATE users SET role = '${role}', is_executive = ${role === 'ob' ? 1 : 0} WHERE email = '${address}';`,
    `setUserRole(${address})`,
  );
}

/**
 * Register an office bearer through the real auth API: register (member role),
 * verify via local D1 (email delivery is unavailable), promote with a local
 * D1 update, then log in through the API so the request context holds a live
 * `ob` session. `adminCode` is only needed when the target worker sets
 * ADMIN_ENTRY_CODE (the local staging config does not).
 */
export async function registerObViaApi(
  request: APIRequestContext,
  input: { name: string; email: string; mobile: string; password: string; adminCode?: string },
): Promise<void> {
  const res = await request.post('/api/auth/register', {
    data: {
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      password: input.password,
    },
  });
  if (!res.ok()) {
    const text = await res.text().catch(() => '');
    throw new Error(`registerObViaApi failed for ${input.email}: ${res.status()} ${text}`);
  }
  await verifyUserEmail(input.email);
  await setUserRole(input.email, 'ob');
  const login = await request.post('/api/auth/login', {
    data: {
      email: input.email,
      password: input.password,
      ...(input.adminCode ? { admin_code: input.adminCode } : {}),
    },
  });
  if (!login.ok()) {
    const text = await login.text().catch(() => '');
    throw new Error(`registerObViaApi login failed for ${input.email}: ${login.status()} ${text}`);
  }
}

/** Remove an e2e recruitment application and its decision email. */
export async function deleteRecruitmentApplication(email: string): Promise<void> {
  const address = safeEmail(email, 'deleteRecruitmentApplication');
  await executeLocalD1(
    `DELETE FROM recruitment_applications WHERE email = '${address}';
     DELETE FROM email_outbox WHERE to_email = '${address}';`,
    `deleteRecruitmentApplication(${address})`,
  );
}

/** Remove an e2e account plus rows that reference it. */
export async function deleteUserByEmail(email: string): Promise<void> {
  const address = safeEmail(email, 'deleteUserByEmail');
  await executeLocalD1(
    `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = '${address}');
     DELETE FROM email_tokens WHERE user_id IN (SELECT id FROM users WHERE email = '${address}');
     DELETE FROM admin_audit_log WHERE admin_user_id IN (SELECT id FROM users WHERE email = '${address}');
     DELETE FROM email_outbox WHERE to_email = '${address}';
     DELETE FROM users WHERE email = '${address}';`,
    `deleteUserByEmail(${address})`,
  );
}

const NEED_SEED =
  'needs seeded D1 data — apply e2e/seed.sql to the local D1 DB ' +
  '(npx wrangler d1 execute nsdc-auth --local --file=e2e/seed.sql -c wrangler.staging.jsonc)';

async function pickEvent(
  request: APIRequestContext,
  predicate: (e: SeedEvent) => boolean,
): Promise<SeedEvent | null> {
  const events = await getOpenEvents(request);
  return events.find(predicate) ?? null;
}

interface SeedFixtures {
  /** Any open event whose questions have no required entries (guest-safe). */
  plainOpenEvent: SeedEvent;
  /** An open event with at least one required question (member stepped flow). */
  qEvent: SeedEvent;
  /** An open event with capacity exactly 1 (waitlist/promote flow). */
  tinyEvent: SeedEvent;
}

export const test = base.extend<SeedFixtures>({
  plainOpenEvent: async ({ request }, use) => {
    const found = await pickEvent(
      request,
      (e) => !e.questions.some((q) => q.required),
    );
    base.skip(!found, `plainOpenEvent ${NEED_SEED}`);
    await use(found as SeedEvent);
  },
  qEvent: async ({ request }, use) => {
    const found = await pickEvent(request, (e) => e.questions.some((q) => q.required));
    base.skip(!found, `qEvent ${NEED_SEED}`);
    await use(found as SeedEvent);
  },
  tinyEvent: async ({ request }, use) => {
    const found = await pickEvent(request, (e) => e.capacity === 1);
    base.skip(!found, `tinyEvent ${NEED_SEED}`);
    await use(found as SeedEvent);
  },
});

export { expect } from '@playwright/test';
