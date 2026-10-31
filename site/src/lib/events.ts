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

/** Upload-time WebP derivatives served next to the original poster. */
export interface EventPosterVariants {
  thumb: string;
  full: string;
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
  /** Optional physical location; absent or null means none published. */
  venue?: string | null;
  poster_url: string | null;
  /**
   * Present for posters uploaded after the variant pipeline shipped. Older
   * posters have no variant objects, so the URL pair 404s; renderers keep the
   * original `poster_url` as the fallback (see lib/image-variants.ts).
   */
  poster_variants?: EventPosterVariants | null;
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

// Events are Bengaluru-local. India has used a fixed +05:30 offset since 1945,
// so the admin form can bridge to UTC without a timezone database lookup.
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * UTC ISO instant -> `YYYY-MM-DDTHH:mm` in Asia/Kolkata for a datetime-local
 * input. Unlike the native `Date` getters, this does not depend on the admin's
 * device timezone.
 */
export function toEventLocalInput(iso: string): string {
  const d = toValidDate(iso);
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * `YYYY-MM-DDTHH:mm` read as Asia/Kolkata -> UTC ISO, or null when malformed.
 * The round-trip check rejects calendar overflow such as 30 February or 24:00.
 */
export function fromEventLocalInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const d = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) -
      IST_OFFSET_MS,
  );
  if (Number.isNaN(d.getTime()) || toEventLocalInput(d.toISOString()) !== value) return null;
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Add to calendar (.ics)
//
// Generated entirely in the browser from data the API already returns — no
// dependency and no server round-trip. Times are UTC instants, so DTSTART and
// DTEND are written in UTC (`Z`) and calendar apps localise them themselves.
// ---------------------------------------------------------------------------

/** The subset of an event needed to build a calendar entry. */
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  venue?: string | null;
}

/** False when the event has unparseable or non-increasing start/end times. */
export function eventCalendarReady(event: Pick<CalendarEvent, 'starts_at' | 'ends_at'>): boolean {
  const starts = toValidDate(event.starts_at);
  const ends = toValidDate(event.ends_at);
  return !!starts && !!ends && ends.getTime() > starts.getTime();
}

/** RFC 5545 TEXT escaping: backslash, newlines, semicolons and commas. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** `2026-03-26T18:00:00.000Z` -> `20260326T180000Z`. */
function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Fold at 75 UTF-8 octets, continuing lines with a single leading space. */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const folded: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // The first line has 75 octets; continuations spend one on the space.
    const limit = folded.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      folded.push(current);
      current = ' ';
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  folded.push(current);
  return folded.join('\r\n');
}

/** `hack-night-2026-03-26.ics`; safe across filesystems. */
function icsFilename(title: string, startsAt: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const day = /^\d{4}-\d{2}-\d{2}/.test(startsAt) ? startsAt.slice(0, 10) : 'event';
  return `${slug || 'event'}-${day}.ics`;
}

/**
 * Build a single-event VCALENDAR document, or null when the event's times
 * cannot produce a valid VEVENT. Includes title, start/end, venue (as
 * LOCATION) and description.
 */
export function buildEventIcs(event: CalendarEvent, now: Date = new Date()): string | null {
  const starts = toValidDate(event.starts_at);
  const ends = toValidDate(event.ends_at);
  if (!starts || !ends || ends.getTime() <= starts.getTime() || Number.isNaN(now.getTime())) {
    return null;
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NSDC//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@nsdc`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(starts)}`,
    `DTEND:${toIcsUtc(ends)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.venue) lines.push(`LOCATION:${escapeIcsText(event.venue)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/**
 * Trigger a client-side download. Returns false (and does nothing) when the
 * event cannot be represented or the environment has no Blob URL support.
 */
export function downloadEventIcs(event: CalendarEvent): boolean {
  const content = buildEventIcs(event);
  if (!content) return false;
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = icsFilename(event.title, event.starts_at);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the click a tick to start before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
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
