/**
 * Unit tests for site/src/lib/search.ts.
 *
 * Covers the exported pure logic: buildStaticIndex, fuzzyMatch, matchItem,
 * searchPalette, and ensureRemoteIndex (with fetch stubbed) for every remote
 * source: events, projects, people and archive albums/items.
 *
 * NOTE: event date rendering lives in lib/events (formatEventDate, pinned to
 * Asia/Kolkata) and is exercised *indirectly* through ensureRemoteIndex
 * sublabels below.
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
  it('returns the seven public pages in navigation order', () => {
    const index = buildStaticIndex();
    expect(index.map((i) => i.id)).toEqual([
      'page-about',
      'page-events',
      'page-projects',
      'page-archive',
      'page-people',
      'page-recruit',
      'page-login',
    ]);
    for (const entry of index) expect(entry.domain).toBe('pages');
    expect(index.map((i) => i.href)).toEqual([
      '/',
      '/registrations',
      '/projects',
      '/archive',
      '/#people',
      '/recruit',
      '/login',
    ]);
  });

  it('exposes synonyms as searchable keywords', () => {
    const index = buildStaticIndex();
    const archive = index.find((i) => i.id === 'page-archive')!;
    const people = index.find((i) => i.id === 'page-people')!;
    expect(archive.keywords).toContain('photos');
    expect(people.keywords).toContain('office bearers');
  });

  it('tags every page with the PAGE kind', () => {
    for (const entry of buildStaticIndex()) expect(entry.kind).toBe('PAGE');
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
    expect(match!.score).toBeCloseTo(500 - 2 * 8 - 'hello'.length * 0.5, 10);
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

  it('ranks an exact title above a prefix and a scattered match', () => {
    const exact = matchItem('hack', item({ id: 'exact', label: 'Hack' }))!;
    const prefix = matchItem('hack', item({ id: 'prefix', label: 'Hackathon' }))!;
    const scattered = matchItem('hack', item({ id: 'scattered', label: 'Pre-hack' }))!;
    expect(exact.score).toBeGreaterThan(prefix.score);
    expect(prefix.score).toBeGreaterThan(scattered.score);
    expect(exact.labelRanges).toEqual([{ start: 0, end: 4 }]);
  });

  it('ranks an exact role keyword above a partial role', () => {
    const president = matchItem(
      'president',
      item({
        id: 'president',
        domain: 'people',
        label: 'Ada Lovelace',
        sublabel: 'President',
        keywords: ['President'],
      }),
    )!;
    const vice = matchItem(
      'president',
      item({
        id: 'vice',
        domain: 'people',
        label: 'Grace Hopper',
        sublabel: 'Vice President',
        keywords: ['Vice President'],
      }),
    )!;
    expect(president.score).toBeGreaterThan(vice.score);
  });

  it('highlights a keyword hit inside the sublabel', () => {
    const scored = matchItem(
      'president',
      item({
        domain: 'people',
        label: 'Ada Lovelace',
        sublabel: 'President · Class of 2024',
        keywords: ['President'],
      }),
    )!;
    expect(scored.labelRanges).toEqual([]);
    expect(scored.subRanges).toEqual([{ start: 0, end: 9 }]);
  });

  it('matches keywords that are absent from the visible text', () => {
    const scored = matchItem(
      'python',
      item({
        domain: 'projects',
        label: 'Jadal',
        sublabel: 'SHIPPED',
        keywords: ['Python'],
      }),
    );
    expect(scored).not.toBeNull();
    expect(scored!.subRanges).toEqual([]);
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
    expect(groups[0].results).toHaveLength(7);
    expect(groups[0].total).toBe(7);
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
      item({ id: 'media-1', domain: 'media', label: 'Bootcamp photos', sublabel: '10 ITEMS', href: '/archive' }),
      item({ id: 'person-1', domain: 'people', label: 'Bootcamp lead', sublabel: 'Mentor', href: '/#people' }),
      item({
        id: 'project-1',
        domain: 'projects',
        label: 'Bootcamp kit',
        sublabel: 'ACTIVE BUILD',
        href: '/projects/1',
      }),
      item({ id: 'event-1', domain: 'events', label: 'Bootcamp', sublabel: 'OPEN', href: '/registrations/x' }),
    ];
    const groups = searchPalette('bootcamp', staticItems, remote);
    expect(groups.map((g) => g.domain)).toEqual(['events', 'projects', 'people', 'media']);
    for (const group of groups) {
      const scores = group.results.map((r) => r.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });

  it('ranks an exact title first within its group', () => {
    const remote: SearchItem[] = [
      item({ id: 'prefix', domain: 'events', label: 'Hackathon', sublabel: 'OPEN' }),
      item({ id: 'exact', domain: 'events', label: 'Hack', sublabel: 'OPEN' }),
      item({ id: 'inner', domain: 'events', label: 'Pre-hack', sublabel: 'OPEN' }),
    ];
    const groups = searchPalette('hack', [], remote);
    expect(groups[0].results.map((r) => r.item.id)).toEqual(['exact', 'prefix', 'inner']);
  });

  it('ranks an exact role first within people', () => {
    const remote: SearchItem[] = [
      item({
        id: 'vice',
        domain: 'people',
        label: 'Grace Hopper',
        sublabel: 'Vice President',
        keywords: ['Vice President'],
      }),
      item({
        id: 'president',
        domain: 'people',
        label: 'Ada Lovelace',
        sublabel: 'President',
        keywords: ['President'],
      }),
    ];
    const groups = searchPalette('president', [], remote);
    expect(groups[0].results.map((r) => r.item.id)).toEqual(['president', 'vice']);
  });

  it('uses the newest start to break a score tie between events', () => {
    const remote: SearchItem[] = [
      item({
        id: 'old',
        domain: 'events',
        label: 'Hack',
        sublabel: 'OPEN',
        startsAt: '2025-01-01T10:00:00.000Z',
      }),
      item({
        id: 'new',
        domain: 'events',
        label: 'Hack',
        sublabel: 'OPEN',
        startsAt: '2026-01-01T10:00:00.000Z',
      }),
    ];
    const groups = searchPalette('hack', [], remote);
    expect(groups[0].results.map((r) => r.item.id)).toEqual(['new', 'old']);
  });

  it('caps each domain group at 8 results but reports the full total', () => {
    const remote: SearchItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `media-${i}`,
      domain: 'media' as const,
      label: `Album thing ${i}`,
      sublabel: '1 ITEM',
      href: '/archive',
    }));
    const groups = searchPalette('thing', [], remote);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(12);
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

  const projectsPayload = {
    projects: [
      {
        id: 'jadal',
        title: 'Jadal',
        summary: 'Canal water allocation for warabandi irrigation',
        description: 'An agentic, physics-based system.',
        stack: ['Python', 'Agents'],
        url: null,
        cover_url: null,
        status: 'shipped',
        event_id: null,
        author: 'Team NSDC',
        featured: true,
        sort_order: 10,
      },
      {
        id: 'nextmind',
        title: 'NextMind Kit',
        summary: '',
        description: '',
        stack: [],
        url: null,
        cover_url: null,
        status: 'active',
        event_id: null,
        author: '',
        featured: false,
        sort_order: 20,
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
      {
        id: 'a1',
        title: 'Kickoff',
        description: 'First meet of the year',
        items: [
          { id: 'i1', type: 'image', url: 'https://example.com/1.jpg', title: 'Opening night', caption: 'Doors open' },
          { id: 'i2', type: 'image', url: 'https://example.com/2.jpg', title: '', caption: '' },
        ],
      },
      {
        id: 'a2',
        title: 'Finale',
        description: '',
        items: [
          { id: 'i1', type: 'video', url: 'https://youtu.be/demo', title: 'Demo day', caption: '' },
        ],
      },
    ],
  };

  beforeEach(() => {
    clearSearchCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respondAll(url: string): unknown {
    if (url === '/api/events') return eventsPayload;
    if (url === '/api/projects') return projectsPayload;
    if (url === '/api/content') return contentPayload;
    return mediaPayload;
  }

  it('maps events, projects, people and archive albums/items', async () => {
    vi.stubGlobal('fetch', jsonResponder(respondAll));
    const index = await ensureRemoteIndex();
    // 3 events + 2 projects + 2 people + (2 albums + 2 titled items).
    expect(index).toHaveLength(11);

    const hack = index.find((i) => i.id === 'event-hack')!;
    expect(hack.label).toBe('Hack Night');
    expect(hack.sublabel).toBe('26 MAR 2026 · OPEN');
    expect(hack.href).toBe('/registrations/hack');
    expect(hack.kind).toBe('EVENT');

    // Invalid ISO date -> DATE TBC fallback; zero spots -> WAITLIST.
    const full = index.find((i) => i.id === 'event-full')!;
    expect(full.sublabel).toBe('DATE TBC · WAITLIST');

    const closed = index.find((i) => i.id === 'event-closed')!;
    expect(closed.sublabel).toBe('01 JAN 2025 · CLOSED');

    const ada = index.find((i) => i.id === 'person-b1')!;
    expect(ada.sublabel).toBe('President · Class of 2024');
    expect(ada.keywords).toContain('President');
    const grace = index.find((i) => i.id === 'person-b2')!;
    expect(grace.sublabel).toBe('Mentor');

    const jadal = index.find((i) => i.id === 'project-jadal')!;
    expect(jadal.label).toBe('Jadal');
    expect(jadal.sublabel).toBe('SHIPPED · PYTHON · AGENTS');
    expect(jadal.href).toBe('/projects/jadal');
    expect(jadal.keywords).toContain('Canal water allocation for warabandi irrigation');
    expect(jadal.keywords).toContain('Team NSDC');
    const nextmind = index.find((i) => i.id === 'project-nextmind')!;
    expect(nextmind.sublabel).toBe('ACTIVE BUILD');

    const album = index.find((i) => i.id === 'media-a1')!;
    expect(album.label).toBe('Kickoff');
    expect(album.sublabel).toBe('2 ITEMS');
    expect(album.keywords).toContain('Opening night');

    const photo = index.find((i) => i.id === 'media-item-a1-i1')!;
    expect(photo.label).toBe('Opening night');
    expect(photo.sublabel).toBe('PHOTO · Kickoff');
    expect(photo.keywords).toContain('Doors open');
    const video = index.find((i) => i.id === 'media-item-a2-i1')!;
    expect(video.sublabel).toBe('VIDEO · Finale');

    // Untitled, uncaptioned frames are skipped; the album is enough.
    expect(index.some((i) => i.id === 'media-item-a1-i2')).toBe(false);
  });

  it('a failing source contributes nothing and the promise never rejects', async () => {
    vi.stubGlobal(
      'fetch',
      async (input: string | URL | Request): Promise<Response> => {
        const url = typeof input === 'string' ? input : '';
        if (url === '/api/events') throw new Error('down');
        const payload = respondAll(url);
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
    expect(index.some((i) => i.domain === 'projects')).toBe(true);
    expect(index.some((i) => i.domain === 'people')).toBe(true);
    expect(index.some((i) => i.domain === 'media')).toBe(true);
  });

  it('caches the remote index across calls', async () => {
    const spy = vi.fn(jsonResponder(respondAll));
    vi.stubGlobal('fetch', spy);
    const first = await ensureRemoteIndex();
    const second = await ensureRemoteIndex();
    expect(second).toBe(first);
    // One fetch per source (events, projects, content, media), then nothing.
    expect(spy).toHaveBeenCalledTimes(4);
  });
});
