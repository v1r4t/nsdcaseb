import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_CONTENT, fetchContent, loadContent } from './content';

afterEach(() => vi.unstubAllGlobals());

const ok = (payload: unknown) =>
  vi.fn(async () => ({ ok: true, json: async () => payload }) as Response);

describe('loadContent', () => {
  it('reports fallback: false and the payload on success', async () => {
    vi.stubGlobal('fetch', ok({ sections: [], bearers: [], achievements: [] }));
    const result = await loadContent();
    expect(result.fallback).toBe(false);
    expect(result.content.bearers).toEqual([]);
  });

  it('reports fallback: true on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const result = await loadContent();
    expect(result.fallback).toBe(true);
    expect(result.content).toBe(FALLBACK_CONTENT);
  });

  it('reports fallback: true on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    expect((await loadContent()).fallback).toBe(true);
  });

  it('keeps fetchContent returning content only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(fetchContent()).resolves.toBe(FALLBACK_CONTENT);
  });
});
