/**
 * Client-side event-poster variants.
 *
 * Posters are resized once, in the admin's browser, at upload time. The worker
 * stores the resulting WebP blobs next to the original and the public pages
 * serve them with plain `srcset` — no Supabase image transforms and no
 * Cloudflare Images.
 *
 * Conventions (must match worker/supabase-storage.ts):
 *   events/{id}/poster.webp        original, exactly as the admin uploaded it
 *   events/{id}/poster-thumb.webp  640w  WebP, never upscaled
 *   events/{id}/poster-full.webp   1600w WebP, never upscaled
 */

export const POSTER_THUMB_WIDTH = 640;
export const POSTER_FULL_WIDTH = 1600;
export const POSTER_VARIANT_QUALITY = 0.82;

/** Blobs produced by `generatePosterVariants`, ready to append to FormData. */
export interface PosterVariantBlobs {
  thumb: Blob;
  full: Blob;
  /** Width of the encoded thumb (<= POSTER_THUMB_WIDTH; never upscaled). */
  thumbWidth: number;
  /** Width of the encoded full variant (<= POSTER_FULL_WIDTH). */
  fullWidth: number;
}

/** URL pair as returned by the events API (`poster_variants`). */
export interface PosterVariantUrls {
  thumb: string;
  full: string;
}

export class PosterVariantError extends Error {
  readonly code: 'not_an_image' | 'decode_failed' | 'canvas_unavailable' | 'encode_failed';

  constructor(code: PosterVariantError['code'], message: string) {
    super(message);
    this.name = 'PosterVariantError';
    this.code = code;
  }
}

/**
 * Fit `width` down to `targetWidth`, preserving aspect. A source already at or
 * below the target is returned unchanged (no upscaling).
 */
export function scaledSize(
  width: number,
  height: number,
  targetWidth: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  if (safeWidth <= targetWidth) return { width: safeWidth, height: safeHeight };
  const scale = targetWidth / safeWidth;
  return { width: targetWidth, height: Math.max(1, Math.round(safeHeight * scale)) };
}

/** `srcset` for the stored variants; undefined when there are no variants. */
export function posterVariantSrcSet(
  variants: PosterVariantUrls | null | undefined,
): string | undefined {
  if (!variants?.thumb || !variants?.full) return undefined;
  return `${variants.thumb} ${POSTER_THUMB_WIDTH}w, ${variants.full} ${POSTER_FULL_WIDTH}w`;
}

export interface PosterImageSources {
  src: string;
  srcSet: string | undefined;
}

/**
 * Sources for an event poster.
 *
 * `src` stays the original so browsers without `srcset` (and the no-JS
 * fallback) keep working. When variants exist the browser prefers them; if
 * they are missing — e.g. a poster uploaded before the variant pipeline — the
 * page can drop `srcSet` on the image's error event and the original loads.
 */
export function posterSources(
  posterUrl: string | null | undefined,
  variants: PosterVariantUrls | null | undefined,
): PosterImageSources | null {
  if (!posterUrl) return null;
  const srcSet = posterVariantSrcSet(variants);
  return srcSet ? { src: posterUrl, srcSet } : { src: posterUrl, srcSet: undefined };
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> decoder (older Safari, odd MIME types).
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new PosterVariantError('decode_failed', 'Could not read that image.'));
      el.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    if (err instanceof PosterVariantError) throw err;
    throw new PosterVariantError('decode_failed', 'Could not read that image.');
  }
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PosterVariantError('canvas_unavailable', 'Image resizing is unavailable here.');
  return ctx;
}

function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new PosterVariantError('encode_failed', 'Could not encode the image as WebP.'));
          return;
        }
        // Browsers without WebP encoding quietly fall back to PNG; do not
        // upload PNG bytes under a `.webp` key.
        if (blob.type && blob.type !== 'image/webp') {
          reject(new PosterVariantError('encode_failed', 'This browser cannot encode WebP.'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      quality,
    );
  });
}

async function renderAt(
  image: DecodedImage,
  targetWidth: number,
  quality: number,
): Promise<{ blob: Blob; width: number }> {
  const size = scaledSize(image.width, image.height, targetWidth);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvasContext(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, 0, 0, size.width, size.height);
  return { blob: await encodeWebp(canvas, quality), width: size.width };
}

async function renderVariant(
  image: DecodedImage,
  targetWidth: number,
): Promise<{ blob: Blob; width: number }> {
  return renderAt(image, targetWidth, POSTER_VARIANT_QUALITY);
}

/**
 * Generate the 640w thumb and capped-1600w full WebP blobs for a poster.
 *
 * Source images smaller than a breakpoint are encoded at their native width —
 * the pipeline never upscales a poster.
 */
export async function generatePosterVariants(file: Blob): Promise<PosterVariantBlobs> {
  const type = (file.type || '').toLowerCase();
  if (type && !type.startsWith('image/')) {
    throw new PosterVariantError('not_an_image', 'That file is not an image.');
  }

  const image = await decodeImage(file);
  try {
    if (image.width < 1 || image.height < 1) {
      throw new PosterVariantError('decode_failed', 'That image has no readable dimensions.');
    }
    const thumb = await renderVariant(image, POSTER_THUMB_WIDTH);
    // A small source can land on the same native width for both buckets;
    // reuse the encoded blob instead of encoding it twice.
    const full = thumb.width === scaledSize(image.width, image.height, POSTER_FULL_WIDTH).width
      ? thumb
      : await renderVariant(image, POSTER_FULL_WIDTH);

    return {
      thumb: thumb.blob,
      full: full.blob,
      thumbWidth: thumb.width,
      fullWidth: full.width,
    };
  } finally {
    image.close();
  }
}

// Gallery photos -------------------------------------------------------------
// Same browser-side pipeline as event posters, plus a hard cap on the uploaded
// original: sources up to 10 MB are uploaded untouched; larger sources are
// re-encoded as WebP (quality 0.82 → 0.7 → 0.6) and then stepped down in width
// until they fit. Nothing is uploaded if the floor is still too large.

export const GALLERY_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const GALLERY_THUMB_WIDTH = 640;
export const GALLERY_FULL_WIDTH = 1600;
export const GALLERY_VARIANT_QUALITY = 0.82;
/** Re-encode qualities, in order, at each width step. */
export const GALLERY_QUALITIES: readonly number[] = [0.82, 0.7, 0.6];
/** Width attempts after the first quality at the source width, largest first. */
export const GALLERY_DIMENSION_STEPS: readonly number[] = [1600, 1280, 1024, 800, 640, 480];
/** Compressed originals never step below this width (smaller sources stay as-is). */
export const GALLERY_MIN_WIDTH = 480;

/** One candidate encoding for an oversized gallery photo. */
export interface GalleryCompressionAttempt {
  width: number;
  quality: number;
}

/** True when the source must be re-encoded before upload. */
export function galleryNeedsCompression(sizeBytes: number): boolean {
  return sizeBytes > GALLERY_SOURCE_MAX_BYTES;
}

/**
 * Ordered compression candidates for an oversized source.
 *
 * The source width is capped at 1600 (never upscaled); each width is tried at
 * quality 0.82, then 0.7, then 0.6 before stepping to the next smaller width.
 * The last width is `GALLERY_MIN_WIDTH`, or the source width for sources
 * already smaller than that floor.
 */
export function galleryCompressionPlan(sourceWidth: number): GalleryCompressionAttempt[] {
  const start = Math.min(Math.max(1, Math.floor(sourceWidth)), GALLERY_FULL_WIDTH);
  const widths: number[] = [start];
  for (const step of GALLERY_DIMENSION_STEPS) {
    if (step < start && step !== widths[widths.length - 1]) widths.push(step);
  }
  const attempts: GalleryCompressionAttempt[] = [];
  for (const width of widths) {
    for (const quality of GALLERY_QUALITIES) attempts.push({ width, quality });
  }
  return attempts;
}

/** `.webp` name used for a re-encoded gallery original. */
export function galleryPhotoFilename(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '').trim();
  return `${base || 'photo'}.webp`;
}

/** Blobs ready to append to the item multipart form. */
export interface GalleryPhotoUpload {
  /** Original bytes when under the cap, otherwise the compressed WebP. */
  photo: File;
  /** 640w WebP variant, or null when this browser could not encode it. */
  thumb: Blob | null;
  /** 1600w WebP variant, or null when this browser could not encode it. */
  full: Blob | null;
  /** True when the original was re-encoded to fit the cap. */
  compressed: boolean;
  /** Why variants are missing; the original is still usable. */
  variantError: string | null;
  /** Width of the uploaded original. */
  width: number;
  /** Height of the uploaded original. */
  height: number;
}

export class GalleryPhotoError extends Error {
  readonly code: 'not_an_image' | 'decode_failed' | 'canvas_unavailable' | 'encode_failed' | 'too_large';

  constructor(code: GalleryPhotoError['code'], message: string) {
    super(message);
    this.name = 'GalleryPhotoError';
    this.code = code;
  }
}

function galleryError(err: unknown, fallback: GalleryPhotoError['code'], message: string): GalleryPhotoError {
  if (err instanceof GalleryPhotoError) return err;
  return new GalleryPhotoError(fallback, message);
}

/**
 * Decode once, compress the original only when it exceeds the cap, and derive
 * the 640w / 1600w WebP variants from the same decoded bitmap.
 *
 * Oversized images that cannot be brought under the cap throw
 * `GalleryPhotoError('too_large')` so the caller can stop before uploading.
 * A variant encoding failure is returned rather than thrown: the original is
 * still a valid upload and the backend treats the variants as optional.
 */
export async function prepareGalleryPhoto(
  file: File,
  onProgress?: (message: string) => void,
): Promise<GalleryPhotoUpload> {
  const type = (file.type || '').toLowerCase();
  if (type && !type.startsWith('image/')) {
    throw new GalleryPhotoError('not_an_image', 'That file is not an image.');
  }
  const needsCompression = galleryNeedsCompression(file.size);
  onProgress?.(needsCompression ? 'Compressing…' : 'Preparing photo…');

  let image: DecodedImage;
  try {
    image = await decodeImage(file);
  } catch (err) {
    if (needsCompression) {
      throw galleryError(err, 'decode_failed', 'Could not read that image, so it could not be compressed.');
    }
    return {
      photo: file,
      thumb: null,
      full: null,
      compressed: false,
      variantError: err instanceof PosterVariantError ? err.message : 'the image could not be decoded',
      width: 0,
      height: 0,
    };
  }

  try {
    let photo = file;
    let compressed = false;
    let finalWidth = image.width;

    if (needsCompression) {
      let chosen: { blob: Blob; width: number } | null = null;
      for (const attempt of galleryCompressionPlan(image.width)) {
        onProgress?.(`Compressing… (${attempt.width}px, quality ${attempt.quality})`);
        let encoded: { blob: Blob; width: number };
        try {
          encoded = await renderAt(image, attempt.width, attempt.quality);
        } catch (err) {
          throw galleryError(err, 'encode_failed', 'This browser could not compress that photo.');
        }
        if (encoded.blob.size <= GALLERY_SOURCE_MAX_BYTES) {
          chosen = encoded;
          break;
        }
      }
      if (!chosen) {
        throw new GalleryPhotoError(
          'too_large',
          'That photo is still over 10 MB after compression. Try a smaller image.',
        );
      }
      photo = new File([chosen.blob], galleryPhotoFilename(file.name), {
        type: 'image/webp',
        lastModified: Date.now(),
      });
      finalWidth = chosen.width;
      compressed = true;
    }

    onProgress?.('Preparing 640w and 1600w photo variants…');
    let thumb: Blob | null = null;
    let full: Blob | null = null;
    let variantError: string | null = null;
    try {
      const thumbWidth = Math.min(GALLERY_THUMB_WIDTH, finalWidth);
      const fullWidth = Math.min(GALLERY_FULL_WIDTH, finalWidth);
      const thumbVariant = await renderAt(image, thumbWidth, GALLERY_VARIANT_QUALITY);
      // A small source lands on the same width for both buckets; reuse it.
      const fullVariant = thumbWidth === fullWidth
        ? thumbVariant
        : await renderAt(image, fullWidth, GALLERY_VARIANT_QUALITY);
      thumb = thumbVariant.blob;
      full = fullVariant.blob;
    } catch (err) {
      variantError = err instanceof PosterVariantError
        ? err.message
        : 'the variants could not be encoded';
    }

    onProgress?.(variantError ? `Uploading the original only — ${variantError}` : 'Photo ready.');
    return {
      photo,
      thumb,
      full,
      compressed,
      variantError,
      width: finalWidth,
      height: scaledSize(image.width, image.height, finalWidth).height,
    };
  } finally {
    image.close();
  }
}
