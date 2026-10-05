/**
 * Typed client for the events + registrations API.
 *
 * Same-origin relative paths with `credentials: 'include'`, mirroring the
 * ApiError pattern from ./api.
 */

export type RegistrationStatus = 'registered' | 'waitlisted' | 'cancelled';

export interface EventQuestion {
  id: string;
  label: string;
  required: boolean;
  maxLength: number;
}

export interface EventSummary {
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
  mine: { status: RegistrationStatus } | null;
}

export interface EventDetail extends EventSummary {
  questions: EventQuestion[];
}

export interface MyRegistration {
  status: RegistrationStatus;
  answers: Record<string, string>;
  created_at: string;
}

/** Every failure surfaces as an ApiError, so callers can branch on `.error`. */
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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

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

export function listEvents(): Promise<{ events: EventSummary[] }> {
  return request<{ events: EventSummary[] }>('/api/events');
}

export function getEvent(id: string): Promise<{ event: EventDetail }> {
  return request<{ event: EventDetail }>(`/api/events/${encodeURIComponent(id)}`);
}

export function registerForEvent(
  id: string,
  answers?: Record<string, string>,
): Promise<{ status: RegistrationStatus }> {
  return request<{ status: RegistrationStatus }>(
    `/api/events/${encodeURIComponent(id)}/register`,
    'POST',
    { answers: answers ?? {} },
  );
}

export function cancelRegistration(id: string): Promise<{ cancelled: true }> {
  return request<{ cancelled: true }>(`/api/events/${encodeURIComponent(id)}/register`, 'DELETE');
}

export function myRegistration(id: string): Promise<{ registration: MyRegistration | null }> {
  return request<{ registration: MyRegistration | null }>(
    `/api/events/${encodeURIComponent(id)}/my-registration`,
  );
}
