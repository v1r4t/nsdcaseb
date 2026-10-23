/**
 * Typed client for the NSDC worker API.
 *
 * Everything is same-origin (relative paths) so the httpOnly session cookie is
 * attached with `credentials: 'include'`.
 */

export type Role = 'member' | 'executive' | 'ob';

export interface User {
  id: string;
  email: string;
  name: string;
  mobile: string;
  reg_number: string | null;
  role: Role;
  is_executive: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface LoginResponse {
  user: User;
  expires_at: string;
}

export interface RegisterResponse {
  user: User;
  verify_pending: true;
}

export interface VerifyEmailResponse {
  ok: true;
}

export interface MeResponse {
  user: User;
}

export interface ForgotPasswordResponse {
  ok: true;
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

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

/**
 * Hang-risk guard: a stalled connection must surface as `network_error`
 * (which every caller already renders as a friendly empty/error state)
 * instead of hanging the page forever.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/** Pull a server error code out of `{ error }`, falling back to status-derived codes. */
function errorCode(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const code = (payload as { error?: unknown }).error;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  if (status === 401) return 'unauthenticated';
  if (status === 429) return 'rate_limited';
  return 'request_failed';
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

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
    // Offline, DNS failure, CORS, a blocked mixed-content request,
    // or our own timeout abort — all hang-risk, all `network_error`.
    throw new ApiError(0, 'network_error');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;

  // A proxy or crash can return HTML; never let JSON.parse throw past here.
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

export function register(input: {
  name: string;
  email: string;
  mobile: string;
  password: string;
  admin_code?: string;
}): Promise<RegisterResponse> {
  return request<RegisterResponse>('/api/auth/register', {
    method: 'POST',
    body: input,
  });
}

export function login(email: string, password: string, remember?: boolean, admin_code?: string): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password, remember, admin_code },
  });
}

export async function logout(): Promise<void> {
  await request<void>('/api/auth/logout', { method: 'POST' });
}

export function me(): Promise<MeResponse> {
  return request<MeResponse>('/api/auth/me');
}

export function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return request<ForgotPasswordResponse>('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

export function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return request<VerifyEmailResponse>('/api/auth/verify-email', { method: 'POST', body: { token } });
}

export function resetPassword(token: string, password: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: { token, password } });
}

export function resendVerification(email: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/auth/resend-verification', { method: 'POST', body: { email } });
}