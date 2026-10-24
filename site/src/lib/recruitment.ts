/**
 * Typed client + pure validation for the public recruitment flow.
 *
 * Same-origin relative paths with `credentials: 'include'`, mirroring the
 * ApiError pattern from ./api and ./site. Every failure surfaces as a
 * `RecruitmentApiError` so the page can branch on the machine code
 * (`recruitment_closed`, `already_applied`, `rate_limited`, `not_found`, …).
 *
 * The pre-submit rules below mirror the worker contract, but the server remains
 * the authority: a 400 from `/api/recruit` is still rendered honestly.
 */

export type ApplicationStatus = 'pending' | 'selected' | 'rejected';

/** The application form payload, as sent to POST /api/recruit. */
export interface ApplicationInput {
  name: string;
  email: string;
  reg_number: string;
  phone: string;
  /** '1' | '2' | '3' — kept as a string because an unanswered select is ''. */
  year: string;
  branch: string;
  why_join: string;
  contribute: string;
  time_commitment: string;
  remarks?: string;
}

export type ApplicationField = Exclude<keyof ApplicationInput, 'remarks'>;

export type ApplicationErrors = Partial<Record<ApplicationField, string>>;

export interface ApplicationReceipt {
  id: string;
  status: ApplicationStatus;
}

export interface ApplicationRecord {
  status: ApplicationStatus;
  created_at: string;
  decided_at: string | null;
}

export interface StatusLookup {
  application: ApplicationRecord;
}

/** Every failure surfaces as a RecruitmentApiError, so callers can branch on `.error`. */
export class RecruitmentApiError extends Error {
  readonly status: number;
  /** Machine code from the `{ error }` envelope, or a client-side fallback. */
  readonly error: string;

  constructor(status: number, error: string) {
    super(error);
    this.name = 'RecruitmentApiError';
    this.status = status;
    this.error = error;
  }
}

/** Answer floors keep the two free-text fields useful without being hostile. */
export const MIN_ANSWER_LENGTH = 40;

/** Eligible years, in display order. */
export const ELIGIBLE_YEARS = [
  { value: '1', label: '1st year' },
  { value: '2', label: '2nd year' },
  { value: '3', label: '3rd year' },
] as const;

const COLLEGE_EMAIL_PATTERN = /^[^\s@]+@bl\.students\.amrita\.edu$/i;
const PHONE_SEPARATORS = /[\s+\-().]/g;

/** Strip the punctuation people type into phone fields. */
export function normalizePhone(phone: string): string {
  return phone.replace(PHONE_SEPARATORS, '');
}

/** Trimmed length, used for both required checks and answer floors. */
function trimmedLength(value: string | undefined): number {
  return (value ?? '').trim().length;
}

/**
 * Pre-submit validation. Returns an empty object when the application is
 * complete and eligible; otherwise one message per offending field.
 */
export function validateApplication(input: ApplicationInput): ApplicationErrors {
  const errors: ApplicationErrors = {};

  if (trimmedLength(input.name) === 0) {
    errors.name = 'Enter your full name.';
  }

  if (trimmedLength(input.email) === 0) {
    errors.email = 'Enter your college email.';
  } else if (!COLLEGE_EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = 'Use your @bl.students.amrita.edu college email.';
  }

  if (trimmedLength(input.reg_number) === 0) {
    errors.reg_number = 'Enter your register ID.';
  }

  if (trimmedLength(input.phone) === 0) {
    errors.phone = 'Enter your phone number.';
  } else if (!/^\d{10,15}$/.test(normalizePhone(input.phone))) {
    errors.phone = 'Enter a phone number with 10 to 15 digits.';
  }

  if (input.year !== '1' && input.year !== '2' && input.year !== '3') {
    errors.year = 'Select your year of study.';
  }

  if (trimmedLength(input.branch) === 0) {
    errors.branch = 'Enter your branch.';
  }

  if (trimmedLength(input.why_join) === 0) {
    errors.why_join = 'Tell us why you want to join.';
  } else if (trimmedLength(input.why_join) < MIN_ANSWER_LENGTH) {
    errors.why_join = `Write at least ${MIN_ANSWER_LENGTH} characters.`;
  }

  if (trimmedLength(input.contribute) === 0) {
    errors.contribute = 'Tell us what you can contribute.';
  } else if (trimmedLength(input.contribute) < MIN_ANSWER_LENGTH) {
    errors.contribute = `Write at least ${MIN_ANSWER_LENGTH} characters.`;
  }

  if (trimmedLength(input.time_commitment) === 0) {
    errors.time_commitment = 'Tell us how much time you can commit.';
  }

  return errors;
}

/**
 * Human copy for a server status. The body is deliberately plain: no promises
 * the team cannot keep, and no hint that a rejection is negotiable.
 */
export function applicationStatusCopy(status: ApplicationStatus): { label: string; body: string } {
  switch (status) {
    case 'pending':
      return {
        label: 'Under review',
        body: 'Your application is under review. We will email you once a decision is made.',
      };
    case 'selected':
      return {
        label: 'Selected',
        body: 'You have been selected. Check your college email for next steps.',
      };
    case 'rejected':
      return {
        label: 'Not selected',
        body: 'You were not selected this cycle. You are welcome to apply again when recruitment reopens.',
      };
  }
}

function errorCode(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const code = (payload as { error?: unknown }).error;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  if (status === 403) return 'recruitment_closed';
  if (status === 404) return 'not_found';
  if (status === 409) return 'already_applied';
  if (status === 429) return 'rate_limited';
  return 'request_failed';
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new RecruitmentApiError(0, 'network_error');
  } finally {
    clearTimeout(timer);
  }

  // A proxy or crash can return HTML; never let JSON.parse throw past here.
  const raw = await response.text().catch(() => '');
  let payload: unknown = null;
  try {
    payload = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) throw new RecruitmentApiError(response.status, errorCode(payload, response.status));

  return payload as T;
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isStatus(value: unknown): value is ApplicationStatus {
  return value === 'pending' || value === 'selected' || value === 'rejected';
}

/** POST /api/recruit. Resolves with the reference id the success state shows. */
export async function submitApplication(input: ApplicationInput): Promise<ApplicationReceipt> {
  const payload = await request<unknown>('/api/recruit', {
    method: 'POST',
    body: {
      name: input.name.trim(),
      email: input.email.trim(),
      reg_number: input.reg_number.trim(),
      phone: normalizePhone(input.phone),
      year: input.year,
      branch: input.branch.trim(),
      why_join: input.why_join.trim(),
      contribute: input.contribute.trim(),
      time_commitment: input.time_commitment.trim(),
      ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}),
    },
  });

  const row = record(payload);
  const id = row && typeof row.id === 'string' ? row.id.trim() : '';
  const status = row && isStatus(row.status) ? row.status : 'pending';
  if (id.length === 0) throw new RecruitmentApiError(502, 'invalid_response');
  return { id, status };
}

/**
 * GET /api/recruit/status?email=&reg_number=.
 * Throws `RecruitmentApiError` with `not_found` when there is no match.
 */
export async function lookupStatus(email: string, regNumber: string): Promise<StatusLookup> {
  const query = new URLSearchParams({
    email: email.trim(),
    reg_number: regNumber.trim(),
  });
  const payload = await request<unknown>(`/api/recruit/status?${query.toString()}`);
  const root = record(payload);
  const application = root ? record(root.application) : null;
  if (!application || !isStatus(application.status)) {
    throw new RecruitmentApiError(502, 'invalid_response');
  }
  return {
    application: {
      status: application.status,
      created_at: typeof application.created_at === 'string' ? application.created_at : '',
      decided_at: typeof application.decided_at === 'string' ? application.decided_at : null,
    },
  };
}
