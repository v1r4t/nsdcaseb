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
      body: 'The National Student Data Corps (NSDC) at Amrita School of Engineering, Bengaluru is a student chapter of the NEBDHub\u2019s NSDC initiative \u2014 a community-developed programme that gives students resources and opportunities to learn data science in a community of support.\n\nOur mission is to foster innovation, collaboration and professional growth while addressing real-world challenges. Through workshops, hackathons and networking events we build technical skills and connect students with industry experts, aiming to create an ecosystem that prepares members for careers in data science.',
      sort_order: 10,
    },
    {
      key: 'origin',
      title: 'How we started',
      body: 'The chapter was founded in August 2024 as an institutional chapter of the National Student Data Corps \u2014 part of the Northeast Big Data Innovation Hub at Columbia University.\n\nIt began with four students \u2014 Manaswini Poluri, Anirudh S, Sajjad Shaik and Spoorthi M \u2014 who wanted a place on campus to actually work with data rather than only study it. From there it grew into a chapter running industry talks, cybersecurity sessions, a multi-module data science bootcamp and competitive hackathon teams.\n\nThe chapter is mentored by Dr. Peeta Basa Pati.',
      sort_order: 20,
    },
  ],
  bearers: [
    { id: 'bearer-b-parswanadh', name: 'Balcha Venkata Parswanadh', role: 'President', cohort: '2024', photo_url: null, sort_order: 10 },
    { id: 'bearer-aluvala-sai-vinya', name: 'Aluvala Sai Vinya', role: 'Vice President', cohort: '2024', photo_url: null, sort_order: 20 },
    { id: 'bearer-dhruva-vura', name: 'Dhruva Vura', role: 'Vice President', cohort: '2025', photo_url: null, sort_order: 30 },
    { id: 'bearer-k-shanmuga-priya', name: 'Konduru Shanmuga Priya', role: 'Treasurer', cohort: '2025', photo_url: null, sort_order: 40 },
    { id: 'bearer-babbitha-b', name: 'Bovilla Babitha', role: 'Head of Executives', cohort: '2025', photo_url: null, sort_order: 50 },
    { id: 'bearer-mentor-peeta', name: 'Dr. Peeta Basa Pati', role: 'Mentor', cohort: null, photo_url: null, sort_order: 60 },
  ],
  achievements: [
    { id: 'ach-hackathon-3rd', title: 'Third place at the IEEE-CIS Hackathon', description: 'Team NSDC placed third with Jadal \u2014 an agentic, physics-based system for canal water allocation in warabandi-style irrigation, built during the hackathon.', date: null, sort_order: 10 },
    { id: 'ach-bug-to-breach', title: 'BUG TO BREACH drew 190 students', description: 'A cybersecurity tech-talk event run with NEURON at the Bengaluru campus on 26 March 2026. Two sessions: "Hunting Fileless Malware with Memory Forensics" and "Behind the Firewall: The Hidden Attack" on SSRF, including a live HackTheBox forensics demo. Free to attend.', date: '2026-03-26', sort_order: 20 },
    { id: 'ach-nextmind-2', title: 'NextMind Meet 2.0 \u2014 industry talks and panel', description: 'The second edition of NextMind Meet brought Mr. Prashant Sharma (Senior Staff Engineer, Hinge Health) and Mr. Pradeek J (CTO, HappyFox) to campus for talks on AI in production and customer-service AI, followed by a panel discussion on bridging campus and industry.', date: '2025-10-18', sort_order: 30 },
    { id: 'ach-ai-house', title: 'Invited into the AI House Bangalore ecosystem', description: 'The team attended the launch of AI House Bangalore by HiDevs on 21 December 2025 \u2014 an initiative offering student communities event space, mentorship, industry connections and venture access \u2014 opening the door to future collaborations.', date: '2025-12-21', sort_order: 40 },
    { id: 'ach-bootcamp', title: 'Multi-module Data Science Bootcamp', description: 'A structured bootcamp run for members, delivered in modules and completed by participants through mid-2026.', date: '2026-07-01', sort_order: 50 },
    { id: 'ach-founded', title: 'Chapter founded at Amrita Bengaluru', description: 'NSDC Amrita Vishwa Vidyapeetham, Bengaluru was established in August 2024 as an institutional chapter of the National Student Data Corps.', date: '2024-08-01', sort_order: 60 },
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