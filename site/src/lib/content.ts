/**
 * Landing content client.
 *
 * The page must never render empty, so `fetchContent()` resolves with baked-in
 * placeholder copy on *any* failure: network down, 404 before the migration is
 * applied, malformed payload. The function never rejects -- callers can treat
 * the result as always-safe.
 *
 * Field names mirror the worker payload (snake_case) so there is no lossy
 * mapping layer between `worker/content.ts` and the page.
 */

export interface ContentSection {
  key: string;
  title: string;
  body: string;
  sort_order: number;
}

export interface OfficeBearer {
  id: string;
  name: string;
  role: string;
  cohort: string | null;
  photo_url: string | null;
  sort_order: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  date: string | null;
  sort_order: number;
}

export interface SiteContent {
  sections: ContentSection[];
  bearers: OfficeBearer[];
  achievements: Achievement[];
}

/** Treat as read-only: the same object is shared across every failed fetch. */
export const FALLBACK_CONTENT: SiteContent = {
  sections: [
    {
      key: 'about',
      title: 'About the club',
      body: '<!-- TODO(club): replace -->\n\nThis page is live, but the club copy has not been written yet. Check back once the executives have filled this in — meanwhile, come say hello at a session.',
      sort_order: 10,
    },
    {
      key: 'origin',
      title: 'How we started',
      body: '<!-- TODO(club): replace -->\n\nA few students wanted a place to learn data skills on real problems, so they started a club. The full story is being written.',
      sort_order: 20,
    },
  ],
  bearers: [
    { id: 'fallback-president', name: 'President (placeholder)', role: 'President', cohort: '2025–26', photo_url: null, sort_order: 10 },
    { id: 'fallback-secretary', name: 'Secretary (placeholder)', role: 'Secretary', cohort: '2025–26', photo_url: null, sort_order: 20 },
    { id: 'fallback-coordinator', name: 'Data Lead (placeholder)', role: 'Coordinator', cohort: '2025–26', photo_url: null, sort_order: 30 },
  ],
  achievements: [
    { id: 'fallback-achievement-1', title: 'Achievement (placeholder)', description: 'Replace this with something the club actually shipped.', date: null, sort_order: 10 },
    { id: 'fallback-achievement-2', title: 'Achievement (placeholder)', description: 'Replace this with something the club actually shipped.', date: null, sort_order: 20 },
  ],
};

/**
 * Keep only entries with the string fields the page actually renders, so a
 * half-written row cannot blank a section. Returns `null` when the list is
 * absent or not an array -- that means the payload is not ours.
 */
function pick<T>(value: unknown, isItem: (item: unknown) => boolean): T[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isItem) as T[];
}

function isSection(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const row = item as Record<string, unknown>;
  return typeof row.key === 'string' && typeof row.title === 'string' && typeof row.body === 'string';
}

function isBearer(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const row = item as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.name === 'string' && typeof row.role === 'string';
}

function isAchievement(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const row = item as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.title === 'string' && typeof row.description === 'string';
}

function normalize(payload: unknown): SiteContent {
  if (typeof payload !== 'object' || payload === null) return FALLBACK_CONTENT;
  const source = payload as Record<string, unknown>;

  const sections = pick<ContentSection>(source.sections, isSection);
  const bearers = pick<OfficeBearer>(source.bearers, isBearer);
  const achievements = pick<Achievement>(source.achievements, isAchievement);

  // A structurally broken payload falls back wholesale; an *empty* array is a
  // legitimate state the page renders as an empty message.
  if (!sections || !bearers || !achievements) return FALLBACK_CONTENT;

  return { sections, bearers, achievements };
}

/** GET /api/content, falling back to `FALLBACK_CONTENT` on any failure. */
export async function fetchContent(): Promise<SiteContent> {
  try {
    const response = await fetch('/api/content', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return FALLBACK_CONTENT;

    const payload: unknown = await response.json();
    return normalize(payload);
  } catch {
    // Offline, CORS, blocked request, or a proxy answering with HTML.
    return FALLBACK_CONTENT;
  }
}