/**
 * Typed client for the NSDC worker API.
 *
 * Everything is same-origin (relative paths) so the httpOnly session cookie is
 * attached with `credentials: 'include'`.
 */

export type Role = 'member' | 'executive' | 'admin';

export interface User {
  id: string;
  email: string;
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
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Offline, DNS failure, CORS, or a blocked mixed-content request.
    throw new ApiError(0, 'network_error');
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

export function register(email: string, password: string, is_executive: boolean): Promise<RegisterResponse> {
  return request<RegisterResponse>('/api/auth/register', {
    method: 'POST',
    body: { email, password, is_executive },
  });
}

export function login(email: string, password: string, remember?: boolean): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: remember === undefined ? { email, password } : { email, password, remember },
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