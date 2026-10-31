/**
 * Search index + fuzzy matcher for the ⌘K command palette.
 *
 * Static pages resolve synchronously via `buildStaticIndex()`. Events,
 * projects, people and media are fetched lazily the first time the palette
 * opens (never on page load) through `ensureRemoteIndex()`, cached in module
 * state, and a failing source simply contributes nothing.
 *
 * The matcher is dependency-free: a case-insensitive subsequence match over
 * the label, sublabel and any extra keywords. Exact title/role matches rank
 * first, then prefix > word-start > scattered subsequence, with a small bonus
 * for shorter labels. It returns matched index ranges so the UI can highlight
 * hits in both the label and its metadata line.
 */

import { fetchContent } from './content';
import { formatEventDate, listEvents } from './events';
import type { EventSummary } from './events';
import { listMedia } from './media';
import { listProjects } from './projects';
import type { ProjectStatus } from './projects';

/** DOM events the palette listens for (dispatched by whoever mounts it). */
export const OPEN_PALETTE_EVENT = 'nsdc:open-palette';
export const CLOSE_PALETTE_EVENT = 'nsdc:close-palette';

export function openPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}

export function closePalette(): void {
  window.dispatchEvent(new CustomEvent(CLOSE_PALETTE_EVENT));
}

export type SearchDomain = 'pages' | 'events' | 'projects' | 'people' | 'media';

/** Group order the palette renders. */
export const DOMAIN_ORDER: readonly SearchDomain[] = [
  'pages',
  'events',
  'projects',
  'people',
  'media',
];

export const DOMAIN_HEADINGS: Record<SearchDomain, string> = {
  pages: 'PAGES',
  events: 'EVENTS',
  projects: 'PROJECTS',
  people: 'PEOPLE',
  media: 'ARCHIVE',
};

/** Small badge shown beside a result; media distinguishes albums from items. */
export type SearchKind = 'PAGE' | 'EVENT' | 'PROJECT' | 'PERSON' | 'ALBUM' | 'PHOTO' | 'VIDEO';

export interface SearchItem {
  id: string;
  domain: SearchDomain;
  /** Optional badge override; the palette falls back to the domain default. */
  kind?: SearchKind;
  label: string;
  /** Metadata line: page path, date · status, role · class, stack, item count. */
  sublabel: string;
  href: string;
  /**
   * Extra terms that should match without being part of the visible label or
   * sublabel — e.g. a person's role, a project's stack/author, page synonyms.
   */
  keywords?: string[];
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
  /** Number of matches before the per-group cap; lets the UI show "8 / 12". */
  total: number;
  results: ScoredResult[];
}

/** Cap per domain so keyboard navigation stays sane on large indexes. */
const MAX_PER_GROUP = 8;

// Field weighting ------------------------------------------------------------

/** A visible label hit outranks the same hit in metadata. */
const LABEL_FIELD_BONUS = 100;
/** An exact title always sits above prefix/role matches. */
const EXACT_LABEL_BONUS = 2500;
/** "President" should find the President before a Vice President. */
const EXACT_KEYWORD_BONUS = 900;

// Static index ---------------------------------------------------------------

export function buildStaticIndex(): SearchItem[] {
  return [
    {
      id: 'page-about',
      domain: 'pages',
      kind: 'PAGE',
      label: 'About',
      sublabel: 'PAGE · /',
      href: '/',
      keywords: ['home', 'club', 'mission'],
    },
    {
      id: 'page-events',
      domain: 'pages',
      kind: 'PAGE',
      label: 'Events',
      sublabel: 'PAGE · /REGISTRATIONS',
      href: '/registrations',
      keywords: ['registrations', 'calendar', 'upcoming'],
    },
    {
      id: 'page-projects',
      domain: 'pages',
      kind: 'PAGE',
      label: 'Projects',
      sublabel: 'PAGE · /PROJECTS',
      href: '/projects',
      keywords: ['builds', 'student work', 'portfolio'],
    },
    {
      id: 'page-archive',
      domain: 'pages',
      kind: 'PAGE',
      label: 'Archive',
      sublabel: 'PAGE · /ARCHIVE',
      href: '/archive',
      keywords: ['media', 'photos', 'gallery'],
    },
    {
      id: 'page-people',
      domain: 'pages',
      kind: 'PAGE',
      label: 'People',
      sublabel: 'PAGE · /#PEOPLE',
      href: '/#people',
      keywords: ['team', 'board', 'office bearers', 'members'],
    },
    {
      id: 'page-recruit',
      domain: 'pages',
      kind: 'PAGE',
      label: 'Recruit',
      sublabel: 'PAGE · /RECRUIT',
      href: '/recruit',
      keywords: ['join', 'membership', 'apply'],
    },
    {
      id: 'page-login',
      domain: 'pages',
      kind: 'PAGE',
      label: 'Sign in',
      sublabel: 'PAGE · /LOGIN',
      href: '/login',
      keywords: ['login', 'account'],
    },
  ];
}

// Remote index (lazy, cached, failure-tolerant) --------------------------------

function nonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text.length > 0) seen.add(text);
  }
  return [...seen];
}

function eventStatusWord(event: EventSummary): string {
  if (!event.registration_open) return 'CLOSED';
  if (event.spots_left !== null && event.spots_left <= 0) return 'WAITLIST';
  if (event.spots_left !== null && event.spots_left <= 5) return 'FILLING FAST';
  return 'OPEN';
}

/** IST event date for palette sublabels; invalid ISO stays 'DATE TBC'. */
function eventSublabelDate(iso: string): string {
  if (Number.isNaN(Date.parse(iso))) return 'DATE TBC';
  return formatEventDate(iso);
}

async function loadEventItems(): Promise<SearchItem[]> {
  const { events } = await listEvents();
  return events.map((event) => ({
    id: `event-${event.id}`,
    domain: 'events' as const,
    kind: 'EVENT' as const,
    label: event.title,
    sublabel: `${eventSublabelDate(event.starts_at)} · ${eventStatusWord(event)}`,
    href: `/registrations/${encodeURIComponent(event.id)}`,
    keywords: nonEmpty([event.description]),
    startsAt: event.starts_at,
  }));
}

const PROJECT_STATUS_WORD: Record<ProjectStatus, string> = {
  active: 'ACTIVE BUILD',
  shipped: 'SHIPPED',
  archived: 'ARCHIVED',
};

async function loadProjectItems(): Promise<SearchItem[]> {
  const { projects } = await listProjects();
  return projects.map((project) => {
    const stack = nonEmpty(Array.isArray(project.stack) ? project.stack : []).map((tech) =>
      tech.toUpperCase(),
    );
    const status = PROJECT_STATUS_WORD[project.status] ?? 'PROJECT';
    return {
      id: `project-${project.id}`,
      domain: 'projects' as const,
      kind: 'PROJECT' as const,
      label: project.title,
      sublabel: [status, ...stack.slice(0, 2)].join(' · '),
      href: `/projects/${encodeURIComponent(project.id)}`,
      keywords: nonEmpty([project.summary, project.author, ...stack, status]),
    };
  });
}

async function loadPeopleItems(): Promise<SearchItem[]> {
  // fetchContent() never rejects (falls back to placeholder copy), but a
  // failing source must never block the palette, so guard regardless.
  const content = await fetchContent();
  return content.bearers.map((bearer) => ({
    id: `person-${bearer.id}`,
    domain: 'people' as const,
    kind: 'PERSON' as const,
    label: bearer.name,
    sublabel: bearer.cohort ? `${bearer.role} · Class of ${bearer.cohort}` : bearer.role,
    href: '/#people',
    keywords: nonEmpty([
      bearer.role,
      bearer.cohort,
      bearer.cohort ? `Class of ${bearer.cohort}` : null,
      ...bearer.links.map((link) => link.label),
    ]),
  }));
}

async function loadMediaItems(): Promise<SearchItem[]> {
  const { albums } = await listMedia();
  const items: SearchItem[] = [];

  for (const album of albums) {
    const media = Array.isArray(album.items) ? album.items : [];
    items.push({
      id: `media-${album.id}`,
      domain: 'media' as const,
      kind: 'ALBUM' as const,
      label: album.title,
      sublabel: `${media.length} ${media.length === 1 ? 'ITEM' : 'ITEMS'}`,
      href: '/archive',
      keywords: nonEmpty([album.description, ...media.flatMap((item) => [item.title, item.caption])]),
    });

    for (const mediaItem of media) {
      const title = typeof mediaItem.title === 'string' ? mediaItem.title.trim() : '';
      const caption = typeof mediaItem.caption === 'string' ? mediaItem.caption.trim() : '';
      // Untitled, uncaptioned frames add noise; the album itself is indexed.
      if (title.length === 0 && caption.length === 0) continue;
      const video = mediaItem.type === 'video';
      items.push({
        id: `media-item-${album.id}-${mediaItem.id}`,
        domain: 'media' as const,
        kind: video ? ('VIDEO' as const) : ('PHOTO' as const),
        label: title || caption,
        sublabel: `${video ? 'VIDEO' : 'PHOTO'} · ${album.title}`,
        href: '/archive',
        keywords: nonEmpty([album.title, title.length > 0 ? caption : '', mediaItem.type]),
      });
    }
  }

  return items;
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
 * Fetch events + projects + people + media once, cache in module state,
 * resolve to `[]` per failed source. Never rejects.
 */
export function ensureRemoteIndex(): Promise<SearchItem[]> {
  if (remoteCache) return Promise.resolve(remoteCache);
  if (inflight) return inflight;
  inflight = Promise.all([
    loadSource(loadEventItems),
    loadSource(loadProjectItems),
    loadSource(loadPeopleItems),
    loadSource(loadMediaItems),
  ])
    .then(([events, projects, people, media]) => {
      remoteCache = [...events, ...projects, ...people, ...media];
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

interface MatchCandidate {
  score: number;
  labelRanges: MatchRange[];
  subRanges: MatchRange[];
}

/** Split a combined `label + sublabel` hit back into per-field ranges. */
function splitCombinedRanges(ranges: MatchRange[], labelLength: number) {
  const labelRanges: MatchRange[] = [];
  const subRanges: MatchRange[] = [];
  const boundary = labelLength;
  for (const range of ranges) {
    if (range.start < boundary) {
      labelRanges.push({ start: range.start, end: Math.min(range.end, boundary) });
    }
    if (range.end > boundary + 1) {
      subRanges.push({
        start: Math.max(range.start, boundary + 1) - (boundary + 1),
        end: range.end - (boundary + 1),
      });
    }
  }
  return { labelRanges, subRanges };
}

/**
 * Match one item over its label, sublabel and keywords, keeping the highest
 * scoring interpretation. Exact titles beat everything; an exact keyword
 * (e.g. a person's role) beats a partial mention of the same word. Ranges are
 * reported against the field that produced the winning match so the palette
 * can highlight label and metadata hits separately.
 */
export function matchItem(query: string, item: SearchItem): ScoredResult | null {
  const q = query.trim();
  if (q.length === 0) return null;
  const lower = q.toLowerCase();
  const candidates: MatchCandidate[] = [];

  const labelMatch = fuzzyMatch(q, item.label);
  if (labelMatch) {
    candidates.push({
      score:
        labelMatch.score +
        LABEL_FIELD_BONUS +
        (item.label.toLowerCase() === lower ? EXACT_LABEL_BONUS : 0),
      labelRanges: labelMatch.ranges,
      subRanges: [],
    });
  }

  const subMatch = fuzzyMatch(q, item.sublabel);
  if (subMatch) {
    candidates.push({ score: subMatch.score, labelRanges: [], subRanges: subMatch.ranges });
  }

  for (const keyword of item.keywords ?? []) {
    const text = keyword.trim();
    if (text.length === 0) continue;
    const match = fuzzyMatch(q, text);
    if (!match) continue;
    // Highlight the keyword in the metadata line when it appears verbatim
    // there (roles, stacks); otherwise it is a searchable-only synonym.
    const at = item.sublabel.toLowerCase().indexOf(text.toLowerCase());
    candidates.push({
      score: match.score + (text.toLowerCase() === lower ? EXACT_KEYWORD_BONUS : 0),
      labelRanges: [],
      subRanges: at === -1 ? [] : [{ start: at, end: at + text.length }],
    });
  }

  // Cross-boundary typo-tolerance: a hit spanning label + sublabel still works.
  const combined = fuzzyMatch(q, `${item.label} ${item.sublabel}`);
  if (combined) {
    const split = splitCombinedRanges(combined.ranges, item.label.length);
    candidates.push({ score: combined.score, ...split });
  }

  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const candidate of candidates) {
    if (candidate.score > best.score) best = candidate;
  }
  return { item, score: best.score, labelRanges: best.labelRanges, subRanges: best.subRanges };
}

// Query ------------------------------------------------------------------------

function unscored(item: SearchItem): ScoredResult {
  return { item, score: 0, labelRanges: [], subRanges: [] };
}

/** Date.parse with an invalid/missing value sorted last instead of NaN. */
function timeValue(iso: string | undefined): number {
  if (!iso) return 0;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? 0 : time;
}

function recentEvents(remote: SearchItem[]): ScoredResult[] {
  return remote
    .filter((item) => item.domain === 'events' && timeValue(item.startsAt) > 0)
    .sort((a, b) => timeValue(b.startsAt) - timeValue(a.startsAt))
    .slice(0, 3)
    .map(unscored);
}

/** Score desc, then shorter label, then newest start, then alphabetical. */
function compareResults(a: ScoredResult, b: ScoredResult): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.item.label.length !== b.item.label.length) {
    return a.item.label.length - b.item.label.length;
  }
  const recency = timeValue(b.item.startsAt) - timeValue(a.item.startsAt);
  if (recency !== 0) return recency;
  return a.item.label.localeCompare(b.item.label);
}

/**
 * Empty query → static pages plus the 3 most recent events. Otherwise fuzzy
 * match everything and return non-empty groups in DOMAIN_ORDER, each sorted
 * by score (ties: shorter label, then newest event) and capped at
 * MAX_PER_GROUP while reporting the uncapped total.
 */
export function searchPalette(query: string, staticItems: SearchItem[], remoteItems: SearchItem[]): SearchGroup[] {
  if (query.trim().length === 0) {
    const groups: SearchGroup[] = [];
    if (staticItems.length > 0) {
      groups.push({
        domain: 'pages',
        heading: DOMAIN_HEADINGS.pages,
        total: staticItems.length,
        results: staticItems.map(unscored),
      });
    }
    const recent = recentEvents(remoteItems);
    if (recent.length > 0) {
      groups.push({
        domain: 'events',
        heading: DOMAIN_HEADINGS.events,
        total: recent.length,
        results: recent,
      });
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
    results.sort(compareResults);
    groups.push({
      domain,
      heading: DOMAIN_HEADINGS[domain],
      total: results.length,
      results: results.slice(0, MAX_PER_GROUP),
    });
  }
  return groups;
}
