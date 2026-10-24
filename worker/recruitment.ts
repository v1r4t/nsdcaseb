/// <reference types="@cloudflare/workers-types" />

// Recruitment applications API. Owns:
//   POST /api/recruit                 (public apply)
//   GET  /api/recruit/status          (public status lookup)
//   GET  /api/admin/recruitment       (ob list, optional ?status=)
//   GET  /api/admin/recruitment.csv   (ob CSV export, same filter)
//   PATCH /api/admin/recruitment/:id  (ob decision; one-way)
//
// Wired into the staging dispatcher after projects and before admin so the
// ob-only paths never fall into admin.ts's generic /api/admin 404.
//
// Returns `null` for paths it does not own so the dispatcher can continue.

import {
  clientIp,
  getSessionUser,
  isUniqueViolation,
  json,
  normalizeEmail,
  rateLimit,
  requireMinRole,
  toIso,
  type Env,
  type User,
} from './auth-helpers';
import { enqueueEmail, recruitmentDecisionEmail } from './email';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const COLLEGE_EMAIL_DOMAIN = '@bl.students.amrita.edu';
const REG_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/;

const NAME_MAX = 120;
const BRANCH_MAX = 80;
const ANSWER_MIN = 10;
const ANSWER_MAX = 2000;
const TIME_MAX = 120;
const REMARKS_MAX = 1000;

// Answers can legitimately fill 2 KB twice; match the events body cap rather
// than auth-helpers' 2 KB (tuned for login/register payloads).
const MAX_RECRUIT_BODY_BYTES = 32 * 1024;

const APPLY_RATE = { limit: 10, windowSeconds: 15 * 60 } as const;
const STATUS_RATE = { limit: 20, windowSeconds: 15 * 60 } as const;

const STATUSES = ['pending', 'selected', 'rejected'] as const;
type RecruitmentStatus = (typeof STATUSES)[number];

interface RecruitmentRow {
  id: string;
  name: string;
  email: string;
  reg_number: string;
  phone: string;
  year: string;
  branch: string;
  why_join: string;
  contribute: string;
  time_commitment: string;
  remarks: string;
  status: string;
  created_at: string;
  decided_at: string | null;
}

interface Application {
  id: string;
  name: string;
  email: string;
  reg_number: string;
  phone: string;
  year: string;
  branch: string;
  why_join: string;
  contribute: string;
  time_commitment: string;
  remarks: string;
  status: RecruitmentStatus;
  created_at: string;
  decided_at: string | null;
}

function isStatus(value: string): value is RecruitmentStatus {
  return (STATUSES as readonly string[]).includes(value);
}

function methodNotAllowed(allow: string): Response {
  return json({ error: 'method_not_allowed' }, 405, { Allow: allow });
}

async function parseJson(
  request: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, response: json({ error: 'invalid_json' }, 400) };
  }
  if (buffer.byteLength > MAX_RECRUIT_BODY_BYTES) {
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

/** Trimmed non-empty text within `max` characters, else null. */
function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

/** Digits only, 10–15 of them: tolerates +91, spaces, hyphens, brackets. */
function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.trim().replace(/[\s()+\-.]/g, '');
  if (!/^\d{10,15}$/.test(digits)) return null;
  return digits;
}

function mapApplication(row: RecruitmentRow): Application {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    reg_number: row.reg_number,
    phone: row.phone,
    year: row.year,
    branch: row.branch,
    why_join: row.why_join,
    contribute: row.contribute,
    time_commitment: row.time_commitment,
    remarks: row.remarks ?? '',
    status: isStatus(row.status) ? row.status : 'pending',
    created_at: toIso(row.created_at),
    decided_at: row.decided_at ? toIso(row.decided_at) : null,
  };
}

type AdminGate = { user: User } | { response: Response };

async function adminGate(env: Env, request: Request): Promise<AdminGate> {
  const user = await getSessionUser(env, request);
  if (!user) return { response: json({ error: 'unauthenticated' }, 401) };
  if (!requireMinRole(user, 'ob')) return { response: json({ error: 'forbidden' }, 403) };
  return { user };
}

/** Shared ?status= parsing for the list + CSV routes. */
function statusFilter(url: URL): { where: string; args: unknown[] } | { error: Response } {
  const raw = url.searchParams.get('status');
  if (raw === null || raw === '') return { where: '', args: [] };
  if (!isStatus(raw)) return { error: json({ error: 'invalid_status' }, 400) };
  return { where: 'WHERE status = ?', args: [raw] };
}

const SELECT_COLUMNS =
  'id, name, email, reg_number, phone, year, branch, why_join, contribute, ' +
  'time_commitment, remarks, status, created_at, decided_at';

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function auditDecision(
  env: Env,
  admin: User,
  id: string,
  status: string,
  email: string | null,
): Promise<void> {
  try {
    await env.AUTH_DB.prepare(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, detail) VALUES (?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        admin.id,
        'recruitment_decision',
        JSON.stringify({ id, status, email }),
      )
      .run();
  } catch (err) {
    console.error('[recruitment] audit log write failed', err);
  }
}

export async function handleRecruitmentApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  // ------------------------------------------------------------ public apply
  if (path === '/api/recruit') {
    if (method !== 'POST') return methodNotAllowed('POST');

    const ip = clientIp(request);
    if (!(await rateLimit(env, `recruit:apply:ip:${ip}`, APPLY_RATE.limit, APPLY_RATE.windowSeconds))) {
      return json({ error: 'rate_limited' }, 429);
    }

    const setting = await env.AUTH_DB.prepare(
      `SELECT value FROM site_settings WHERE key = 'recruitment_open'`,
    )
      .first<{ value: string }>();
    if (setting?.value !== '1') return json({ error: 'recruitment_closed' }, 403);

    const body = await parseJson(request);
    if (!body.ok) return body.response;
    const v = body.value;

    const name = boundedText(v.name, NAME_MAX);
    if (!name) return json({ error: 'invalid_name' }, 400);

    const email = normalizeEmail(v.email);
    if (!email || !email.endsWith(COLLEGE_EMAIL_DOMAIN)) {
      return json({ error: 'invalid_email' }, 400);
    }

    const regNumber =
      typeof v.reg_number === 'string' ? v.reg_number.trim() : '';
    if (!REG_NUMBER_RE.test(regNumber)) return json({ error: 'invalid_reg_number' }, 400);

    const phone = normalizePhone(v.phone);
    if (!phone) return json({ error: 'invalid_phone' }, 400);

    if (v.year !== '1' && v.year !== '2' && v.year !== '3') {
      return json({ error: 'invalid_year' }, 400);
    }
    const year = v.year;

    const branch = boundedText(v.branch, BRANCH_MAX);
    if (!branch) return json({ error: 'invalid_branch' }, 400);

    const whyJoin = boundedText(v.why_join, ANSWER_MAX);
    if (!whyJoin || whyJoin.length < ANSWER_MIN) {
      return json({ error: 'invalid_why_join' }, 400);
    }

    const contribute = boundedText(v.contribute, ANSWER_MAX);
    if (!contribute || contribute.length < ANSWER_MIN) {
      return json({ error: 'invalid_contribute' }, 400);
    }

    const timeCommitment = boundedText(v.time_commitment, TIME_MAX);
    if (!timeCommitment) return json({ error: 'invalid_time' }, 400);

    let remarks = '';
    if (v.remarks !== undefined && v.remarks !== null) {
      if (typeof v.remarks !== 'string') return json({ error: 'invalid_remarks' }, 400);
      remarks = v.remarks.trim();
      if (remarks.length > REMARKS_MAX) return json({ error: 'invalid_remarks' }, 400);
    }

    const existing = await env.AUTH_DB.prepare(
      `SELECT id FROM recruitment_applications WHERE email = ?`,
    )
      .bind(email)
      .first<{ id: string }>();
    if (existing) return json({ error: 'already_applied' }, 409);

    const id = crypto.randomUUID();
    try {
      await env.AUTH_DB.prepare(
        `INSERT INTO recruitment_applications
           (id, name, email, reg_number, phone, year, branch, why_join, contribute,
            time_commitment, remarks, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      )
        .bind(id, name, email, regNumber, phone, year, branch, whyJoin, contribute, timeCommitment, remarks)
        .run();
    } catch (err) {
      // Two requests can pass the pre-check together; the unique index wins.
      if (isUniqueViolation(err)) return json({ error: 'already_applied' }, 409);
      throw err;
    }
    return json({ id, status: 'pending' }, 201);
  }

  // ------------------------------------------------------- public status lookup
  if (path === '/api/recruit/status') {
    if (method !== 'GET') return methodNotAllowed('GET');

    const ip = clientIp(request);
    if (!(await rateLimit(env, `recruit:status:ip:${ip}`, STATUS_RATE.limit, STATUS_RATE.windowSeconds))) {
      return json({ error: 'rate_limited' }, 429);
    }

    // Every malformed/missing/mismatched input yields the same 404 so the
    // endpoint cannot be used to probe which field was wrong.
    const email = normalizeEmail(url.searchParams.get('email'));
    const regNumber = (url.searchParams.get('reg_number') ?? '').trim();
    if (!email || !regNumber) return json({ error: 'not_found' }, 404);

    const row = await env.AUTH_DB.prepare(
      `SELECT status, created_at, decided_at FROM recruitment_applications
       WHERE email = ? AND lower(reg_number) = lower(?)`,
    )
      .bind(email, regNumber)
      .first<{ status: string; created_at: string; decided_at: string | null }>();
    if (!row) return json({ error: 'not_found' }, 404);

    return json({
      application: {
        status: isStatus(row.status) ? row.status : 'pending',
        created_at: toIso(row.created_at),
        decided_at: row.decided_at ? toIso(row.decided_at) : null,
      },
    });
  }

  // ------------------------------------------------------------ admin CSV
  if (path === '/api/admin/recruitment.csv') {
    if (method !== 'GET') return methodNotAllowed('GET');
    const gate = await adminGate(env, request);
    if ('response' in gate) return gate.response;

    const filter = statusFilter(url);
    if ('error' in filter) return filter.error;

    const rows =
      (
        await env.AUTH_DB.prepare(
          `SELECT ${SELECT_COLUMNS} FROM recruitment_applications ${filter.where}
           ORDER BY created_at DESC, rowid DESC`,
        )
          .bind(...filter.args)
          .all<RecruitmentRow>()
      ).results ?? [];

    const header = [
      'id', 'name', 'email', 'reg_number', 'phone', 'year', 'branch',
      'why_join', 'contribute', 'time_commitment', 'remarks', 'status',
      'created_at', 'decided_at',
    ];
    const lines = [header.join(',')];
    for (const row of rows) {
      const app = mapApplication(row);
      lines.push(header.map((key) => csvCell(app[key as keyof Application])).join(','));
    }

    return new Response(lines.join('\r\n'), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="recruitment.csv"',
        'cache-control': 'no-store',
      },
    });
  }

  // ---------------------------------------------------------- admin list
  if (path === '/api/admin/recruitment') {
    if (method !== 'GET') return methodNotAllowed('GET');
    const gate = await adminGate(env, request);
    if ('response' in gate) return gate.response;

    const filter = statusFilter(url);
    if ('error' in filter) return filter.error;

    const rows =
      (
        await env.AUTH_DB.prepare(
          `SELECT ${SELECT_COLUMNS} FROM recruitment_applications ${filter.where}
           ORDER BY created_at DESC, rowid DESC`,
        )
          .bind(...filter.args)
          .all<RecruitmentRow>()
      ).results ?? [];

    return json({ applications: rows.map(mapApplication) });
  }

  // ------------------------------------------------------- admin decision
  const decisionMatch = /^\/api\/admin\/recruitment\/([^/]+)$/.exec(path);
  if (decisionMatch) {
    if (method !== 'PATCH') return methodNotAllowed('PATCH');
    const gate = await adminGate(env, request);
    if ('response' in gate) return gate.response;

    let id = decisionMatch[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      return json({ error: 'not_found' }, 404);
    }
    if (!ID_RE.test(id)) return json({ error: 'not_found' }, 404);

    const body = await parseJson(request);
    if (!body.ok) return body.response;
    const next = body.value.status;
    if (next !== 'selected' && next !== 'rejected') {
      return json({ error: 'invalid_status' }, 400);
    }
    const status: Exclude<RecruitmentStatus, 'pending'> = next;

    // Guard the transition in SQL: only a pending row can be decided, so two
    // concurrent PATCHes cannot both email the applicant.
    const updated = await env.AUTH_DB.prepare(
      `UPDATE recruitment_applications
       SET status = ?, decided_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
      .bind(status, id)
      .run();

    if (!updated.meta.changes) {
      const existing = await env.AUTH_DB.prepare(
        `SELECT status FROM recruitment_applications WHERE id = ?`,
      )
        .bind(id)
        .first<{ status: string }>();
      if (!existing) return json({ error: 'not_found' }, 404);
      return json({ error: 'already_decided' }, 409);
    }

    const applicant = await env.AUTH_DB.prepare(
      `SELECT name, email FROM recruitment_applications WHERE id = ?`,
    )
      .bind(id)
      .first<{ name: string; email: string }>();

    await auditDecision(env, gate.user, id, status, applicant?.email ?? null);

    // Mail is best-effort: a queue/DB hiccup must never undo the decision.
    if (applicant?.email) {
      try {
        const template = recruitmentDecisionEmail(status, applicant.name);
        await enqueueEmail(env, applicant.email, template.subject, template.text);
      } catch (err) {
        console.error('[recruitment] verdict email enqueue failed', id, err);
      }
    }

    return json({ ok: true, status });
  }

  return null;
}
