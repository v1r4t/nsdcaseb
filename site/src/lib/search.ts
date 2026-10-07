/**
 * Search index + fuzzy matcher for the ⌘K command palette.
 *
 * Static pages resolve synchronously via `buildStaticIndex()`. Events, people
 * and media are fetched lazily the first time the palette opens (never on page
 * load) through `ensureRemoteIndex()`, cached in module state, and a failing
 * source simply contributes nothing.
 *
 * The matcher is dependency-free: a case-insensitive subsequence match over
 * `label + sublabel`, scored exact-prefix > word-start > scattered
 * subsequence, with a small bonus for shorter labels. It returns matched
 * index ranges so the UI can highlight hits.
 */

import type { Role } from './api';
import { fetchContent } from './content';
import { listEvents } from './events';
import type { EventSummary } from './events';
import { listMedia } from './media';

/** DOM events the palette listens for (dispatched by whoever mounts it). */
export const OPEN_PALETTE_EVENT = 'nsdc:open-palette';
export const CLOSE_PALETTE_EVENT = 'nsdc:close-palette';

export function openPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}

export function closePalette(): void {
  window.dispatchEvent(new CustomEvent(CLOSE_PALETTE_EVENT));
}

export type SearchDomain = 'pages' | 'events' | 'people' | 'media';

/** Group order the palette renders. */
export const DOMAIN_ORDER: readonly SearchDomain[] = ['pages', 'events', 'people', 'media'];

export const DOMAIN_HEADINGS: Record<SearchDomain, string> = {
  pages: 'PAGES',
  events: 'EVENTS',
  people: 'PEOPLE',
  media: 'MEDIA',
};

export interface SearchItem {
  id: string;
  domain: SearchDomain;
  label: string;
  sublabel: string;
  href: string;
  /** ISO timestamp used for recency ranking (events). Absent = no recency. */
  startsAt?: string;
}

/** Half-open [start, end) offsets into a string. */
export interface MatchRange {
  start: number;
  end: number;
}

export interface ScoredResult {
  item: SearchItem;
  score: number;
  labelRanges: MatchRange[];
  subRanges: MatchRange[];
}

export interface SearchGroup {
  domain: SearchDomain;
  heading: string;
  results: ScoredResult[];
}

/** Cap per domain so keyboard navigation stays sane on large indexes. */
const MAX_PER_GROUP = 8;

// Static index ---------------------------------------------------------------

export function buildStaticIndex(role: Role | null | undefined): SearchItem[] {
  const pages: SearchItem[] = [
    { id: 'page-about', domain: 'pages', label: 'About', sublabel: 'PAGE · /', href: '/' },
    {
      id: 'page-events',
      domain: 'pages',
      label: 'Events',
      sublabel: 'PAGE · /REGISTRATIONS',
      href: '/registrations',
    },
    { id: 'page-media', domain: 'pages', label: 'Media', sublabel: 'PAGE · /MEDIA', href: '/media' },
    { id: 'page-people', domain: 'pages', label: 'People', sublabel: 'PAGE · /#PEOPLE', href: '/#people' },
    {
      id: 'page-archive',
      domain: 'pages',
      label: 'Archive',
      sublabel: 'PAGE · /REGISTRATIONS#ARCHIVE',
      href: '/registrations#archive',
    },
    { id: 'page-login', domain: 'pages', label: 'Sign in', sublabel: 'PAGE · /LOGIN', href: '/login' },
  ];
  if (role === 'admin') {
    pages.push({
      id: 'page-admin',
      domain: 'pages',
      label: 'Admin',
      sublabel: 'PAGE · /ADMIN',
      href: '/admin',
    });
  }
  return pages;
}

// Remote index (lazy, cached, failure-tolerant) --------------------------------

function formatEventDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'DATE TBC';
  return new Date(ms)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();
}

function eventStatusWord(event: EventSummary): string {
  if (!event.registration_open) return 'CLOSED';
  if (event.spots_left !== null && event.spots_left <= 0) return 'WAITLIST';
  if (event.spots_left !== null && event.spots_left <= 5) return 'FILLING FAST';
  return 'OPEN';
}

async function loadEventItems(): Promise<SearchItem[]> {
  const { events } = await listEvents();
  return events.map((event) => ({
    id: `event-${event.id}`,
    domain: 'events' as const,
    label: event.title,
    sublabel: `${formatEventDate(event.starts_at)} · ${eventStatusWord(event)}`,
    href: `/registrations/${encodeURIComponent(event.id)}`,
    startsAt: event.starts_at,
  }));
}

async function loadPeopleItems(): Promise<SearchItem[]> {
  // fetchContent() never rejects (falls back to placeholder copy), but a
  // failing source must never block the palette, so guard regardless.
  const content = await fetchContent();
  return content.bearers.map((bearer) => ({
    id: `person-${bearer.id}`,
    domain: 'people' as const,
    label: bearer.name,
    sublabel: bearer.cohort ? `${bearer.role} · Class of ${bearer.cohort}` : bearer.role,
    href: '/#people',
  }));
}

async function loadMediaItems(): Promise<SearchItem[]> {
  const { albums } = await listMedia();
  return albums.map((album) => ({
    id: `media-${album.id}`,
    domain: 'media' as const,
    label: album.title,
    sublabel: `${album.items.length} ${album.items.length === 1 ? 'ITEM' : 'ITEMS'}`,
    href: '/media',
  }));
}

/** One loader per source so a single failure cannot take down the others. */
async function loadSource(loader: () => Promise<SearchItem[]>): Promise<SearchItem[]> {
  try {
    return await loader();
  } catch {
    return [];
  }
}

let remoteCache: SearchItem[] | null = null;
let inflight: Promise<SearchItem[]> | null = null;

/**
 * Fetch events + people + media once, cache in module state, resolve to `[]`
 * per failed source. Never rejects.
 */
export function ensureRemoteIndex(): Promise<SearchItem[]> {
  if (remoteCache) return Promise.resolve(remoteCache);
  if (inflight) return inflight;
  inflight = Promise.all([loadSource(loadEventItems), loadSource(loadPeopleItems), loadSource(loadMediaItems)])
    .then(([events, people, media]) => {
      remoteCache = [...events, ...people, ...media];
      return remoteCache;
    })
    .catch(() => {
      // Unreachable in practice (loadSource never rejects); keep the contract.
      remoteCache = [];
      return remoteCache;
    });
  return inflight;
}

/** Test seam: drop the cached remote index. */
export function clearSearchCache(): void {
  remoteCache = null;
  inflight = null;
}

// Fuzzy matcher ----------------------------------------------------------------

function isWordChar(char: string): boolean {
  return /[a-z0-9]/i.test(char);
}

function mergeIndices(indices: number[]): MatchRange[] {
  const ranges: MatchRange[] = [];
  let start = indices[0];
  let prev = indices[0];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === prev + 1) {
      prev = indices[i];
    } else {
      ranges.push({ start, end: prev + 1 });
      start = indices[i];
      prev = indices[i];
    }
  }
  ranges.push({ start, end: prev + 1 });
  return ranges;
}

/**
 * Case-insensitive subsequence match. Scores exact-prefix (1000s) above
 * word-start (700s) above scattered subsequence (500s minus gap penalties),
 * with a small penalty for longer haystacks (shorter-label bonus).
 */
export function fuzzyMatch(query: string, text: string): { score: number; ranges: MatchRange[] } | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0 || q.length > t.length) return null;

  if (t.startsWith(q)) {
    return { score: 1000 - t.length * 0.5, ranges: [{ start: 0, end: q.length }] };
  }

  let from = 0;
  let wordStart = -1;
  for (;;) {
    const found = t.indexOf(q, from);
    if (found === -1) break;
    if (found === 0 || !isWordChar(t[found - 1])) {
      wordStart = found;
      break;
    }
    from = found + 1;
  }
  if (wordStart !== -1) {
    return { score: 750 - wordStart * 2 - t.length * 0.5, ranges: [{ start: wordStart, end: wordStart + q.length }] };
  }

  const indices: number[] = [];
  let cursor = 0;
  for (let i = 0; i < q.length; i++) {
    const found = t.indexOf(q[i], cursor);
    if (found === -1) return null;
    indices.push(found);
    cursor = found + 1;
  }
  let gaps = 0;
  for (let i = 1; i < indices.length; i++) gaps += indices[i] - indices[i - 1] - 1;
  return {
    score: 500 - indices[0] * 2 - gaps * 8 - t.length * 0.5,
    ranges: mergeIndices(indices),
  };
}

/** Match one item over `label + sublabel`, splitting ranges back per field. */
export function matchItem(query: string, item: SearchItem): ScoredResult | null {
  const q = query.trim();
  if (q.length === 0) return null;
  const combined = `${item.label} ${item.sublabel}`;
  const match = fuzzyMatch(q, combined);
  if (!match) return null;
  const labelRanges: MatchRange[] = [];
  const subRanges: MatchRange[] = [];
  const boundary = item.label.length;
  for (const range of match.ranges) {
    if (range.start < boundary) {
      labelRanges.push({ start: range.start, end: Math.min(range.end, boundary) });
    }
    if (range.end > boundary + 1) {
      subRanges.push({ start: Math.max(range.start, boundary + 1) - (boundary + 1), end: range.end - (boundary + 1) });
    }
  }
  return { item, score: match.score, labelRanges, subRanges };
}

// Query ------------------------------------------------------------------------

function unscored(item: SearchItem): ScoredResult {
  return { item, score: 0, labelRanges: [], subRanges: [] };
}

function recentEvents(remote: SearchItem[]): ScoredResult[] {
  return remote
    .filter((item) => item.domain === 'events')
    .sort((a, b) => Date.parse(b.startsAt ?? '') - Date.parse(a.startsAt ?? ''))
    .slice(0, 3)
    .map(unscored);
}

/**
 * Empty query → static pages plus the 3 most recent events. Otherwise fuzzy
 * match everything and return non-empty groups in DOMAIN_ORDER, each sorted
 * by score (ties: shorter label first) and capped at MAX_PER_GROUP.
 */
export function searchPalette(query: string, staticItems: SearchItem[], remoteItems: SearchItem[]): SearchGroup[] {
  if (query.trim().length === 0) {
    const groups: SearchGroup[] = [];
    if (staticItems.length > 0) {
      groups.push({ domain: 'pages', heading: DOMAIN_HEADINGS.pages, results: staticItems.map(unscored) });
    }
    const recent = recentEvents(remoteItems);
    if (recent.length > 0) {
      groups.push({ domain: 'events', heading: DOMAIN_HEADINGS.events, results: recent });
    }
    return groups;
  }

  const all = [...staticItems, ...remoteItems];
  const groups: SearchGroup[] = [];
  for (const domain of DOMAIN_ORDER) {
    const results: ScoredResult[] = [];
    for (const item of all) {
      if (item.domain !== domain) continue;
      const scored = matchItem(query, item);
      if (scored) results.push(scored);
    }
    if (results.length === 0) continue;
    results.sort((a, b) => b.score - a.score || a.item.label.length - b.item.label.length);
    groups.push({ domain, heading: DOMAIN_HEADINGS[domain], results: results.slice(0, MAX_PER_GROUP) });
  }
  return groups;
}
