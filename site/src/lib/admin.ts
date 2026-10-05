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
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error');
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
  users_by_role: { member: number; executive: number; admin: number };
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
}

export interface RosterEntry {
  email: string;
  status: string;
  answers: Record<string, string>;
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

export function getEventRoster(eventId: string): Promise<{ registrations: RosterEntry[] }> {
  return request<{ registrations: RosterEntry[] }>(
    `/api/events/${encodeURIComponent(eventId)}/registrations`,
  );
}

/** Admin-only event toggle (open/close). Capacity stays read-only for now. */
export function adminUpdateEvent(
  eventId: string,
  patch: { force_closed?: boolean },
): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/events/${encodeURIComponent(eventId)}`, 'PATCH', patch);
}

export function updateSection(
  key: string,
  patch: { title?: string; body?: string },
): Promise<{ ok: true }> {
  return request<{ ok: true }>(
    `/api/content/sections/${encodeURIComponent(key)}`,
    'PUT',
    patch,
  );
}

export function createBearer(input: {
  name: string;
  role: string;
  cohort?: string;
  photo_url?: string;
}): Promise<{ id: string }> {
  return request<{ id: string }>('/api/content/bearers', 'POST', input);
}

export function updateBearer(
  id: string,
  patch: { name?: string; role?: string; cohort?: string | null; photo_url?: string | null },
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
