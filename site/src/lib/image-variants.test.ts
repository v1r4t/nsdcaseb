import { describe, expect, it } from 'vitest';
import {
  GALLERY_DIMENSION_STEPS,
  GALLERY_FULL_WIDTH,
  GALLERY_MIN_WIDTH,
  GALLERY_QUALITIES,
  GALLERY_SOURCE_MAX_BYTES,
  galleryCompressionPlan,
  galleryNeedsCompression,
  galleryPhotoFilename,
  GalleryPhotoError,
  generatePosterVariants,
  posterSources,
  posterVariantSrcSet,
  PosterVariantError,
  prepareGalleryPhoto,
  scaledSize,
} from './image-variants';

const variants = {
  thumb: 'https://cdn.example/events/e1/poster-thumb.webp',
  full: 'https://cdn.example/events/e1/poster-full.webp',
};

describe('scaledSize', () => {
  it('caps wide images at the target width, preserving aspect', () => {
    expect(scaledSize(3200, 1600, 640)).toEqual({ width: 640, height: 320 });
  });

  it('never upscales a small source', () => {
    expect(scaledSize(480, 270, 640)).toEqual({ width: 480, height: 270 });
  });

  it('keeps a ratio correct for tall posters', () => {
    expect(scaledSize(1000, 1500, 640)).toEqual({ width: 640, height: 960 });
  });
});

describe('posterVariantSrcSet', () => {
  it('emits 640w and 1600w candidates', () => {
    expect(posterVariantSrcSet(variants)).toBe(`${variants.thumb} 640w, ${variants.full} 1600w`);
  });

  it('is undefined without variants', () => {
    expect(posterVariantSrcSet(null)).toBeUndefined();
    expect(posterVariantSrcSet(undefined)).toBeUndefined();
  });
});

describe('posterSources', () => {
  it('returns null without a poster', () => {
    expect(posterSources(null, variants)).toBeNull();
    expect(posterSources('', variants)).toBeNull();
  });

  it('falls back to the original when an old poster has no variants', () => {
    expect(posterSources('https://cdn.example/events/e1/poster.webp', null)).toEqual({
      src: 'https://cdn.example/events/e1/poster.webp',
      srcSet: undefined,
    });
  });

  it('keeps the original as src and lists variants in srcSet', () => {
    expect(posterSources('https://cdn.example/events/e1/poster.webp', variants)).toEqual({
      src: 'https://cdn.example/events/e1/poster.webp',
      srcSet: posterVariantSrcSet(variants),
    });
  });
});

describe('generatePosterVariants', () => {
  it('rejects non-image input before touching canvas', async () => {
    const file = new Blob(['not an image'], { type: 'text/plain' });
    const err = await generatePosterVariants(file).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PosterVariantError);
    expect((err as PosterVariantError).code).toBe('not_an_image');
  });
});

describe('galleryNeedsCompression', () => {
  it('only compresses sources above the 10 MB cap', () => {
    expect(GALLERY_SOURCE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(galleryNeedsCompression(GALLERY_SOURCE_MAX_BYTES - 1)).toBe(false);
    expect(galleryNeedsCompression(GALLERY_SOURCE_MAX_BYTES)).toBe(false);
    expect(galleryNeedsCompression(GALLERY_SOURCE_MAX_BYTES + 1)).toBe(true);
  });
});

describe('galleryCompressionPlan', () => {
  it('tries quality 0.82, 0.7, 0.6 at the capped width before stepping down', () => {
    const plan = galleryCompressionPlan(2400);
    expect(plan.slice(0, 4)).toEqual([
      { width: GALLERY_FULL_WIDTH, quality: 0.82 },
      { width: GALLERY_FULL_WIDTH, quality: 0.7 },
      { width: GALLERY_FULL_WIDTH, quality: 0.6 },
      { width: 1280, quality: 0.82 },
    ]);
    expect(plan[plan.length - 1]).toEqual({ width: GALLERY_MIN_WIDTH, quality: 0.6 });
  });

  it('steps through the explicit dimension ladder', () => {
    const widths = [...new Set(galleryCompressionPlan(4000).map((attempt) => attempt.width))];
    expect(widths).toEqual([...GALLERY_DIMENSION_STEPS]);
  });

  it('starts at the source width when it sits between steps and never upscales', () => {
    const plan = galleryCompressionPlan(1200);
    expect(plan[0]).toEqual({ width: 1200, quality: 0.82 });
    expect(plan.every((attempt) => attempt.width <= 1200)).toBe(true);
    expect(plan[plan.length - 1]?.width).toBe(GALLERY_MIN_WIDTH);
  });

  it('keeps a source below the floor at its native width for every quality', () => {
    const plan = galleryCompressionPlan(400);
    expect(new Set(plan.map((attempt) => attempt.width))).toEqual(new Set([400]));
    expect(plan.map((attempt) => attempt.quality)).toEqual([...GALLERY_QUALITIES]);
  });

  it('handles a degenerate zero width without upscaling', () => {
    const plan = galleryCompressionPlan(0);
    expect(plan).toHaveLength(GALLERY_QUALITIES.length);
    expect(plan.every((attempt) => attempt.width === 1)).toBe(true);
  });
});

describe('galleryPhotoFilename', () => {
  it('replaces the extension with .webp but keeps dots in the stem', () => {
    expect(galleryPhotoFilename('IMG 1234.JPG')).toBe('IMG 1234.webp');
    expect(galleryPhotoFilename('a.b.png')).toBe('a.b.webp');
    expect(galleryPhotoFilename('photo')).toBe('photo.webp');
  });
});

describe('prepareGalleryPhoto', () => {
  it('rejects a non-image before attempting compression', async () => {
    const file = new File(['not an image'], 'notes.txt', { type: 'text/plain' });
    const err = await prepareGalleryPhoto(file).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GalleryPhotoError);
    expect((err as GalleryPhotoError).code).toBe('not_an_image');
  });
});
