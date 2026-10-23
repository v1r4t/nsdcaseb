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
  poster_url: string | null;
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

/**
 * Events are Bengaluru-local; the API stores UTC ISO strings
 * (see worker/events.ts: starts_at/ends_at/reg_opens_at/reg_closes_at).
 * Every user-facing event date/time is rendered explicitly in
 * Asia/Kolkata with an IST marker so viewers outside IST see the same
 * day and time as a viewer in Bengaluru. Audit/ops timestamps
 * (roster created_at, outbox, audit log) stay viewer-local via
 * AdminOverview fmtDateTime — those record *when* something happened,
 * not when an event happens.
 */
export const EVENT_TIME_ZONE = 'Asia/Kolkata';

function toValidDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "17 OCT 2025" in Asia/Kolkata; falls back to the raw string. */
export function formatEventDate(iso: string): string {
  const d = toValidDate(iso);
  if (!d) return iso;
  return d
    .toLocaleDateString('en-GB', {
      timeZone: EVENT_TIME_ZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();
}

/** "2:30 PM – 4:30 PM IST" in Asia/Kolkata; '' when either ISO is invalid. */
export function formatEventTimeRange(starts: string, ends: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: EVENT_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  };
  try {
    const s = toValidDate(starts);
    const e = toValidDate(ends);
    if (!s || !e) return '';
    return `${s.toLocaleTimeString(undefined, opts)} – ${e.toLocaleTimeString(undefined, opts)} IST`;
  } catch {
    return '';
  }
}

/** "17 OCT 2025, 2:30 PM IST" in Asia/Kolkata; falls back to raw string. */
export function formatEventDateTime(iso: string): string {
  const d = toValidDate(iso);
  if (!d) return iso;
  return (
    d
      .toLocaleString('en-GB', {
        timeZone: EVENT_TIME_ZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
      .toUpperCase() + ' IST'
  );
}

/** Split IST date for the list-row calendar block; null when invalid. */
export function eventDateParts(iso: string): { day: string; mon: string; year: string } | null {
  const d = toValidDate(iso);
  if (!d) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: EVENT_TIME_ZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).formatToParts(d);
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    return { day: get('day'), mon: get('month').toUpperCase(), year: get('year') };
  } catch {
    return null;
  }
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

/**
 * Hang-risk guard: a stalled connection must surface as `network_error`
 * (which every caller already renders as a friendly empty/error state)
 * instead of hanging the page forever.
 */
const REQUEST_TIMEOUT_MS = 15_000;

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
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

export function listEvents(): Promise<{ events: EventSummary[] }> {
  return request<{ events: EventSummary[] }>('/api/events');
}

export function getEvent(id: string): Promise<{ event: EventDetail }> {
  return request<{ event: EventDetail }>(`/api/events/${encodeURIComponent(id)}`);
}

export function registerForEvent(
  id: string,
  payload: { answers?: Record<string, string>; name?: string; reg_number?: string } = {},
): Promise<{ status: RegistrationStatus; account_prompt?: boolean }> {
  return request<{ status: RegistrationStatus; account_prompt?: boolean }>(
    `/api/events/${encodeURIComponent(id)}/register`,
    'POST',
    payload,
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
