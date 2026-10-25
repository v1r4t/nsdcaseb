/**
 * Typed client for the projects API.
 *
 * Same-origin relative paths with `credentials: 'include'`, mirroring the
 * ApiError pattern from ./events and ./media.
 */

export type ProjectStatus = 'active' | 'shipped' | 'archived';

export interface Project {
  id: string;
  title: string;
  summary: string;
  description: string;
  stack: string[];
  url: string | null;
  cover_url: string | null;
  status: ProjectStatus;
  event_id: string | null;
  author: string;
  /** Owner-picked standout. Absent on older rows — treat missing as false. */
  featured: boolean;
  sort_order: number;
}

export interface ProjectListResponse {
  projects: Project[];
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

/** Public: projects ordered by sort_order. An empty array is the honest normal state. */
export function listProjects(): Promise<ProjectListResponse> {
  return request<ProjectListResponse>('/api/projects');
}

export interface ProjectCreateInput {
  title: string;
  summary?: string;
  description?: string;
  stack?: string[];
  url?: string | null;
  cover_url?: string | null;
  status?: ProjectStatus;
  event_id?: string | null;
  /** Credit line; omit/null/'' means no author. Trimmed, max 120 chars. */
  author?: string | null;
  featured?: boolean;
}

export interface ProjectPatch {
  title?: string;
  summary?: string;
  description?: string;
  stack?: string[];
  url?: string | null;
  cover_url?: string | null;
  status?: ProjectStatus;
  event_id?: string | null;
  /** Credit line; null/'' clears it. Trimmed, max 120 chars. */
  author?: string | null;
  featured?: boolean;
  sort_order?: number;
}

/**
 * Admin: create a project. Mirrors the worker POST shape.
 * NOTE: the worker ignores `sort_order` on POST (the INSERT does not list
 * it) — callers that need a non-zero sort_order must follow up with
 * updateProject(id, { sort_order }).
 */
export function createProject(input: ProjectCreateInput): Promise<{ id: string }> {
  return request<{ id: string }>('/api/projects', 'POST', input);
}

/** Admin: partial project update, including the `featured` flag. */
export function updateProject(id: string, patch: ProjectPatch): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}`, 'PATCH', patch);
}

/** Admin: delete a project. */
export function deleteProject(id: string): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/api/projects/${encodeURIComponent(id)}`, 'DELETE');
}

// --------------------------------------------------------------- testimonials

/** Public row shape; GET only returns active rows, ordered by sort_order. */
export interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string;
  sort_order: number;
}

export interface TestimonialListResponse {
  testimonials: Testimonial[];
}

export interface TestimonialCreateInput {
  /** Required; trimmed by the worker. */
  quote: string;
  /** Required; trimmed by the worker. */
  name: string;
  /** Optional; must be a string (null is rejected as invalid_role). */
  role?: string;
}

export interface TestimonialPatch {
  /** Must be non-empty when present. */
  quote?: string;
  /** Must be non-empty when present. */
  name?: string;
  /** May be empty. */
  role?: string;
  /** Must be an integer. */
  sort_order?: number;
  active?: boolean;
}

/** Public: active testimonials ordered by sort_order. */
export function listTestimonials(): Promise<TestimonialListResponse> {
  return request<TestimonialListResponse>('/api/testimonials');
}

/**
 * Admin: create a testimonial. Mirrors the worker POST shape.
 * NOTE: the worker ignores `sort_order` on POST (the INSERT does not list
 * it) — callers that need a non-zero sort_order must follow up with
 * updateTestimonial(id, { sort_order }), exactly like createProject.
 */
export function createTestimonial(input: TestimonialCreateInput): Promise<{ id: string }> {
  return request<{ id: string }>('/api/testimonials', 'POST', input);
}

/** Admin: partial testimonial update, including `sort_order` and `active`. */
export function updateTestimonial(id: string, patch: TestimonialPatch): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/testimonials/${encodeURIComponent(id)}`, 'PATCH', patch);
}

/** Admin: delete a testimonial. */
export function deleteTestimonial(id: string): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/api/testimonials/${encodeURIComponent(id)}`, 'DELETE');
}
