import { describe, expect, it } from 'vitest';
import {
  generatePosterVariants,
  posterSources,
  posterVariantSrcSet,
  PosterVariantError,
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
