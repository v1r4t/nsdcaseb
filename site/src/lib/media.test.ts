import { describe, expect, it } from 'vitest';
import { archiveSlides } from './media';
import type { MediaAlbum } from './media';

function album(overrides: Partial<MediaAlbum> = {}): MediaAlbum {
  return {
    id: 'a1',
    title: 'NextMind Meet 2.0',
    description: '',
    cover_url: null,
    event_id: 'evt-nextmind-2',
    sort_order: 0,
    items: [],
    ...overrides,
  };
}

function image(
  id: string,
  url = `https://example.com/${id}.jpg`,
  variants: { thumb: string; full: string } | null = null,
) {
  return { id, type: 'image' as const, url, title: `Photo ${id}`, caption: '', sort_order: 0, variants };
}

describe('archiveSlides', () => {
  it('caps each album at six images', () => {
    const items = Array.from({ length: 9 }, (_, i) => image(`p${i}`));
    const slides = archiveSlides([album({ items })]);
    expect(slides).toHaveLength(6);
    expect(slides.map((s) => s.url)).toEqual(items.slice(0, 6).map((i) => i.url));
  });

  it('keeps the album title and event id for captions', () => {
    const [slide] = archiveSlides([album({ items: [image('p1')] })]);
    expect(slide.albumTitle).toBe('NextMind Meet 2.0');
    expect(slide.eventId).toBe('evt-nextmind-2');
  });

  it('skips videos and empty urls', () => {
    const slides = archiveSlides([
      album({
        items: [
          { ...image('video'), type: 'video' },
          image('empty', ''),
          image('ok'),
        ],
      }),
    ]);
    expect(slides.map((s) => s.url)).toEqual(['https://example.com/ok.jpg']);
  });

  it('concatenates multiple albums in album order', () => {
    const slides = archiveSlides([
      album({ id: 'a1', title: 'One', items: [image('one')] }),
      album({ id: 'a2', title: 'Two', items: [image('two')] }),
    ]);
    expect(slides.map((s) => s.albumTitle)).toEqual(['One', 'Two']);
  });

  it('carries upload variants through to the carousel', () => {
    const variants = { thumb: 'https://cdn.example/t.webp', full: 'https://cdn.example/f.webp' };
    const [slide] = archiveSlides([
      album({ items: [image('p1', 'https://cdn.example/p1.webp', variants)] }),
    ]);
    expect(slide.variants).toEqual(variants);
  });

  it('leaves variants null for URL-based items', () => {
    const [slide] = archiveSlides([album({ items: [image('p1')] })]);
    expect(slide.variants).toBeNull();
  });
});
