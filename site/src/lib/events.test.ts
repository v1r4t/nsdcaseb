/**
 * Unit tests for site/src/lib/events.ts (Phase 0/5A scaffolding).
 *
 * The API client is exercised with a stubbed global fetch: success paths,
 * URL encoding, method/body plumbing, and every ApiError branch of the
 * private errorCode/request helpers (tested through the public functions).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  cancelRegistration,
  getEvent,
  listEvents,
  myRegistration,
  registerForEvent,
} from './events';

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => (payload === null ? '' : JSON.stringify(payload)),
    json: async () => payload,
  } as Response;
}

function stubFetch(impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiError', () => {
  it('carries status and machine code', () => {
    const err = new ApiError(403, 'forbidden');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(403);
    expect(err.error).toBe('forbidden');
  });
});

describe('listEvents / getEvent', () => {
  it('resolves the events envelope on success', async () => {
    stubFetch(async () => jsonResponse({ events: [] }));
    await expect(listEvents()).resolves.toEqual({ events: [] });
  });

  it('encodes the event id in the detail path', async () => {
    const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ event: { id: 'a/b' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await getEvent('a/b');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/events/a%2Fb');
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('include');
  });
});

describe('registerForEvent / cancelRegistration / myRegistration', () => {
  it('POSTs the payload as JSON and resolves the status', async () => {
    const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ status: 'registered' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await registerForEvent('e1', { name: 'Ada', reg_number: 'R1', answers: { q1: 'yes' } });
    expect(res).toEqual({ status: 'registered' });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/events/e1/register');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Ada', reg_number: 'R1', answers: { q1: 'yes' } });
  });

  it('DELETEs the registration and resolves the envelope', async () => {
    const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ cancelled: true }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(cancelRegistration('e1')).resolves.toEqual({ cancelled: true });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/events/e1/register');
    expect(init?.method).toBe('DELETE');
  });

  it('resolves a null registration', async () => {
    stubFetch(async () => jsonResponse({ registration: null }));
    await expect(myRegistration('e1')).resolves.toEqual({ registration: null });
  });
});

describe('error mapping', () => {
  it('maps a rejected fetch to network_error with status 0', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    const err = await listEvents().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).error).toBe('network_error');
  });

  it('prefers the envelope error code when present', async () => {
    stubFetch(async () => jsonResponse({ error: 'event_closed' }, false, 400));
    const err = await listEvents().catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).error).toBe('event_closed');
  });

  it('maps 401 without an envelope to unauthenticated', async () => {
    stubFetch(async () => jsonResponse(null, false, 401));
    const err = await listEvents().catch((e: unknown) => e);
    expect((err as ApiError).error).toBe('unauthenticated');
  });

  it('maps 429 without an envelope to rate_limited', async () => {
    stubFetch(async () => jsonResponse(null, false, 429));
    const err = await listEvents().catch((e: unknown) => e);
    expect((err as ApiError).error).toBe('rate_limited');
  });

  it('maps other failures without a code to request_failed', async () => {
    stubFetch(async () => jsonResponse({ unexpected: true }, false, 500));
    const err = await listEvents().catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).error).toBe('request_failed');
  });

  it('maps a non-JSON error body to the status fallback', async () => {
    stubFetch(async () => ({ ok: false, status: 503, text: async () => '<html>down</html>' }) as Response);
    const err = await listEvents().catch((e: unknown) => e);
    expect((err as ApiError).error).toBe('request_failed');
  });
});
