import type { OfficeBearer } from './content';
import type { EventSummary } from './events';
import type { MediaAlbum } from './media';
import type { Project } from './projects';

export interface StoryFacts {
  /** `null` = not loaded or the content API fell back. */
  bearers: OfficeBearer[] | null;
  events: EventSummary[] | null;
  projects: Project[] | null;
  frames: number | null;
}

export interface RecordValue {
  label: string;
  value: string;
}

export interface RecordBand {
  key: 'founded' | 'network' | 'open';
  kicker: string;
  claim: string;
  values: RecordValue[];
  link: { label: string; to: string };
}

const DASH = '—';

/** Unknown is a dash, a real zero is `00`, and larger counts stay intact. */
function count(value: number | null): string {
  return value === null ? DASH : String(value).padStart(2, '0');
}

/**
 * The three record bands the landing story reads from. Pure: every ambiguity
 * (unknown vs empty, mentor vs office bearer) is resolved here and pinned by
 * tests, so the component only renders.
 */
export function buildRecord(facts: StoryFacts): RecordBand[] {
  const mentors = facts.bearers
    ? facts.bearers.filter((bearer) => /mentor/i.test(bearer.role)).length
    : null;
  const officeBearers = facts.bearers && mentors !== null ? facts.bearers.length - mentors : null;

  return [
    {
      key: 'founded',
      kicker: 'AUG 2024',
      claim: 'Chapter founded at Amrita, Bengaluru.',
      values: [{ label: 'MENTOR', value: count(mentors) }],
      link: { label: 'Join the corps →', to: '/recruit' },
    },
    {
      key: 'network',
      kicker: '2024—26',
      claim: 'The network.',
      values: [
        { label: 'OFFICE BEARERS', value: count(officeBearers) },
        { label: 'PROJECTS', value: count(facts.projects ? facts.projects.length : null) },
      ],
      link: { label: 'All projects →', to: '/projects' },
    },
    {
      key: 'open',
      kicker: 'NOW',
      claim: 'In the open.',
      values: [
        { label: 'EVENTS', value: count(facts.events ? facts.events.length : null) },
        { label: 'FRAMES FILED', value: count(facts.frames) },
      ],
      link: { label: 'Open the archive →', to: '/archive' },
    },
  ];
}

/** Every archived image with a real URL; `null` before the media fetch resolves. */
export function imageItemCount(albums: MediaAlbum[] | null): number | null {
  if (!albums) return null;
  let total = 0;
  for (const album of albums) {
    for (const item of album.items ?? []) {
      if (item.type === 'image' && typeof item.url === 'string' && item.url.length > 0) total += 1;
    }
  }
  return total;
}
