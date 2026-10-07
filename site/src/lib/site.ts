/**
 * Typed client for the "alive system" endpoints: the site-wide announcement
 * bar and the member testimonial rotation.
 *
 * Same-origin relative paths with `credentials: 'include'`, mirroring the
 * ApiError pattern from ./events and ./media. Both endpoints are *ambient*
 * page data — a failure must never break a page, so the `load*` helpers never
 * reject: they resolve with the honest normal state (`announcement: null`,
 * `recruitment_open: null`, `testimonials: []`).
 *
 * Payloads are normalised field by field, so a half-written row can never blank
 * a section, and unsafe hrefs are dropped rather than rendered.
 */

/** A single site-wide notice. `href` empty means "plain text, not a link". */
export interface Announcement {
  text: string;
  href: string;
}

/** Live site state. `null` fields mean "not answered by the server". */
export interface SiteState {
  announcement: Announcement | null;
  recruitment_open: boolean | null;
}

export interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string;
  sort_order: number;
}

/** The honest normal state — used on any failure. */
export const EMPTY_SITE_STATE: SiteState = {
  announcement: null,
  recruitment_open: null,
};

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

function errorCode(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const code = (payload as { error?: unknown }).error;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  if (status === 401) return 'unauthenticated';
  if (status === 429) return 'rate_limited';
  return 'request_failed';
}

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
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

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Only same-origin paths and http(s) URLs survive. Everything else
 * (`javascript:`, `data:`, protocol-relative) is dropped so the announcement
 * can never become a script injection point.
 */
function safeHref(value: unknown): string {
  if (typeof value !== 'string') return '';
  const href = value.trim();
  if (href.length === 0) return '';
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return '';
}

function normalizeAnnouncement(value: unknown): Announcement | null {
  const row = record(value);
  if (!row) return null;
  if (typeof row.text !== 'string') return null;
  const text = row.text.trim();
  if (text.length === 0) return null;
  return { text, href: safeHref(row.href) };
}

function normalizeSite(payload: unknown): SiteState {
  const source = record(payload);
  if (!source) return EMPTY_SITE_STATE;
  return {
    announcement: normalizeAnnouncement(source.announcement),
    recruitment_open:
      typeof source.recruitment_open === 'boolean' ? source.recruitment_open : null,
  };
}

function normalizeTestimonial(value: unknown, index: number): Testimonial | null {
  const row = record(value);
  if (!row) return null;
  if (typeof row.quote !== 'string' || row.quote.trim().length === 0) return null;
  if (typeof row.name !== 'string' || row.name.trim().length === 0) return null;
  return {
    id: typeof row.id === 'string' && row.id.length > 0 ? row.id : `testimonial-${index}`,
    quote: row.quote.trim(),
    name: row.name.trim(),
    role: typeof row.role === 'string' ? row.role.trim() : '',
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : index,
  };
}

function normalizeTestimonials(payload: unknown): Testimonial[] {
  const source = record(payload);
  const rows = source ? source.testimonials : null;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row, index) => normalizeTestimonial(row, index))
    .filter((row): row is Testimonial => row !== null)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** GET /api/site. Throws ApiError on any failure. */
export function getSite(): Promise<SiteState> {
  return request<unknown>('/api/site').then(normalizeSite);
}

/** GET /api/testimonials. Throws ApiError on any failure. */
export function getTestimonials(): Promise<Testimonial[]> {
  return request<unknown>('/api/testimonials').then(normalizeTestimonials);
}

/**
 * `/api/site` is read by several components on the same page, so concurrent
 * callers share one in-flight request. A failure is *not* cached — the next
 * caller retries.
 */
let siteInFlight: Promise<SiteState> | null = null;

export function loadSiteState(): Promise<SiteState> {
  if (!siteInFlight) {
    siteInFlight = getSite().catch(() => {
      siteInFlight = null;
      return EMPTY_SITE_STATE;
    });
  }
  return siteInFlight;
}

/** Never rejects: an empty rotation is the honest normal state. */
export function loadTestimonials(): Promise<Testimonial[]> {
  return getTestimonials().catch(() => []);
}