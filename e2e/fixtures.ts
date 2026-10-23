import { test as base, type APIRequestContext, type APIResponse } from '@playwright/test';

// Shared e2e helpers. Selectors in the specs use roles/labels only — never
// CSS internals — so product refactors that keep accessible names stay green.

export interface SeedQuestion {
  id: string;
  label: string;
  required: boolean;
  maxLength: number;
}

export interface SeedEvent {
  id: string;
  title: string;
  capacity: number | null;
  registration_open: boolean;
  questions: SeedQuestion[];
}

interface EventSummaryRow {
  id: string;
  title: string;
  capacity: number | null;
  registration_open: boolean;
}

async function readJson<T>(res: APIResponse): Promise<T> {
  return (await res.json()) as T;
}

/** Full event detail (the list endpoint omits `questions`). */
export async function getEventDetail(
  request: APIRequestContext,
  id: string,
): Promise<SeedEvent | null> {
  const res = await request.get(`/api/events/${encodeURIComponent(id)}`);
  if (!res.ok()) return null;
  const body = await readJson<{ event: SeedEvent }>(res);
  return body.event ?? null;
}

/** Open events with their questions attached; [] when the API is down. */
export async function getOpenEvents(request: APIRequestContext): Promise<SeedEvent[]> {
  const res = await request.get('/api/events');
  if (!res.ok()) return [];
  const body = await readJson<{ events: EventSummaryRow[] }>(res);
  const open = (body.events ?? []).filter((e) => e.registration_open);
  const detailed = await Promise.all(open.map((e) => getEventDetail(request, e.id)));
  return detailed.filter((e): e is SeedEvent => e !== null && e.registration_open);
}

/** Unique address per run so re-runs never hit `email_taken`. */
export function uniqueEmail(prefix: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${stamp}@e2e.example.com`;
}

/** Register a member through the API; the caller's storage state holds the session. */
export async function registerViaApi(
  request: APIRequestContext,
  input: { name: string; email: string; mobile: string; password: string },
): Promise<void> {
  const res = await request.post('/api/auth/register', { data: input });
  if (!res.ok()) {
    const text = await res.text().catch(() => '');
    throw new Error(`registerViaApi failed for ${input.email}: ${res.status()} ${text}`);
  }
}

const NEED_SEED =
  'needs seeded D1 data — apply e2e/seed.sql to the local D1 DB ' +
  '(npx wrangler d1 execute nsdc-auth --local --file=e2e/seed.sql -c wrangler.staging.jsonc)';

async function pickEvent(
  request: APIRequestContext,
  predicate: (e: SeedEvent) => boolean,
): Promise<SeedEvent | null> {
  const events = await getOpenEvents(request);
  return events.find(predicate) ?? null;
}

interface SeedFixtures {
  /** Any open event whose questions have no required entries (guest-safe). */
  plainOpenEvent: SeedEvent;
  /** An open event with at least one required question (member stepped flow). */
  qEvent: SeedEvent;
  /** An open event with capacity exactly 1 (waitlist/promote flow). */
  tinyEvent: SeedEvent;
}

export const test = base.extend<SeedFixtures>({
  plainOpenEvent: async ({ request }, use) => {
    const found = await pickEvent(
      request,
      (e) => !e.questions.some((q) => q.required),
    );
    base.skip(!found, `plainOpenEvent ${NEED_SEED}`);
    await use(found as SeedEvent);
  },
  qEvent: async ({ request }, use) => {
    const found = await pickEvent(request, (e) => e.questions.some((q) => q.required));
    base.skip(!found, `qEvent ${NEED_SEED}`);
    await use(found as SeedEvent);
  },
  tinyEvent: async ({ request }, use) => {
    const found = await pickEvent(request, (e) => e.capacity === 1);
    base.skip(!found, `tinyEvent ${NEED_SEED}`);
    await use(found as SeedEvent);
  },
});

export { expect } from '@playwright/test';
