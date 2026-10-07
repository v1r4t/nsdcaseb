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
      body: 'NSDC is Amrita\u2019s student-run data club \u2014 short for the National Student Data Corps chapter on our campus. We meet every week for hands-on sessions on Python, machine learning, and data visualisation, plus monthly project nights where small teams ship something real.\n\nNo experience needed and all branches are welcome. Most members joined knowing only a little Python; the sessions, peer mentors, and project nights do the rest.',
      sort_order: 10,
    },
    {
      key: 'origin',
      title: 'How we started',
      body: 'NSDC started in early 2024, when a handful of juniors realised their data science courses were all theory and no datasets. They booked the hostel common room, put up a handwritten poster, and nine people showed up for the first meetup \u2014 a messy, wonderful evening of installing pandas together.\n\nWord spread. The common-room meetups became weekly workshops, the workshops gained project nights, and by the end of the year the club was running events for hundreds of students across branches.',
      sort_order: 20,
    },
  ],
  bearers: [
    { id: 'bearer-b-parswanadh', name: 'B Parswanadh', role: 'President', cohort: '2024', photo_url: null, sort_order: 10 },
    { id: 'bearer-aluvala-sai-vinya', name: 'Aluvala Sai Vinya', role: 'Vice President', cohort: '2024', photo_url: null, sort_order: 20 },
    { id: 'bearer-dhruva-vura', name: 'Dhruva Vura', role: 'Vice President', cohort: '2025', photo_url: null, sort_order: 30 },
    { id: 'bearer-k-shanmuga-priya', name: 'K Shanmuga Priya', role: 'Treasurer', cohort: '2025', photo_url: null, sort_order: 40 },
    { id: 'bearer-babbitha-b', name: 'Babitha B', role: 'Head of Executives', cohort: '2025', photo_url: null, sort_order: 50 },
  ],
  achievements: [
    { id: 'achievement-sih-finalists', title: 'Smart India Hackathon finalists', description: 'Our six-member team reached the SIH grand finale with a crop-price forecasting tool for small farmers, built across three all-night project sessions.', date: '2024-12-18', sort_order: 10 },
    { id: 'achievement-ml-workshop', title: 'Intro-to-ML workshop draws 200+ students', description: 'A beginner-friendly Saturday workshop on scikit-learn filled the seminar hall, with peer mentors helping every attendee train their first classifier.', date: '2025-03-09', sort_order: 20 },
    { id: 'achievement-datathon-win', title: 'Inter-college datathon winners', description: 'Team NSDC took first place at the state inter-college datathon, predicting hostel energy use from two years of meter data.', date: '2025-10-12', sort_order: 30 },
    { id: 'achievement-open-source', title: '20+ open-source contributions shipped', description: 'Members landed more than twenty merged pull requests across pandas-adjacent libraries and data-for-good projects during the winter contribution drive.', date: '2026-01-25', sort_order: 40 },
    { id: 'achievement-fest-analytics', title: 'Analytics desk for the campus tech fest', description: 'The club ran a live footfall-and-feedback dashboard for the annual tech fest, used by organisers to schedule events across three days.', date: '2026-03-02', sort_order: 50 },
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