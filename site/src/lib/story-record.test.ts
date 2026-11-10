import { describe, expect, it } from 'vitest';
import { buildRecord, imageItemCount, type StoryFacts } from './story-record';
import type { OfficeBearer } from './content';
import type { EventSummary } from './events';
import type { MediaAlbum } from './media';
import type { Project } from './projects';

const bearer = (id: string, role: string): OfficeBearer => ({
  id, name: id, role, cohort: '2025', photo_url: null, links: [], sort_order: 1,
});
const event = { id: 'e1' } as EventSummary;
const project = { id: 'p1' } as Project;
const album = (types: Array<'image' | 'video'>, url = 'x'): MediaAlbum => ({
  id: 'a1', title: 'A', description: '', cover_url: null, event_id: null, sort_order: 1,
  items: types.map((type, i) => ({ id: `i${i}`, type, url, title: '', caption: '', sort_order: i })),
});

const facts = (overrides: Partial<StoryFacts> = {}): StoryFacts => ({
  bearers: [], events: [], projects: [], frames: 0, ...overrides,
});

describe('buildRecord', () => {
  it('renders an em dash for every value when all sources are unknown', () => {
    const bands = buildRecord({ bearers: null, events: null, projects: null, frames: null });
    expect(bands.flatMap((b) => b.values.map((v) => v.value))).toEqual(['—', '—', '—', '—', '—']);
  });

  it('counts the mentor once and excludes it from office bearers', () => {
    const bands = buildRecord(facts({ bearers: [bearer('pres', 'President'), bearer('ment', 'Mentor')] }));
    expect(bands[0].values).toEqual([{ label: 'MENTOR', value: '01' }]);
    expect(bands[1].values[0]).toEqual({ label: 'OFFICE BEARERS', value: '01' });
  });

  it('keeps zero distinct from unknown', () => {
    expect(buildRecord(facts())[2].values).toEqual([
      { label: 'EVENTS', value: '00' },
      { label: 'FRAMES FILED', value: '00' },
    ]);
    expect(buildRecord(facts({ frames: null }))[2].values[1].value).toBe('—');
  });

  it('pads counts to two digits and keeps larger numbers intact', () => {
    const bands = buildRecord(facts({ events: [event, event, event], projects: [project], frames: 190 }));
    expect(bands[1].values[1].value).toBe('01');
    expect(bands[2].values[0].value).toBe('03');
    expect(bands[2].values[1].value).toBe('190');
  });

  it('pins the three band keys and links in chapter order', () => {
    const bands = buildRecord(facts());
    expect(bands.map((b) => b.key)).toEqual(['founded', 'network', 'open']);
    expect(bands.map((b) => b.link.to)).toEqual(['/recruit', '/projects', '/archive']);
  });
});

describe('imageItemCount', () => {
  it('returns null before the media fetch resolves', () => {
    expect(imageItemCount(null)).toBeNull();
  });

  it('counts only image items with a non-empty url', () => {
    expect(imageItemCount([album(['image', 'video', 'image'], 'x'), album(['image'], '')])).toBe(2);
  });
});
