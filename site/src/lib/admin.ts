/**
 * Typed client for the Phase 5 admin + content-mutation API.
 *
 * Same-origin relative paths with `credentials: 'include'`, mirroring the
 * ApiError pattern from ./api and ./events.
 */

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
  status: string;
  attempts: number;
  created_at: string;
  sent_at: string | null;
  /** First 500 chars of the queued body (may be absent on old workers). */
  preview?: string | null;
}

export interface RosterEntry {
  email: string;
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
}

export interface AuditEntry {
  action: string;
  detail: string;
  admin_email: string;
  created_at: string;
}

export type OutboxStatus = 'pending' | 'sent' | 'failed';

export function getStats(): Promise<AdminStats> {
  return request<AdminStats>('/api/admin/stats');
}

export function getOutbox(status: OutboxStatus = 'pending'): Promise<{ outbox: OutboxEntry[] }> {
  return request<{ outbox: OutboxEntry[] }>(`/api/admin/outbox?status=${status}`);
}

export function sendBroadcast(input: {
  audience: 'all' | 'event';
  event_id?: string;
  subject: string;
  body: string;
}): Promise<{ queued: number }> {
  return request<{ queued: number }>('/api/admin/broadcast', 'POST', input);
}

export function getAuditLog(): Promise<{ entries: AuditEntry[] }> {
  return request<{ entries: AuditEntry[] }>('/api/admin/audit-log');
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

export function sendAdminVerification(ids?: string[]): Promise<{ queued: number }> {
  return request<{ queued: number }>('/api/admin/users/send-verification', 'POST', { ids });
}

// ---------------------------------------------------------------------------
// Event create/edit helpers (poster via multipart)
// ---------------------------------------------------------------------------

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

export function adminUploadPoster(eventId: string, file: File): Promise<{ poster_url: string | null } | { ok: true; poster_url?: string | null }> {
  const form = new FormData();
  form.append('data', JSON.stringify({}));
  form.append('poster', file);
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
