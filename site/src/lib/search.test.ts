/**
 * Unit tests for site/src/lib/search.ts (Phase 0/5A scaffolding).
 *
 * Covers only currently-exported pure logic: buildStaticIndex, fuzzyMatch,
 * matchItem, searchPalette, and ensureRemoteIndex (with fetch stubbed).
 *
 * NOTE (untestable as-is, no refactor allowed): formatEventDate and
 * eventStatusWord are module-private; they are exercised *indirectly* through
 * ensureRemoteIndex sublabels below. If finer-grained coverage is wanted,
 * extract them to an exported helper in a follow-up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStaticIndex,
  clearSearchCache,
  ensureRemoteIndex,
  fuzzyMatch,
  matchItem,
  searchPalette,
} from './search';
import type { SearchItem } from './search';

function item(overrides: Partial<SearchItem> = {}): SearchItem {
  return {
    id: 'x',
    domain: 'pages',
    label: 'About',
    sublabel: 'PAGE · /',
    href: '/',
    ...overrides,
  };
}

describe('buildStaticIndex', () => {
  it('returns the six static pages, all in the pages domain', () => {
    const index = buildStaticIndex();
    expect(index).toHaveLength(6);
    expect(index.map((i) => i.id)).toEqual([
      'page-about',
      'page-events',
      'page-media',
      'page-people',
      'page-archive',
      'page-login',
    ]);
    for (const entry of index) expect(entry.domain).toBe('pages');
  });
});

describe('fuzzyMatch', () => {
  it('returns null for an empty query', () => {
    expect(fuzzyMatch('', 'Events')).toBeNull();
  });

  it('returns null when the query is longer than the text', () => {
    expect(fuzzyMatch('events!', 'events')).toBeNull();
  });

  it('returns null when the subsequence cannot be found', () => {
    expect(fuzzyMatch('xyz', 'hello')).toBeNull();
  });

  it('scores an exact prefix in the 1000s, case-insensitively', () => {
    const lower = fuzzyMatch('eve', 'events');
    const upper = fuzzyMatch('EVE', 'events');
    expect(lower).toEqual({ score: 1000 - 'events'.length * 0.5, ranges: [{ start: 0, end: 3 }] });
    expect(upper).toEqual(lower);
  });

  it('scores a word-start hit in the 700s with the hit offset', () => {
    const match = fuzzyMatch('world', 'hello world');
    expect(match).not.toBeNull();
    expect(match!.ranges).toEqual([{ start: 6, end: 11 }]);
    expect(match!.score).toBeCloseTo(750 - 6 * 2 - 'hello world'.length * 0.5, 10);
  });

  it('scores a scattered subsequence in the 500s with merged ranges', () => {
    const match = fuzzyMatch('hlo', 'hello');
    expect(match).not.toBeNull();
    // h@0, l@2, o@4 -> three single-char ranges; gaps = 2.
    expect(match!.ranges).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
    expect(match!.score).toBeCloseTo(500 - 0 * 2 - 2 * 8 - 'hello'.length * 0.5, 10);
  });

  it('merges adjacent subsequence hits into one range', () => {
    const match = fuzzyMatch('helo', 'hello world');
    expect(match).not.toBeNull();
    // h@0 e@1 l@2 o@4 -> [{0,3},{4,5}]
    expect(match!.ranges).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 5 },
    ]);
  });

  it('ranks exact-prefix above word-start above scattered', () => {
    const prefix = fuzzyMatch('eve', 'events')!.score;
    const wordStart = fuzzyMatch('eve', 'an eve thing')!.score;
    const scattered = fuzzyMatch('eve', 'x e vex')!.score;
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(scattered);
  });

  it('prefers tighter gaps and shorter labels', () => {
    expect(fuzzyMatch('ac', 'abc')!.score).toBeGreaterThan(fuzzyMatch('ac', 'axxxxxc')!.score);
    expect(fuzzyMatch('ab', 'ab')!.score).toBeGreaterThan(fuzzyMatch('ab', 'ab long label here')!.score);
  });
});

describe('matchItem', () => {
  it('returns null for blank queries', () => {
    expect(matchItem('   ', item())).toBeNull();
  });

  it('matches the label and reports label ranges', () => {
    const scored = matchItem('abo', item({ label: 'About', sublabel: 'PAGE · /' }));
    expect(scored).not.toBeNull();
    expect(scored!.labelRanges).toEqual([{ start: 0, end: 3 }]);
    expect(scored!.subRanges).toEqual([]);
  });

  it('matches the sublabel only and reports sub ranges', () => {
    const scored = matchItem('page', item({ label: 'About', sublabel: 'PAGE · /' }));
    expect(scored).not.toBeNull();
    expect(scored!.labelRanges).toEqual([]);
    expect(scored!.subRanges).toEqual([{ start: 0, end: 4 }]);
  });

  it('splits a range that spans the label/sublabel boundary', () => {
    // combined = 'ab cd'; subsequence a@0 b@1 c@3 d@4.
    const scored = matchItem('abcd', item({ label: 'ab', sublabel: 'cd' }));
    expect(scored).not.toBeNull();
    expect(scored!.labelRanges).toEqual([{ start: 0, end: 2 }]);
    expect(scored!.subRanges).toEqual([{ start: 0, end: 2 }]);
  });

  it('returns null when there is no match', () => {
    expect(matchItem('zzz', item())).toBeNull();
  });
});

describe('searchPalette', () => {
  const staticItems = buildStaticIndex();

  function remoteEvent(id: string, startsAt: string): SearchItem {
    return { id, domain: 'events', label: `Event ${id}`, sublabel: 'OPEN', href: `/registrations/${id}`, startsAt };
  }

  it('empty query returns pages plus the 3 most recent events, newest first', () => {
    const remote = [
      remoteEvent('a', '2025-01-01T10:00:00.000Z'),
      remoteEvent('b', '2026-03-01T10:00:00.000Z'),
      remoteEvent('c', '2025-06-01T10:00:00.000Z'),
      remoteEvent('d', '2026-01-15T10:00:00.000Z'),
    ];
    const groups = searchPalette('  ', staticItems, remote);
    expect(groups.map((g) => g.domain)).toEqual(['pages', 'events']);
    expect(groups[0].heading).toBe('PAGES');
    expect(groups[0].results).toHaveLength(6);
    expect(groups[1].heading).toBe('EVENTS');
    expect(groups[1].results.map((r) => r.item.id)).toEqual(['b', 'd', 'c']);
    for (const r of groups[1].results) {
      expect(r.score).toBe(0);
      expect(r.labelRanges).toEqual([]);
    }
  });

  it('empty query with no remote items returns only the pages group', () => {
    const groups = searchPalette('', staticItems, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].domain).toBe('pages');
  });

  it('non-empty query returns groups in domain order, sorted by score desc', () => {
    const remote: SearchItem[] = [
      item({ id: 'media-1', domain: 'media', label: 'Bootcamp photos', sublabel: '10 ITEMS', href: '/media' }),
      item({ id: 'person-1', domain: 'people', label: 'Bootcamp lead', sublabel: 'Mentor', href: '/#people' }),
      item({ id: 'event-1', domain: 'events', label: 'Bootcamp', sublabel: 'OPEN', href: '/registrations/x' }),
    ];
    const groups = searchPalette('bootcamp', staticItems, remote);
    expect(groups.map((g) => g.domain)).toEqual(['events', 'people', 'media']);
    for (const group of groups) {
      const scores = group.results.map((r) => r.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });

  it('caps each domain group at 8 results', () => {
    const remote: SearchItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `media-${i}`,
      domain: 'media' as const,
      label: `Album thing ${i}`,
      sublabel: '1 ITEM',
      href: '/media',
    }));
    const groups = searchPalette('thing', [], remote);
    expect(groups).toHaveLength(1);
    expect(groups[0].results).toHaveLength(8);
  });

  it('returns no groups when nothing matches', () => {
    expect(searchPalette('zzz-no-match', staticItems, [])).toEqual([]);
  });
});

describe('ensureRemoteIndex', () => {
  function jsonResponder(handler: (url: string) => unknown) {
    return async (input: string | URL | Request): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const payload = handler(url);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      } as Response;
    };
  }

  const eventsPayload = {
    events: [
      {
        id: 'hack',
        title: 'Hack Night',
        starts_at: '2026-03-26T18:00:00.000Z',
        registration_open: true,
        spots_left: 50,
        capacity: 100,
      },
      {
        id: 'full',
        title: 'Full House',
        starts_at: 'not-a-date',
        registration_open: true,
        spots_left: 0,
        capacity: 30,
      },
      {
        id: 'closed',
        title: 'Old Talk',
        starts_at: '2025-01-01T10:00:00.000Z',
        registration_open: false,
        spots_left: null,
        capacity: null,
      },
    ],
  };

  const contentPayload = {
    sections: [],
    bearers: [
      { id: 'b1', name: 'Ada Lovelace', role: 'President', cohort: '2024' },
      { id: 'b2', name: 'Grace Hopper', role: 'Mentor' },
    ],
    achievements: [],
  };

  const mediaPayload = {
    albums: [
      { id: 'a1', title: 'Kickoff', items: [{ id: 'i1' }] },
      { id: 'a2', title: 'Finale', items: [{ id: 'i1' }, { id: 'i2' }] },
    ],
  };

  beforeEach(() => {
    clearSearchCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps events, people and media (covers private date/status formatting indirectly)', async () => {
    vi.stubGlobal(
      'fetch',
      jsonResponder((url) => {
        if (url === '/api/events') return eventsPayload;
        if (url === '/api/content') return contentPayload;
        return mediaPayload;
      }),
    );
    const index = await ensureRemoteIndex();
    expect(index).toHaveLength(3 + 2 + 2);

    const hack = index.find((i) => i.id === 'event-hack')!;
    expect(hack.label).toBe('Hack Night');
    expect(hack.sublabel).toBe('26 MAR 2026 · OPEN');
    expect(hack.href).toBe('/registrations/hack');

    // Invalid ISO date -> DATE TBC fallback; zero spots -> WAITLIST.
    const full = index.find((i) => i.id === 'event-full')!;
    expect(full.sublabel).toBe('DATE TBC · WAITLIST');

    const closed = index.find((i) => i.id === 'event-closed')!;
    expect(closed.sublabel).toBe('01 JAN 2025 · CLOSED');

    const ada = index.find((i) => i.id === 'person-b1')!;
    expect(ada.sublabel).toBe('President · Class of 2024');
    const grace = index.find((i) => i.id === 'person-b2')!;
    expect(grace.sublabel).toBe('Mentor');

    const one = index.find((i) => i.id === 'media-a1')!;
    expect(one.sublabel).toBe('1 ITEM');
    const many = index.find((i) => i.id === 'media-a2')!;
    expect(many.sublabel).toBe('2 ITEMS');
  });

  it('a failing source contributes nothing and the promise never rejects', async () => {
    vi.stubGlobal(
      'fetch',
      async (input: string | URL | Request): Promise<Response> => {
        const url = typeof input === 'string' ? input : '';
        if (url === '/api/events') throw new Error('down');
        const payload = url === '/api/content' ? contentPayload : mediaPayload;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(payload),
          json: async () => payload,
        } as Response;
      },
    );
    const index = await ensureRemoteIndex();
    expect(index.some((i) => i.domain === 'events')).toBe(false);
    expect(index.some((i) => i.domain === 'people')).toBe(true);
    expect(index.some((i) => i.domain === 'media')).toBe(true);
  });

  it('caches the remote index across calls', async () => {
    const spy = vi.fn(
      jsonResponder((url) => {
        if (url === '/api/events') return eventsPayload;
        if (url === '/api/content') return contentPayload;
        return mediaPayload;
      }),
    );
    vi.stubGlobal('fetch', spy);
    const first = await ensureRemoteIndex();
    const second = await ensureRemoteIndex();
    expect(second).toBe(first);
    // One fetch per source (events, content, media), then nothing.
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
