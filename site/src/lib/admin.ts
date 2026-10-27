/**
 * Typed client for the Phase 5 admin + content-mutation API.
 *
 * Same-origin relative paths with `credentials: 'include'`, mirroring the
 * ApiError pattern from ./api and ./events.
 */

import type { PosterVariantBlobs } from './image-variants';

export class ApiError extends Error {
  readonly status: number;
  /** Machine code from the `{ error }` envelope, or a client-side fallback. */
  readonly error: string;

  constructor(status: number, error: string) {
    super(error);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function errorCode(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const code = (payload as { error?: unknown }).error;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  if (status === 401) return 'unauthenticated';
  if (status === 429) return 'rate_limited';
  return 'request_failed';
}

async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network_error');
  } finally {
    clearTimeout(timer);
  }
  const raw = await response.text().catch(() => '');
  let payload: unknown = null;
  try {
    payload = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new ApiError(response.status, errorCode(payload, response.status));
  return payload as T;
}

export interface AdminStats {
  users_total: number;
  users_by_role: { member: number; executive: number; ob: number };
  events_total: number;
  registrations_total: number;
  registrations_by_status: { registered: number; waitlisted: number; cancelled: number };
  outbox: { pending: number; sent: number; failed: number };
}

export interface OutboxEntry {
  id: string;
  to_email: string;
  subject: string;
  /** What kind of mail this row carries (defaults to 'other' on old rows). */
  kind: OutboxKind;
  status: string;
  attempts: number;
  created_at: string;
  sent_at: string | null;
  /** First 500 chars of the queued body (may be absent on old workers). */
  preview?: string | null;
}

export interface RosterEntry {
  id: string;
  /** Null for guest registrations (no account row to join). */
  email: string | null;
  status: string;
  user_type?: string | null;
  student_name?: string | null;
  reg_number?: string | null;
  answers: Record<string, string>;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  mobile: string;
  reg_number: string | null;
  role: 'member' | 'executive' | 'ob';
  is_executive: boolean;
  email_verified: boolean;
  created_at: string;
  /** How many registration rows (any status) the account owns. */
  registrations_count: number;
}

export interface AuditEntry {
  action: string;
  detail: string;
  admin_email: string;
  created_at: string;
}

export type OutboxStatus = 'pending' | 'sent' | 'failed';

/** Mirrors `EmailKind` in worker/email.ts. */
export type OutboxKind =
  | 'verification'
  | 'password_reset'
  | 'waitlist'
  | 'recruitment_decision'
  | 'broadcast'
  | 'test'
  | 'registration_confirmation'
  | 'event_reminder'
  | 'other';

export function getStats(): Promise<AdminStats> {
  return request<AdminStats>('/api/admin/stats');
}

/** List outbox rows, optionally narrowed to one mail kind. */
export function getOutbox(
  status: OutboxStatus = 'pending',
  kind?: OutboxKind,
): Promise<{ outbox: OutboxEntry[] }> {
  const params = new URLSearchParams({ status });
  if (kind) params.set('kind', kind);
  return request<{ outbox: OutboxEntry[] }>(`/api/admin/outbox?${params.toString()}`);
}

export function sendBroadcast(input: {
  audience: 'all' | 'event';
  event_id?: string;
  subject: string;
  /** Rich editor output; the worker sanitises it again before sending. */
  body_html?: string;
  /** Plain-text mirror. Falls back to `body` on older clients. */
  body_text?: string;
  /** Legacy plain-text field; still accepted and converted to paragraphs. */
  body?: string;
  image_url?: string | null;
  image_alt?: string | null;
}): Promise<{ queued: number }> {
  return request<{ queued: number }>('/api/admin/broadcast', 'POST', input);
}

/**
 * Upload the optional broadcast image to the worker, which stores it in the
 * public `email-assets` bucket and returns the only URL it will accept back.
 */
export async function uploadBroadcastImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('image', file);
  let response: Response;
  const controller = new AbortController();
  // Image bytes can be several MB; give the upload longer than a JSON call.
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    response = await fetch('/api/admin/email/image', {
      method: 'POST',
      credentials: 'include',
      body: form,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network_error');
  } finally {
    clearTimeout(timer);
  }
  const raw = await response.text().catch(() => '');
  let payload: unknown = null;
  try {
    payload = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new ApiError(response.status, errorCode(payload, response.status));
  const url = payload && typeof payload === 'object' ? (payload as { url?: unknown }).url : undefined;
  // Never let a malformed envelope silently queue a text-only broadcast.
  if (typeof url !== 'string' || url.length === 0) throw new ApiError(0, 'invalid_response');
  return { url };
}

export function getAuditLog(): Promise<{ entries: AuditEntry[] }> {
  return request<{ entries: AuditEntry[] }>('/api/admin/audit-log');
}

export interface EmailTestResult {
  ok: true;
  delivered: boolean;
  /**
   * Provider detail: the Resend message id on success, or one of
   * `sent`, `not-configured`, `resend:<status>`, `send-failed`.
   */
  detail: string;
}

export type EmailTestTone = 'delivered' | 'not-configured' | 'error';

export interface EmailTestCopy {
  tone: EmailTestTone;
  text: string;
}

/**
 * Send one message to the signed-in admin (or an explicit `to`). The worker
 * answers 200 even when delivery is impossible, so the result is always
 * renderable; only invalid input / auth failures throw ApiError.
 */
export function sendTestEmail(to?: string): Promise<EmailTestResult> {
  return request<EmailTestResult>('/api/admin/email/test', 'POST', to ? { to } : {});
}

/** Pure mapping from the worker envelope to the copy shown in the Email tab. */
export function describeEmailTest(result: EmailTestResult): EmailTestCopy {
  if (result.delivered) {
    return {
      tone: 'delivered',
      text:
        result.detail && result.detail !== 'sent'
          ? `Sent (id ${result.detail}). Check the inbox.`
          : 'Sent. Check the inbox.',
    };
  }
  if (result.detail === 'not-configured') {
    return {
      tone: 'not-configured',
      text: 'Not configured — set RESEND_API_KEY on the worker.',
    };
  }
  const provider = /^resend:(\d{3})$/.exec(result.detail);
  if (provider) {
    return {
      tone: 'error',
      text:
        `Provider rejected the message (HTTP ${provider[1]}). ` +
        'Usually the sender domain or MAIL_FROM is not verified in Resend.',
    };
  }
  if (result.detail === 'send-failed') {
    return {
      tone: 'error',
      text: 'Could not reach the email provider. Try again and check the worker logs.',
    };
  }
  return {
    tone: 'error',
    text: `Not delivered (${result.detail || 'unknown error'}).`,
  };
}

/** Requeue a failed (or stuck) outbox entry: resets status + attempts. */
export function retryOutbox(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/admin/outbox/${encodeURIComponent(id)}/retry`, 'POST', {});
}

/** Event shape for the admin console, including the soft-archive flags. */
export interface AdminEventSummary {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  reg_opens_at: string;
  reg_closes_at: string;
  capacity: number | null;
  spots_left: number | null;
  registration_open: boolean;
  archived: boolean;
  archived_at: string | null;
  poster_url: string | null;
  poster_variants?: { thumb: string; full: string } | null;
}

/** Admin event list. Pass true to include soft-archived events. */
export function listAdminEvents(includeArchived = false): Promise<{ events: AdminEventSummary[] }> {
  return request<{ events: AdminEventSummary[] }>(
    `/api/events${includeArchived ? '?include_archived=1' : ''}`,
  );
}

export function getEventRoster(eventId: string): Promise<{ registrations: RosterEntry[] }> {
  return request<{ registrations: RosterEntry[] }>(
    `/api/events/${encodeURIComponent(eventId)}/registrations`,
  );
}

/**
 * Cancel someone's registration from the admin console. A confirmed seat
 * promotes the oldest waitlisted person; their email comes back when known.
 */
export function cancelAdminRegistration(
  id: string,
): Promise<{ cancelled: true; promoted_email: string | null }> {
  return request<{ cancelled: true; promoted_email: string | null }>(
    `/api/admin/registrations/${encodeURIComponent(id)}/cancel`,
    'POST',
    {},
  );
}

/** Admin-only event edit: fields supported by the worker PATCH endpoint. */
export function adminUpdateEvent(
  eventId: string,
  patch: Partial<{
    title: string;
    description: string;
    starts_at: string;
    ends_at: string;
    reg_opens_at: string;
    reg_closes_at: string;
    capacity: number | null;
    force_closed: boolean;
    questions: unknown[];
    archived: boolean;
  }>,
): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/events/${encodeURIComponent(eventId)}`, 'PATCH', patch);
}

export interface BearerLinkInput {
  label: string;
  url: string;
}

export function createBearer(input: {
  name: string;
  role: string;
  cohort?: string;
  photo_url?: string;
  links?: BearerLinkInput[];
}): Promise<{ id: string }> {
  return request<{ id: string }>('/api/content/bearers', 'POST', input);
}

export function updateBearer(
  id: string,
  patch: { name?: string; role?: string; cohort?: string | null; photo_url?: string | null; links?: BearerLinkInput[] },
): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/content/bearers/${encodeURIComponent(id)}`, 'PATCH', patch);
}

export function deleteBearer(id: string): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/api/content/bearers/${encodeURIComponent(id)}`, 'DELETE');
}

export function createAchievement(input: {
  title: string;
  description: string;
  date?: string;
}): Promise<{ id: string }> {
  return request<{ id: string }>('/api/content/achievements', 'POST', input);
}

export function updateAchievement(
  id: string,
  patch: { title?: string; description?: string; date?: string | null },
): Promise<{ ok: true }> {
  return request<{ ok: true }>(
    `/api/content/achievements/${encodeURIComponent(id)}`,
    'PATCH',
    patch,
  );
}

export function deleteAchievement(id: string): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(
    `/api/content/achievements/${encodeURIComponent(id)}`,
    'DELETE',
  );
}

// ---------------------------------------------------------------------------
// Account management helpers
// ---------------------------------------------------------------------------

export async function listAdminUsers(q = ''): Promise<{ users: AdminUser[] }> {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return request<{ users: AdminUser[] }>(`/api/admin/users${query}`);
}

export function updateAdminUserRole(id: string, role: 'member' | 'executive' | 'ob'): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/role`, 'PATCH', { role });
}

export function updateAdminUserVerified(id: string, email_verified: boolean): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/verified`, 'PATCH', { email_verified });
}

/**
 * Permanently remove an account. Its registrations and pending mail go with
 * it; every confirmed seat it held promotes the oldest waitlisted person.
 */
export function deleteAdminUser(
  id: string,
): Promise<{ deleted: true; registrations: number; promotions: { event_id: string; email: string | null }[] }> {
  return request<{ deleted: true; registrations: number; promotions: { event_id: string; email: string | null }[] }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    'DELETE',
  );
}

export function sendAdminVerification(ids?: string[]): Promise<{ queued: number }> {
  return request<{ queued: number }>('/api/admin/users/send-verification', 'POST', { ids });
}

// ---------------------------------------------------------------------------
// Event create/edit helpers (poster via multipart)
// ---------------------------------------------------------------------------

/** Append the client-generated poster derivatives when they exist. */
function appendPosterVariants(form: FormData, variants?: PosterVariantBlobs): void {
  if (!variants) return;
  form.append('poster_thumb', variants.thumb, 'poster-thumb.webp');
  form.append('poster_full', variants.full, 'poster-full.webp');
}

export async function adminCreateEvent(input: {
  id?: string;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  reg_opens_at: string;
  reg_closes_at: string;
  capacity?: number | null;
  force_closed?: boolean;
  questions?: unknown[];
  // Optional in local dev without club storage (the worker accepts a
  // poster-less create there); required once storage is connected.
  poster?: File;
  /** 640w / 1600w WebP variants generated in the browser before upload. */
  posterVariants?: PosterVariantBlobs;
}): Promise<{ id: string; poster_url: string | null }> {
  const data = {
    id: input.id,
    title: input.title,
    description: input.description ?? '',
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    reg_opens_at: input.reg_opens_at,
    reg_closes_at: input.reg_closes_at,
    capacity: input.capacity ?? null,
    force_closed: input.force_closed ?? false,
    questions: input.questions ?? [],
  };
  const form = new FormData();
  form.append('data', JSON.stringify(data));
  if (input.poster) form.append('poster', input.poster);
  appendPosterVariants(form, input.posterVariants);
  const res = await fetch('/api/events', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const raw = await res.text().catch(() => '');
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (!res.ok) {
    const code = payload?.error ?? (res.status === 401 ? 'unauthenticated' : 'request_failed');
    throw new ApiError(res.status, code);
  }
  return payload as { id: string; poster_url: string | null };
}

// ---------------------------------------------------------------------------
// Recruitment applications
// ---------------------------------------------------------------------------

export type RecruitmentStatus = 'pending' | 'selected' | 'rejected';

export interface RecruitmentApplication {
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

/**
 * Admin application list. Omit `status` for every application; the panel
 * fetches each status explicitly so counts stay correct either way.
 */
export function listRecruitmentApplications(
  status?: RecruitmentStatus,
): Promise<{ applications: RecruitmentApplication[] }> {
  const query = status ? `?status=${status}` : '';
  return request<{ applications: RecruitmentApplication[] }>(`/api/admin/recruitment${query}`);
}

/** Finalise a pending application. A second decision returns 409 already_decided. */
export function decideRecruitmentApplication(
  id: string,
  status: Exclude<RecruitmentStatus, 'pending'>,
): Promise<{ ok: true; status: Exclude<RecruitmentStatus, 'pending'> }> {
  return request<{ ok: true; status: Exclude<RecruitmentStatus, 'pending'> }>(
    `/api/admin/recruitment/${encodeURIComponent(id)}`,
    'PATCH',
    { status },
  );
}

/** Flip the public recruitment switch (ob only; audited server-side). */
export function setRecruitmentOpen(open: boolean): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/site', 'PUT', { recruitment_open: open });
}

export function adminUploadPoster(
  eventId: string,
  file: File,
  variants?: PosterVariantBlobs,
): Promise<{ poster_url: string | null } | { ok: true; poster_url?: string | null }> {
  const form = new FormData();
  form.append('data', JSON.stringify({}));
  form.append('poster', file);
  appendPosterVariants(form, variants);
  return (async () => {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      credentials: 'include',
      body: form,
    });
    const raw = await res.text().catch(() => '');
    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (!res.ok) {
      const code = payload?.error ?? (res.status === 401 ? 'unauthenticated' : 'request_failed');
      throw new ApiError(res.status, code);
    }
    return payload;
  })();
}
